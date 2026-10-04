// Owned play presentation resources and read-only frame projections. Gameplay chooses
// actions/effects and samples input before calling this renderer; nothing here advances a session.
import type { BlockEntities } from '../core/blockEntities.ts';
import { hourOfDay } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import type { EntityStore } from '../core/entities.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_SHADOWS } from '../core/mood.ts';
import type { Body } from '../core/physics.ts';
import { skyAt, sunDirection, sunShadowStrength } from '../core/sky.ts';
import { DEFAULT_FOGGINESS, skyInWeather, type Weather } from '../core/weather.ts';
import type { Zombie } from '../core/zombies.ts';
import { cameraRotation, DamageFeedback } from '../game/damageFeedback.ts';
import type { Engine } from '../game/engine.ts';
import { PLAYER } from '../game/player.ts';
import { CaseEffects } from './caseEffects.ts';
import { Flashlight, flashlightDaylightScale } from './flashlight.ts';
import { FurnitureMeshes } from './furniture.ts';
import { type HeldHandlingFrame, HeldItems } from './hands.ts';
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
  readonly eye: Vec3;
}

export interface PlayWorldFrame {
  readonly calendar: number;
  readonly time: number;
  readonly lastZombieStep: number;
  readonly dt: number;
  readonly entities: BlockEntities;
  readonly zombies: EntityStore<Zombie>;
  readonly frozen: boolean;
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
  const held = new HeldItems(inventory, models, playerPalette);
  scene.add(caseEffects.mesh);
  const dispose = () => {
    piles.dispose();
    caseEffects.dispose();
    held.dispose();
  };
  page.addEventListener('pagehide', dispose);
  const furniture = new FurnitureMeshes(s);
  const playerMeshes = new PlayerMeshes(s, playerPalette);
  const flashlight = new Flashlight(scene);
  engine.shadows?.attachTorch(flashlight.light);
  scene.add(piles.group, furniture.group, playerMeshes.group);
  // Both actors implement the same presentation contract. Gameplay keeps synchronous
  // death/sever callbacks so an actor is removed before a subsequent sync/prune.
  const zombieMeshes: ZombieRenderer = config.actors === 'detailed' ? new MobActorMeshes(s) : new ZombieMeshes(s);
  zombieMeshes.setWorld?.(engine.isSolid, s);
  scene.add(zombieMeshes.group);
  const cameraStepOffset = new StepOffset(PLAYER.stepHeight);
  const damageFeedback = new DamageFeedback();
  let cameraRoll = 0;
  let gaitPhase = 0;
  let meleeRecoilStrength = 0;
  let meleeRecoilTime = 0;

  return {
    models,
    piles,
    caseEffects,
    furniture,
    playerMeshes,
    held,
    flashlight,
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
    syncWorld: ({ calendar, time, lastZombieStep, dt, entities, zombies, frozen }: PlayWorldFrame) => {
      const hour = hourOfDay(calendar);
      const sky = skyInWeather(skyAt(hour), weather);
      applySky(engine.sky, sky);
      engine.mood?.setSky(sky);
      piles.sync(inventory);
      furniture.sync(entities);
      const alpha = Math.max(0, Math.min(1, (time - lastZombieStep) * 20));
      zombieMeshes.setCamera?.(camera);
      zombieMeshes.sync(zombies, dt, alpha, frozen);
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
      engine.shadows?.update(sunShadowStrength(sunDirection(hour)[1], sky.lightIntensity), camera.position);
    },
    updateCamera: (frame: PlayCameraFrame, damage: HTMLElement) => {
      const { dt, body, paused, noclip, yaw, pitch, eye } = frame;
      const offset = cameraStepOffset.update(
        [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
        body.onGround,
        dt,
        noclip,
      );
      const travel = Math.hypot(body.vel[0], body.vel[2]) * s * dt;
      const moving = travel > 0.001 && !paused;
      if (moving) {
        gaitPhase += (travel / 0.6) * Math.PI;
      }
      playerMeshes.sync({ body, yaw, stepOffset: offset, gaitPhase, moving, inventory });
      const [ex, ey, ez] = eye;
      camera.position.set(ex * s, ey * s + offset, ez * s);
      const feedback = damageFeedback.step(dt);
      cameraRoll = feedback.roll;
      camera.rotation.copy(cameraRotation(pitch, yaw, feedback.roll));
      damage.style.opacity = String(feedback.vignetteOpacity);
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
      flashlight.update(registry, light, held, camera);
    },
    render: (): number | null => {
      if (!renderer) {
        return null;
      }
      if (!mood) {
        return null;
      }
      const start = performance.now();
      mood.render(() => held.render(renderer, camera, engine.sky));
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
