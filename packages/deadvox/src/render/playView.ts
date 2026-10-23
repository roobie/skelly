// Owned play presentation resources and read-only frame projections. Gameplay chooses
// actions/effects and samples input before calling this renderer; nothing here advances a session.
import type { AcidGlobState } from '../core/acidGlob.ts';
import type { AcidPuddleState } from '../core/acidPuddle.ts';
import type { BlockEntities } from '../core/blockEntities.ts';
import { hourOfDay } from '../core/clock.ts';
import { requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import type { EntityStore } from '../core/entities.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { lookDefaultsOf } from '../core/lookDefaults.ts';
import type { BlockJolt } from '../core/meleeCombat.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { DEFAULT_SHADOWS, lookOf, moodOf } from '../core/mood.ts';
import type { Body } from '../core/physics.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import { reachTuning } from '../core/reach.ts';
import type { BodyTuningDef, NightVision } from '../core/schema.ts';
import { firearmsCombatTuning } from '../core/skillTraining.ts';
import { skyAt, sunShadowStrength } from '../core/sky.ts';
import { skyInWeather, type Weather } from '../core/weather.ts';
import { amalgamTypeOf, figureSeedPool } from '../core/zombieFigure.ts';
import { BACKGROUND_ZOMBIE_RATE, type Zombie } from '../core/zombies.ts';
import { cameraRotation, DamageFeedback } from '../game/damageFeedback.ts';
import type { Engine } from '../game/engine.ts';
import { PainCue } from '../game/painCue.ts';
import { PLAYER } from '../game/player.ts';
import { THIRD_PERSON_CAMERA } from '../game/thirdPersonOrbit.ts';
import { AcidEffects } from './acidEffects.ts';
import { createAvatarStudy } from './avatarStudy.ts';
import { BlastFlashes } from './blastFlashes.ts';
import { CarriedPiece } from './carriedPiece.ts';
import { CaseEffects } from './caseEffects.ts';
import { AuthoredDecals } from './decals.ts';
import { DrawCounters } from './drawCounters.ts';
import { Flashlight, flashlightDaylightScale, spillSwitchFromSearch } from './flashlight.ts';
import { FurnitureMeshes } from './furniture.ts';
import { Gore } from './gore.ts';
import { type HeldHandlingFrame, HeldItems } from './hands.ts';
import { ImpactEffects } from './impactEffects.ts';
import { ItemPictures } from './itemPictures.ts';
import { ItemThrows } from './itemThrows.ts';
import { LightPool } from './lightPool.ts';
import { applyLook } from './look.ts';
import { MobActorMeshes, type ZombieRenderer } from './mobActors.ts';
import { modelMaterialWarmUp } from './modelMaterials.ts';
import { ModelLibrary } from './models.ts';
import { createNightVisionFlareUpdate } from './nightVisionFlare.ts';
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
  readonly stance: PlayerStance;
  readonly eye: Vec3;
  readonly spectator?: { readonly position: Vec3; readonly yaw: number; readonly pitch: number };
  readonly thirdPerson?: boolean;
  readonly thirdPersonOrbit?: { readonly yaw: number; readonly pitch: number };
  readonly sightImpaired: boolean;
  /** The drug vignette from active doses, 0 to 1, before the player's setting; none when absent. */
  readonly drugVignette?: number;
  /** The view through worn night-vision goggles that are on and charged; none when absent. */
  readonly nightVision?: NightVision | undefined;
  /** Felt pain's tier, for the pain cue; undefined below the first. */
  readonly painTier?: BodyTuningDef['pain']['tiers'][number] | undefined;
}

/** The hurt vignette and the sight-impairment dimming belong to the player's eyes, so a detached view has none. */
const damageOpacity = (detached: boolean, vignette: number, sightImpaired: boolean): string =>
  detached ? '0' : String(Math.max(vignette, sightImpaired ? 0.2 : 0));

