// Owned play presentation resources and read-only frame projections. Gameplay chooses
// actions/effects and samples input before calling this renderer; nothing here advances a session.
import type { BlockEntities } from '../core/blockEntities.ts';
import { hourOfDay } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import { dayCycleFor } from '../core/dayPhase.ts';
import type { EntityStore } from '../core/entities.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_SHADOWS } from '../core/mood.ts';
import type { Body } from '../core/physics.ts';
import { skyAt, sunDirection, sunShadowStrength } from '../core/sky.ts';
import { DEFAULT_FOGGINESS, skyInWeather, type Weather } from '../core/weather.ts';
import { BACKGROUND_ZOMBIE_RATE, type Zombie } from '../core/zombies.ts';
import { cameraRotation, DamageFeedback } from '../game/damageFeedback.ts';
import type { Engine } from '../game/engine.ts';
import { PLAYER } from '../game/player.ts';
import { CaseEffects } from './caseEffects.ts';
import { Flashlight, flashlightDaylightScale } from './flashlight.ts';
import { FurnitureMeshes } from './furniture.ts';
import { Gore } from './gore.ts';
import { type HeldHandlingFrame, HeldItems } from './hands.ts';
import { ImpactEffects } from './impactEffects.ts';
import { ItemThrows } from './itemThrows.ts';
import { LightPool } from './lightPool.ts';
import { applyLook } from './look.ts';
import { MobActorMeshes, type ZombieRenderer } from './mobActors.ts';
import { ModelLibrary } from './models.ts';
import { PileMeshes } from './piles.ts';
import { PlayerMeshes } from './playerFigure.ts';
import { applySky } from './sky.ts';
import { StepOffset } from './stepOffset.ts';
import { ZombieMeshes } from './zombies.ts';

export interface PlayCameraFrame {
  readonly dt: number;
  readonly body: Readonly<Body>;
  readonly paused: boolean;
  readonly noclip: boolean;
  readonly yaw: number;
  readonly pitch: number;
  readonly stridePhase: number;
  readonly eye: Vec3;
  readonly spectator?: { readonly position: Vec3; readonly yaw: number; readonly pitch: number };
  readonly sightImpaired: boolean;
}

export interface PlayWorldFrame {
  readonly calendar: number;
  readonly time: number;
  readonly playerEye: Vec3;
  /** Where zombie attacks aim, in metres (core/zombies.ts, `PLAYER_CHEST_METRES`). */
  readonly playerChest: Vec3;
  readonly lastZombieStep: number;
  readonly lastBackgroundStep: number;
  readonly dt: number;
  readonly entities: BlockEntities;
  readonly zombies: EntityStore<Zombie>;
  readonly frozen: boolean;
  readonly perceptionLabels: boolean;
}

type PlayViewEngine = Readonly<
  Pick<
    Engine,
    | 'config'
    | 'registry'
    | 'renderer'
    | 'meshes'
    | 'scene'
    | 'camera'
    | 'mood'
    | 'shadows'
    | 'sky'
    | 'isSolid'
    | 'entities'
    | 'skylight'
  >
>;

