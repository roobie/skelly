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
import { raycast, type SolidAt } from '../core/raycast.ts';
import { skyAt, sunShadowStrength } from '../core/sky.ts';
import { DEFAULT_FOGGINESS, skyInWeather, type Weather } from '../core/weather.ts';
import { BACKGROUND_ZOMBIE_RATE, type Zombie } from '../core/zombies.ts';
import { cameraRotation, DamageFeedback } from '../game/damageFeedback.ts';
import type { Engine } from '../game/engine.ts';
import { PLAYER } from '../game/player.ts';
import {
  THIRD_PERSON_CAMERA_FOLLOW_ELEVATION,
  THIRD_PERSON_FOLLOW_DISTANCE,
  THIRD_PERSON_FOLLOW_HEIGHT,
} from '../game/thirdPersonOrbit.ts';
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
  readonly thirdPerson?: boolean;
  readonly thirdPersonOrbit?: { readonly yaw: number; readonly pitch: number };
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

const THIRD_PERSON_ORBIT_DISTANCE = Math.hypot(THIRD_PERSON_FOLLOW_DISTANCE, THIRD_PERSON_FOLLOW_HEIGHT);
const THIRD_PERSON_TARGET_DROP = 0.6;
const THIRD_PERSON_WALL_MARGIN = 0.15;

const thirdPersonCameraPosition = ({
  eye,
  yaw,
  blockSize,
  isSolid,
  orbit,
}: {
  readonly eye: Vec3;
  readonly yaw: number;
  readonly blockSize: number;
  readonly isSolid: SolidAt;
  readonly orbit?: { readonly yaw: number; readonly pitch: number };
}): Vec3 => {
  const cameraYaw = orbit?.yaw ?? yaw;
  const elevation = orbit ? THIRD_PERSON_CAMERA_FOLLOW_ELEVATION + orbit.pitch : undefined;
  const horizontalDistance =
    elevation === undefined ? THIRD_PERSON_FOLLOW_DISTANCE : THIRD_PERSON_ORBIT_DISTANCE * Math.cos(elevation);
  const offset: Vec3 = [
    Math.sin(cameraYaw) * horizontalDistance,
    elevation === undefined ? THIRD_PERSON_FOLLOW_HEIGHT : THIRD_PERSON_ORBIT_DISTANCE * Math.sin(elevation),
    Math.cos(cameraYaw) * horizontalDistance,
  ];
  const length = Math.hypot(...offset);
  const direction: Vec3 = [offset[0] / length, offset[1] / length, offset[2] / length];
  const maximum = length / blockSize;
  const hit = raycast(eye, direction, maximum, isSolid);
  const distance = Math.max(0, Math.min(maximum, (hit?.distance ?? maximum) - THIRD_PERSON_WALL_MARGIN / blockSize));
  return [eye[0] + direction[0] * distance, eye[1] + direction[1] * distance, eye[2] + direction[2] * distance];
};

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
  const held = new HeldItems(inventory, models, playerPalette, engine.sky.light);
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
  const lightPool = new LightPool(scene, held.warmUpTarget.scene);
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
  let thirdPerson = false;
  let meleeRecoilStrength = 0;
  let meleeRecoilTime = 0;
  const updateThirdPersonCamera = ({
    eye,
    stepOffset,
    yaw,
    orbit,
    target,
  }: {
    readonly eye: Vec3;
    readonly stepOffset: number;
    readonly yaw: number;
    readonly orbit?: { readonly yaw: number; readonly pitch: number };
    readonly target: Vec3;
  }): void => {
    const steppedEye: Vec3 = [eye[0], eye[1] + stepOffset / s, eye[2]];
    const [cx, cy, cz] = thirdPersonCameraPosition({
      eye: steppedEye,
      yaw,
      blockSize: s,
      isSolid: engine.isSolid,
      ...(orbit ? { orbit } : {}),
    });
    camera.position.set(cx * s, cy * s, cz * s);
    camera.lookAt(target[0] * s, target[1] * s + stepOffset - THIRD_PERSON_TARGET_DROP, target[2] * s);
  };
  const updateFirstPersonCamera = ({
    target,
    stepOffset,
    spectator,
    yaw,
    pitch,
  }: {
    readonly target: Vec3;
    readonly stepOffset: number;
    readonly spectator: PlayCameraFrame['spectator'];
    readonly yaw: number;
    readonly pitch: number;
  }): void => {
    camera.position.set(target[0] * s, target[1] * s + (spectator ? 0 : stepOffset), target[2] * s);
    camera.rotation.copy(cameraRotation(spectator?.pitch ?? pitch, spectator?.yaw ?? yaw, cameraRoll));
  };

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
      return { sky };
    },
    prepareLighting: (sky: ReturnType<typeof skyInWeather>) => {
      const skyVisibility = engine.skylight?.at([camera.position.x, camera.position.y, camera.position.z]) ?? 1;
      held.setSkyVisibility(skyVisibility);
      flashlight.daylightScale = flashlightDaylightScale(sky, skyVisibility);
      flashlight.shadowsAllowed = engine.shadows?.torchOn ?? false;
    },
    updateShadows: (sky: ReturnType<typeof skyInWeather>) => {
      engine.shadows?.update(sunShadowStrength(sky.lightIntensity), camera.position);
    },
    updateCamera: (frame: PlayCameraFrame, damage: HTMLElement) => {
      const { dt, body, paused, noclip, yaw, pitch, stridePhase, eye, spectator, sightImpaired } = frame;
      thirdPerson = frame.thirdPerson === true && spectator === undefined;
      const offset = cameraStepOffset.update(
        [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
        body.onGround,
        dt,
        noclip,
      );
      const travel = Math.hypot(body.vel[0], body.vel[2]) * s * dt;
      const moving = travel > 0.001 && !paused;
      const gaitPhase = stridePhase * Math.PI * 2;
      playerMeshes.sync({ body, yaw, stepOffset: offset, gaitPhase, moving, inventory, thirdPerson });
      const [ex, ey, ez] = spectator?.position ?? eye;
      const feedback = damageFeedback.step(dt);
      cameraRoll = spectator || thirdPerson ? 0 : feedback.roll;
      const target: Vec3 = [ex, ey, ez];
      if (thirdPerson) {
        updateThirdPersonCamera({
          eye,
          stepOffset: offset,
          yaw,
          target,
          ...(frame.thirdPersonOrbit ? { orbit: frame.thirdPersonOrbit } : {}),
        });
      } else {
        updateFirstPersonCamera({ target, stepOffset: offset, spectator, yaw, pitch });
      }
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
      mood.render(
        () => {
          if (!thirdPerson) {
            held.render(renderer, camera, engine.sky);
          }
        },
        thirdPerson ? undefined : held.opticLensFrame,
      );
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