/** The drug vignette and night vision belong to the player's eyes, so a spectator gets neither. */
const setViewEffects = (mood: Engine['mood'], frame: PlayCameraFrame): NightVision | undefined => {
  const player = frame.spectator === undefined;
  const nightVision = player ? frame.nightVision : undefined;
  mood?.setDrugVignette(player ? (frame.drugVignette ?? 0) : 0);
  mood?.setNightVision(nightVision);
  return nightVision;
};

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
  readonly acidGlobs: readonly Readonly<AcidGlobState>[];
  readonly acidPuddles: readonly Readonly<AcidPuddleState>[];
  readonly frozen: boolean;
  readonly perceptionLabels: boolean;
}

const THIRD_PERSON_ORBIT_DISTANCE = Math.hypot(THIRD_PERSON_CAMERA.followDistance, THIRD_PERSON_CAMERA.followHeight);
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
  const elevation = orbit ? THIRD_PERSON_CAMERA.followElevation + orbit.pitch : undefined;
  const horizontalDistance =
    elevation === undefined ? THIRD_PERSON_CAMERA.followDistance : THIRD_PERSON_ORBIT_DISTANCE * Math.cos(elevation);
  const offset: Vec3 = [
    Math.sin(cameraYaw) * horizontalDistance,
    elevation === undefined ? THIRD_PERSON_CAMERA.followHeight : THIRD_PERSON_ORBIT_DISTANCE * Math.sin(elevation),
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
    | 'site'
    | 'scenario'
  >
>;

export const createPlayView = (
  engine: PlayViewEngine,
  inventory: Inventory,
  report: (message: string) => void,
  page: Pick<EventTarget, 'addEventListener'> = globalThis,
) => {
  const { config, registry, renderer, meshes, scene, camera, mood, shadows } = engine;
  const drawCounters = config.debug && renderer ? new DrawCounters(renderer) : undefined;
  const dayCycle = requireDayCycle(registry);
  const s = config.scale.blockSize;
  const models = new ModelLibrary(registry, report);
  let pictures: ItemPictures | undefined;
  // Play's look defaults are presentation; benchmark mode never applies them.
  if (renderer) {
    pictures = new ItemPictures(
      registry,
      models,
      registry.graphics.get(CORE_CONTENT_IDS.coreGraphics)!.itemPictureCacheCapacity,
    );
    if (mood === undefined) {
      throw new Error('rendering resources are incomplete');
    }
    if (shadows === undefined) {
      throw new Error('rendering resources are incomplete');
    }
    const look = lookDefaultsOf(registry);
    applyLook(renderer, meshes, lookOf(look));
    mood.restore(moodOf(look));
    shadows.restore(DEFAULT_SHADOWS);
  }
  const weather: Weather = { fogginess: dayCycle.weather.defaultFogginess };
  const playerFigure = registry.figures.get(CORE_CONTENT_IDS.player)!;
  const playerPalette = playerFigure.palette;
  const piles = new PileMeshes(s, models, config.seed, meshes);
  const caseEffects = new CaseEffects(s, models);
  const gore = new Gore(s, config.seed);
  const decals =
    engine.scenario && config.authoredDecals
      ? new AuthoredDecals(engine.site?.authoredPlacements ?? [], {
          seed: config.seed,
          blockSize: s,
          ageGameSeconds: engine.scenario.outbreakAgeGameHours,
          limit: engine.scenario.decalLimit,
        })
      : undefined;
  if (decals) {
    scene.add(decals.mesh);
  }
  const itemThrows = new ItemThrows(registry, models, s, config.seed);
  const targetCell = config.debug
    ? (block: Vec3) => {
        const entity = engine.entities.at(...block);
        return entity !== undefined && engine.registry.furniture.get(entity.type)?.shotTarget === true;
      }
    : undefined;
  const impactEffects = new ImpactEffects(
    s,
    firearmsCombatTuning(registry).shotTraceRangeBlocks,
    engine.isSolid,
    targetCell,
  );
  const blastFlashes = new BlastFlashes();
  const acidEffects = new AcidEffects(s);
  const held = new HeldItems(inventory, models, playerPalette, engine.sky.light);
  scene.add(caseEffects.mesh, impactEffects.group, itemThrows.group, gore.group, blastFlashes.group, acidEffects.group);
  const dispose = () => {
    pictures?.dispose();
    piles.dispose();
    caseEffects.dispose();
    gore.dispose();
    decals?.dispose();
    impactEffects.dispose();
    itemThrows.dispose();
    blastFlashes.dispose();
    acidEffects.dispose();
    flashlight.dispose();
    held.dispose();
  };
  page.addEventListener('pagehide', dispose);
  const furniture = new FurnitureMeshes(s, meshes);
  const carriedPiece = new CarriedPiece(
    inventory.entities,
    (entity, def) => furniture.pieceMesh(entity, def),
    reachTuning(registry).furnitureMove.carriedView,
  );
  held.attach(carriedPiece.group);
  const playerMeshes = new PlayerMeshes(s, playerFigure, models);
  const flashlight = new Flashlight(
    scene,
    registry.senses.get(CORE_CONTENT_IDS.player)!.light.renderedBeamLimit,
    spillSwitchFromSearch(globalThis.location?.search ?? ''),
  );
  let cameraDaylightScale = 1;
  const lightPool = new LightPool(scene, held.warmUpTarget.scene);
  engine.shadows?.attachTorches(flashlight.lights);
  scene.add(piles.group, furniture.group, playerMeshes.group, modelMaterialWarmUp(true));
  const avatarStudy = createAvatarStudy(scene, config.debug, s, models);
  // Both actors implement the same presentation contract. Gameplay keeps synchronous
  // death/sever callbacks so an actor is removed before a subsequent sync/prune.
  const zombieMeshes: ZombieRenderer =
    config.actors === 'detailed'
      ? new MobActorMeshes(s, undefined, {
          canvas: engine.renderer?.domElement,
          reveal: meshes,
          figureSeeds: figureSeedPool(registry.zombies),
          includeAmalgam: true,
          amalgamType: amalgamTypeOf(registry.zombies),
          onFleshLanded: (centre) => gore.landed(centre),
          bloodiness: (zombie) => gore.severity(zombie),
        })
      : new ZombieMeshes(s, undefined, meshes);
  zombieMeshes.setWorld?.(engine.isSolid, s);
  scene.add(zombieMeshes.group);
  const cameraStepOffset = new StepOffset(PLAYER.stepHeight);
  const damageFeedback = new DamageFeedback();
  const painCue = new PainCue();
  let cameraRoll = 0;
  let thirdPerson = false;
  /** The spectator camera leaves the player's own view (arms, held item, vignettes) with the avatar. */
  let detached = false;
  let meleeRecoilStrength = 0;
  let meleeRecoilTime = 0;
  let meleeRecoilDuration = 0;
  let deflectRise = 0;
  let deflectTime = 0;
  let deflectDuration = 0;
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

  let nightVision: NightVision | undefined;
  const updateFlare = createNightVisionFlareUpdate({
    mood,
    pool: lightPool,
    fireballs: () => blastFlashes.fireballs(),
    camera,
    isSolid: engine.isSolid,
    blockSize: s,
  });

  /** Steps the hit and pain cues; a paused game starts no new pain pulse, and the one under way fades out. */
  const stepBodyCues = (dt: number, paused: boolean, spectator: boolean, painTier: PlayCameraFrame['painTier']) => {
    const pain = painCue.step(dt, paused ? undefined : painTier);
    engine.mood?.setPainDesaturation(spectator ? 0 : pain.desaturation);
    return damageFeedback.step(dt, pain.settle);
  };

  return {
    models,
    pictures,
    get drawSubmission() {
      return drawCounters?.snapshot ?? null;
    },
    piles,
    caseEffects,
    gore,
    itemThrows,
    impactEffects,
    blastFlashes,
    acidEffects,
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
      meleeRecoilDuration = 0.08;
      meleeRecoilTime = meleeRecoilDuration;
    },
    // A block shares the hit recoil so a parried blow jolts the held weapon the same way; the hurt flash
    // separately scales with whatever damage got through. A zero-strength or zero-duration cue leaves the envelope alone, and a
    // finished envelope's strength is not carried into the next one. The arm rise is its own envelope with the same
    // rules, because it outlasts the jolt.
    block: ({ strength, realSeconds, rise, riseRealSeconds }: BlockJolt) => {
      const cue = Math.max(0, Math.min(1, strength));
      if (cue > 0 && realSeconds > 0) {
        meleeRecoilStrength = meleeRecoilTime > 0 ? Math.max(meleeRecoilStrength, cue) : cue;
        meleeRecoilDuration = realSeconds;
        meleeRecoilTime = realSeconds;
      }
      if (rise > 0 && riseRealSeconds > 0) {
        deflectRise = deflectTime > 0 ? Math.max(deflectRise, rise) : rise;
        deflectDuration = riseRealSeconds;
        deflectTime = riseRealSeconds;
      }
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
      acidGlobs,
      acidPuddles,
      frozen,
      perceptionLabels,
    }: PlayWorldFrame) => {
      itemThrows.update(time, inventory);
      blastFlashes.update(dt);
      acidEffects.sync(acidGlobs, acidPuddles, registry.zombies, dt);
      const hour = hourOfDay(calendar);
      const sky = skyInWeather(skyAt(hour, dayCycle), weather, dayCycle.weather);
      piles.sync(inventory, itemThrows.hiddenItemUids);
      furniture.sync(entities);
      decals?.sync(entities);
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
      const cameraPosition: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const skyVisibility = engine.skylight?.at(cameraPosition) ?? 1;
      applySky(engine.sky, sky, skyVisibility);
      engine.mood?.setSky(sky, skyVisibility);
      held.setSkyVisibility(skyVisibility);
      cameraDaylightScale = flashlightDaylightScale(sky, skyVisibility);
      engine.skylight?.setDaylight(sky);
      flashlight.daylightScale = engine.skylight ? 1 : flashlightDaylightScale(sky);
      flashlight.shadowsAllowed = engine.shadows?.torchOn ?? false;
    },
    updateShadows: (sky: ReturnType<typeof skyInWeather>) => {
      engine.shadows?.update(sunShadowStrength(sky.lightIntensity), camera.position);
    },
    updateCamera: (frame: PlayCameraFrame, damage: HTMLElement) => {
      const { dt, body, paused, noclip, yaw, pitch, stridePhase, stance, eye, spectator, sightImpaired } = frame;
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
      detached = spectator !== undefined;
      playerMeshes.sync({
        body,
        yaw,
        stepOffset: offset,
        gaitPhase,
        moving,
        stance,
        dt,
        inventory,
        thirdPerson: thirdPerson || detached,
      });
      avatarStudy.sync({ bodyPosition: body.pos, yaw, stepOffset: offset, visible: thirdPerson || detached });
      const [ex, ey, ez] = spectator?.position ?? eye;
      const feedback = stepBodyCues(dt, paused, spectator !== undefined, frame.painTier);
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
      damage.style.opacity = damageOpacity(detached, feedback.vignetteOpacity, sightImpaired);
      nightVision = setViewEffects(engine.mood, frame);
    },
    updateHeld: (
      dt: number,
      pose: MeleePoseFrame,
      light: Item | undefined,
      handling: HeldHandlingFrame = { firearms: [] },
    ) => {
      meleeRecoilTime = Math.max(0, meleeRecoilTime - dt);
      const recoil =
        meleeRecoilDuration > 0
          ? meleeRecoilStrength * Math.max(0, Math.min(1, meleeRecoilTime / meleeRecoilDuration))
          : 0;
      deflectTime = Math.max(0, deflectTime - dt);
      const lift =
        deflectDuration > 0 && deflectTime > 0
          ? deflectRise * Math.sin(Math.PI * (1 - deflectTime / deflectDuration))
          : 0;
      carriedPiece.update(dt, camera.quaternion);
      held.update(camera, pose, recoil, { ...handling, lift });
      flashlight.update({ registry, lit: light, held, camera, inventory });
      lightPool.update(inventory, { held, piles, camera, blockSize: s, daylightScale: cameraDaylightScale });
      updateFlare(nightVision, dt);
    },
    render: (): number | null => {
      if (!renderer) {
        return null;
      }
      if (!mood) {
        return null;
      }
      const start = performance.now();
      const ownView = !(thirdPerson || detached);
      drawCounters?.begin();
      try {
        mood.render(
          () => {
            if (ownView) {
              held.render(renderer, camera, engine.sky);
            }
          },
          ownView ? held.opticLensFrame : undefined,
        );
      } finally {
        drawCounters?.end();
      }
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