export const createPlayView = (
  engine: PlayViewEngine,
  inventory: Inventory,
  report: (message: string) => void,
  page: Pick<EventTarget, 'addEventListener'> = globalThis,
) => {
  const { config, registry, renderer, meshes, scene, camera, mood, shadows } = engine;
  const dayCycle = dayCycleFor(registry.dayCycle);
  const s = config.scale.blockSize;
  // Play's look defaults are presentation; benchmark mode never applies them.
  if (renderer) {
    if (mood === undefined) {
      throw new Error('rendering resources are incomplete');
    }
    if (shadows === undefined) {
      throw new Error('rendering resources are incomplete');
    }
    applyLook(renderer, meshes, DEFAULT_LOOK);
    mood.restore(DEFAULT_MOOD);
    shadows.restore(DEFAULT_SHADOWS);
  }
  const weather: Weather = { fogginess: DEFAULT_FOGGINESS };
  const models = new ModelLibrary(registry, report);
  const playerPalette = registry.figures.get('player')!.palette;
  const piles = new PileMeshes(s, models, config.seed);
  const caseEffects = new CaseEffects(s, models);
  const gore = new Gore(s, config.seed);
  const itemThrows = new ItemThrows(registry, models, s);
  const targetCell = config.debug
    ? (block: Vec3) => {
        const entity = engine.entities.at(...block);
        return entity !== undefined && engine.registry.furniture.get(entity.type)?.shotTarget === true;
      }
    : undefined;
  const impactEffects = new ImpactEffects(s, engine.isSolid, targetCell);
  const held = new HeldItems(inventory, models, playerPalette);
  scene.add(caseEffects.mesh, impactEffects.group, itemThrows.group, gore.group);
  const dispose = () => {
    piles.dispose();
    caseEffects.dispose();
    gore.dispose();
    impactEffects.dispose();
    itemThrows.dispose();
    held.dispose();
  };
  page.addEventListener('pagehide', dispose);
  const furniture = new FurnitureMeshes(s);
  const playerMeshes = new PlayerMeshes(s, playerPalette);
  const flashlight = new Flashlight(scene);
  const lightPool = new LightPool(scene);
  engine.shadows?.attachTorch(flashlight.light);
  scene.add(piles.group, furniture.group, playerMeshes.group);
  // Both actors implement the same presentation contract. Gameplay keeps synchronous
  // death/sever callbacks so an actor is removed before a subsequent sync/prune.
  const zombieMeshes: ZombieRenderer =
    config.actors === 'detailed'
      ? new MobActorMeshes(s, undefined, {
          includeAmalgam: true,
          amalgamType: registry.zombies.get('amalgam'),
          onFleshLanded: (centre) => gore.landed(centre),
          bloodiness: (zombie) => gore.severity(zombie),
        })
      : new ZombieMeshes(s);
  zombieMeshes.setWorld?.(engine.isSolid, s);
  scene.add(zombieMeshes.group);
  const cameraStepOffset = new StepOffset(PLAYER.stepHeight);
  const damageFeedback = new DamageFeedback();
  let cameraRoll = 0;
  let meleeRecoilStrength = 0;
  let meleeRecoilTime = 0;

  return {
    models,
    piles,
    caseEffects,
    gore,
    itemThrows,
    impactEffects,
    furniture,
    playerMeshes,
    held,
    flashlight,
    lightPool,
    zombieMeshes,
    weather,
    dispose,
    get cameraRoll() {
      return cameraRoll;
    },
    damage: (amount: number) => damageFeedback.hit(amount),
    recoil: (impulse: number) => {
      meleeRecoilStrength = Math.max(0, Math.min(1, impulse / 12));
      meleeRecoilTime = 0.08;
    },
    syncWorld: ({
      calendar,
      time,
      playerEye,
      playerChest,
      lastZombieStep,
      lastBackgroundStep,
      dt,
      entities,
      zombies,
      frozen,
      perceptionLabels,
    }: PlayWorldFrame) => {
      itemThrows.update(dt);
      const hour = hourOfDay(calendar);
      const sky = skyInWeather(skyAt(hour, dayCycle), weather);
      applySky(engine.sky, sky);
      engine.mood?.setSky(sky);
      piles.sync(inventory);
      furniture.sync(entities);
      const alpha = Math.max(0, Math.min(1, (time - lastZombieStep) * 20));
      const backgroundAlpha = Math.max(0, Math.min(1, (time - lastBackgroundStep) * BACKGROUND_ZOMBIE_RATE));
      zombieMeshes.setCamera?.(camera);
      zombieMeshes.setPlayerEyePosition?.(playerEye);
      zombieMeshes.setPlayerChestPosition?.(playerChest);
      zombieMeshes.setPerceptionLabels?.(perceptionLabels);
      zombieMeshes.sync(zombies, dt, alpha, frozen, backgroundAlpha, time);
      return { hour, sky };
    },
    prepareLighting: (sky: ReturnType<typeof skyInWeather>) => {
      flashlight.daylightScale = flashlightDaylightScale(
        sky,
        engine.skylight?.at([camera.position.x, camera.position.y, camera.position.z]) ?? 1,
      );
      flashlight.shadowsAllowed = engine.shadows?.torchOn ?? false;
    },
    updateShadows: (hour: number, sky: ReturnType<typeof skyInWeather>) => {
      engine.shadows?.update(sunShadowStrength(sunDirection(hour, dayCycle)[1], sky.lightIntensity), camera.position);
    },
    updateCamera: (frame: PlayCameraFrame, damage: HTMLElement) => {
      const { dt, body, paused, noclip, yaw, pitch, stridePhase, eye, spectator, sightImpaired } = frame;
      const offset = cameraStepOffset.update(
        [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
        body.onGround,
        dt,
        noclip,
      );
      const travel = Math.hypot(body.vel[0], body.vel[2]) * s * dt;
      const moving = travel > 0.001 && !paused;
      const gaitPhase = stridePhase * Math.PI * 2;
      playerMeshes.sync({ body, yaw, stepOffset: offset, gaitPhase, moving, inventory });
      const [ex, ey, ez] = spectator?.position ?? eye;
      camera.position.set(ex * s, ey * s + (spectator ? 0 : offset), ez * s);
      const feedback = damageFeedback.step(dt);
      cameraRoll = spectator ? 0 : feedback.roll;
      camera.rotation.copy(cameraRotation(spectator?.pitch ?? pitch, spectator?.yaw ?? yaw, cameraRoll));
      damage.style.opacity = String(Math.max(feedback.vignetteOpacity, sightImpaired ? 0.2 : 0));
    },
    updateHeld: (
      dt: number,
      pose: MeleePoseFrame,
      light: Item | undefined,
      handling: HeldHandlingFrame = { firearms: [] },
    ) => {
      meleeRecoilTime = Math.max(0, meleeRecoilTime - dt);
      const recoil = meleeRecoilStrength * Math.max(0, Math.min(1, meleeRecoilTime / 0.08));
      held.update(camera, pose, recoil, handling);
      flashlight.update({ registry, lit: light, held, camera, inventory });
      lightPool.update(inventory, { held, camera, blockSize: s, daylightScale: flashlight.daylightScale });
    },
    render: (): number | null => {
      if (!renderer) {
        return null;
      }
      if (!mood) {
        return null;
      }
      const start = performance.now();
      mood.render(() => held.render(renderer, camera, engine.sky), held.opticLensFrame);
      return performance.now() - start;
    },
    warmUp: () => {
      if (!mood) {
        return Promise.resolve();
      }
      if (!shadows) {
        return Promise.resolve();
      }
      return shadows.warmUp(mood, [{ scene, camera }, held.warmUpTarget]);
    },
  };
};
