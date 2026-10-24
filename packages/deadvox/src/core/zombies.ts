import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { zombieFigure as humanoidFigure } from '@mobgen/mob/shamblerFigure.ts';
import { type AcidGlobState, advanceAcidGlob } from './acidGlob.ts';
import { type AcidPuddleState, feetInAcidPuddle } from './acidPuddle.ts';
import {
  carveAround,
  centralCell,
  fleshHit,
  type MissingFlesh,
  missingFlesh,
  protectedCoreCell,
} from './amalgamCarving.ts';
import {
  AMALGAM_FIGURE_SEED,
  amalgamCollisionEnvelope,
  amalgamFigureForType,
  amalgamStrikeOrigin,
} from './amalgamFigure.ts';
import { AmalgamShape } from './amalgamShape.ts';
import type { BodyRegion, DamageKind, MeleeDamageKind } from './body.ts';
import type { MeleeBlocker } from './collision.ts';
import type { ZombieDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ExposureContact } from './damageExposure.ts';
import type { DayPhase, DayPhaseState } from './dayPhase.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { advanceShamblerFootsteps, initialShamblerFootstepClock, type ShamblerFootstepClock } from './footsteps.ts';
import { lightSenseRangeScale } from './lights.ts';
import type { MeleeMotion } from './meleeMotion.ts';
import { type Modifier, modified } from './modifiers.ts';
import {
  type Body,
  type BodyShape,
  bodyOverlapsTerrain,
  CONTACT_SKIN,
  type PhysicsParams,
  type ShapeOf,
  separateBodies,
  separateBodyPair,
  stepBody,
  stepBodyHorizontal,
} from './physics.ts';
import type { PlayerStance } from './playerStance.ts';
import { Rng, type RngState } from './random.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { MeleeCharge, SenseDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { type SolidBricks, testedBricks } from './solidBricks.ts';
import type { SoundId } from './soundEvents.ts';
import { soundOcclusion } from './soundOcclusion.ts';
import { zombieBodyDimensions as measureZombieBody } from './spawnClearance.ts';
import { updateStepOffset } from './stepOffset.ts';
import {
  advanceStanceWeight,
  HIT_FLINCH_DURATION,
  posedMouth,
  targetStanceWeight,
  zombiePoseInputFor,
} from './zombiePose.ts';
import { ZOMBIE_REGION_NAMES } from './zombieRegionNames.ts';
import {
  type PosedBoneBox,
  posedAmalgamRegionBoxes,
  posedRegionHit,
  posedShamblerRegionBoxes,
  rayBoxEntry,
  type ZombieHitRegion,
  type ZombieRegion,
  type ZombieRegions,
} from './zombieRegions.ts';

export type PlayerMovement = 'walking' | 'jogging' | 'sprinting' | 'still';

/** A lowered stance's tuning, or undefined standing. */
export const loweredStanceTuning = <T>(tuning: { crouch: T; prone: T }, stance: PlayerStance | undefined) => {
  switch (stance) {
    case 'crouching':
      return tuning.crouch;
    case 'prone':
      return tuning.prone;
    default:
      return;
  }
};
export type ZombieTier = 'active' | 'background' | 'unloaded';
export const BACKGROUND_ZOMBIE_RATE = 2;
export const BACKGROUND_ZOMBIE_SLICE_COUNT = 30;
export const BACKGROUND_ZOMBIE_SLICE_RATE = BACKGROUND_ZOMBIE_RATE * BACKGROUND_ZOMBIE_SLICE_COUNT;
export type ZombieMode = 'idle' | 'stroll' | 'hesitate' | 'search' | 'chase' | 'investigate' | 'return';
export const zombieBodyDimensions = measureZombieBody;

const requiredFigureSeeds = (type: ZombieDef): readonly number[] => {
  if (type.figureSeeds === undefined) {
    throw new Error(`Zombie type ${type.id} is missing its authored figureSeeds`);
  }
  return type.figureSeeds;
};

const requiredGrabBand = (type: ZombieDef): number => {
  if (type.attack.grabBandMetres === undefined) {
    throw new Error(`Zombie type ${type.id} is missing its authored attack.grabBandMetres`);
  }
  return type.attack.grabBandMetres;
};

export const zombieAttackReachForType = (type: ZombieDef, figureSeed = AMALGAM_FIGURE_SEED): number =>
  type.model === 'amalgam' ? type.attack.reach * amalgamFigureForType(type, figureSeed).scale : type.attack.reach;

/**
 * Effective eye-to-hand reach in metres, including leaning into a swing; weapon reach extends beyond it.
 * It applies to every melee weapon, not only the bare-handed attack, so it stays in code rather than on the fists class.
 */
export const PLAYER_ARM_REACH_M = 1.2;

import { blastShare, bodyCentre, type ExplosiveSpec, inSight } from './explosive.ts';
import type { PelletShot } from './pellets.ts';

/** A shot's or a blast's hit, dealt through the melee hit path without a swing to recover from. */
const projectileWeapon = (damage: number, reach: number, impulse: number): HitWeapon => ({
  damage,
  reach,
  cooldown: 0,
  impulse,
});

const zombieRegionClass = (region: ZombieHitRegion): string =>
  region === 'core.trunk' ? 'torso' : (region.split('.').at(-1) ?? region);

export const lethalRegion = (type: ZombieDef, region: ZombieHitRegion): boolean =>
  region === 'core.trunk' || (type.model !== 'amalgam' && zombieRegionClass(region) === 'head');

const maxZombieRegionHealth = (type: ZombieDef, region: ZombieHitRegion): number | undefined => {
  if (type.model === 'amalgam') {
    return type.regions[region === 'core.trunk' ? region : `member.${zombieRegionClass(region)}`];
  }
  return type.regions[region];
};

const zombieRegionsFor = (type: ZombieDef, seed: number): ZombieRegions => {
  if (type.model !== 'amalgam') {
    return Object.fromEntries(ZOMBIE_REGION_NAMES.map((region) => [region, type.regions[region]!])) as ZombieRegions;
  }
  const figure = amalgamFigureForType(type, seed);
  return Object.fromEntries(
    figure.manifest.regions.map((region) => {
      const health = maxZombieRegionHealth(type, region.id as ZombieHitRegion);
      if (health === undefined) {
        throw new Error(`Zombie type ${type.id} has no health for amalgam region ${region.id}`);
      }
      return [region.id, health];
    }),
  ) as ZombieRegions;
};

const validHitFlinchTime = (time: number | undefined): boolean =>
  time === undefined || (Number.isFinite(time) && time >= 0);
const validStanceWeight = (weight: number | undefined): boolean =>
  weight === undefined || (Number.isFinite(weight) && weight >= 0 && weight <= 1);
const validStepOffset = (offset: number | undefined): boolean =>
  offset === undefined || (Number.isFinite(offset) && Math.abs(offset) <= 0.5001);

type MeleeDamageType = MeleeDamageKind;
type ZombieMove = ZombieDef['attack']['moves'][number];
type ZombieHitRegionChoice = ZombieMove['hitRegions'][number];

const pickByWeight = <T extends { weight: number }>(choices: readonly T[], roll: number): T => {
  let left = roll * choices.reduce((sum, choice) => sum + choice.weight, 0);
  for (const choice of choices) {
    left -= choice.weight;
    if (left < 0) {
      return choice;
    }
  }
  return choices.at(-1)!;
};

/** The move of a landed hit, selected by its content weight. */
export const pickZombieMove = <T extends { weight: number }>(moves: readonly T[], roll: number): T =>
  pickByWeight(moves, roll);

/** The body region a landed move strikes, selected by its content weight. */
export const pickZombieHitRegion = (choices: readonly ZombieHitRegionChoice[], roll: number): BodyRegion =>
  pickByWeight(choices, roll).region;

export interface MeleeWeapon extends HitWeapon {
  readonly motion: MeleeMotion;
  readonly charge?: MeleeCharge | undefined;
}

interface HitWeapon {
  readonly damage: number;
  readonly reach: number;
  readonly cooldown: number;
  /** A player swing's contact timing; required to begin one, unused by zombie and projectile hits. */
  readonly contactFraction?: number | undefined;
  readonly windupCapSimSeconds?: number | undefined;
  readonly stamina?: number | undefined;
  readonly impulse?: number | undefined;
  readonly damageVariance?: number | undefined;
  readonly headDamageMultiplier?: number | undefined;
  readonly limbDamageMultiplier?: number | undefined;
  readonly speedMultiplier?: number | undefined;
  readonly swingSound?: SoundId | undefined;
  readonly hitSound?: SoundId | undefined;
  readonly hitLayerSound?: SoundId | undefined;
  readonly type?: MeleeDamageType | undefined;
}

export interface ZombieAim {
  readonly id: EntityId;
  readonly region: ZombieHitRegion;
  readonly distanceMetres: number;
  readonly reachMetres: number;
  readonly inReach: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly boxes: readonly PosedBoneBox[];
  /** The box the ray struck: entered first, or for an amalgam, the one whose flesh it met. */
  readonly hitBox: PosedBoneBox;
  /** The amalgam flesh cell the ray struck (core/amalgamCarving.ts, `fleshHit`). */
  readonly cell?: number | undefined;
}

/** Where one hit struck an amalgam's flesh, before it is carved. */
interface AmalgamStrike {
  readonly cell: number;
  readonly damage: number;
  readonly hit: HitImpulse;
}

/** Where a hit struck a zombie's flesh, for its caller to carve, when the zombie carves. */
const strikeOf = (
  zombie: Zombie,
  cell: number | undefined,
  damage: number,
  hit: HitImpulse,
): AmalgamStrike | undefined => (cell === undefined || !zombie.type.carving ? undefined : { cell, damage, hit });

interface MeleeHitContext {
  readonly id: EntityId;
  readonly zombie: Zombie;
  readonly region: ZombieHitRegion;
  /** The amalgam flesh cell the hit struck, which a type that carves knocks out around. */
  readonly cell: number | undefined;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly distanceMetres: number;
  readonly weapon: HitWeapon;
  readonly damageType: MeleeDamageType;
  readonly isFist: boolean;
}

interface MeleeEffectsContext {
  readonly id: EntityId;
  readonly zombie: Zombie;
  readonly region: ZombieHitRegion;
  readonly healthAfter: number;
  readonly killed: boolean;
  readonly hit: HitImpulse;
}

const meleeDamageForContact = (
  zombie: Zombie,
  region: ZombieHitRegion,
  weapon: HitWeapon,
  damageType: MeleeDamageType,
): number => {
  const spread = weapon.damageVariance;
  const rolled =
    spread === undefined ? weapon.damage : weapon.damage * zombie.dismemberRng.range(1 - spread, 1 + spread);
  const regionClass = zombieRegionClass(region) as keyof NonNullable<ZombieDef['meleeDamageResistance']>;
  let multiplier = 1;
  if (regionClass === 'head') {
    multiplier = weapon.headDamageMultiplier ?? 1;
  } else if (regionClass !== 'torso') {
    multiplier = weapon.limbDamageMultiplier ?? 1;
  }
  const resistance = zombie.type.meleeDamageResistance?.[regionClass][damageType] ?? 0;
  return rolled * multiplier * (1 - resistance);
};

/** Acid damage a zombie type takes; a type with `acidResistance` 1 is immune. */
export const acidDamageToZombie = (type: Pick<ZombieDef, 'acidResistance'>, amount: number): number =>
  amount * (1 - (type.acidResistance ?? 0));

export interface MeleeResult {
  readonly id?: EntityId | undefined;
  readonly region?: ZombieHitRegion | undefined;
  readonly damage: number;
  readonly healthBefore?: number | undefined;
  readonly healthAfter?: number | undefined;
  readonly outcome: 'nothing' | 'severed' | 'incapacitated' | 'killed' | 'decapitated';
  readonly part?: string | undefined;
}

/** A blast and the fragments flying from its centre, the fragments' origin. */
export interface Detonation {
  readonly blast: ExplosiveSpec['blast'];
  readonly fragments: Omit<PelletShot, 'diameterMm'>;
}

export interface HitImpulse {
  /** Hit point in block coordinates. */
  readonly point: Vec3;
  readonly direction: Vec3;
  /** N·s. */
  readonly impulse: number;
}
/** At most these three nearest moving shamblers emit footsteps in a simulation tick. */
const SHAMBLER_FOOTSTEP_VOICE_CAP = 3;

export interface Zombie {
  type: ZombieDef;
  modifiers: Modifier[];
  /** Derived tier; a single entity moves between update schedules without duplicating ownership. */
  tier?: ZombieTier | undefined;
  hordeId?: string | undefined;
  hordeOffset?: Vec3 | undefined;
  body: Body;
  facing: Vec3;
  home: Vec3;
  mode: ZombieMode;
  investigationTier?: 'near' | 'far' | undefined;
  /** Per-body behavior stream; draws never perturb another body. */
  behaviorRng: Rng;
  /** Separate seeded stream keeps ambient sound timing from changing movement decisions. */
  soundRng: Rng;
  /** Separate seeded stream keeps melee damage variation and dismemberment rolls (both external hit
   * events) from shifting behaviorRng-driven AI. Each class weapon consumes one damage draw before its
   * dismemberment rolls, including zero-spread weapons, so contact draw order is stable. */
  dismemberRng: Rng;
  idleSoundTimer: number;
  lastVocalNoiseId?: number | undefined;
  modeTimer: number;
  hesitationFrom?: 'idle' | 'stroll' | undefined;
  refusedAt?: number | undefined;
  leanTarget?: Vec3 | undefined;
  searchAnchor?: Vec3 | undefined;
  searchTimer: number;
  searchStrolling: boolean;
  searchHeading: Vec3;
  strollHeading: Vec3;
  horizontalSpeed: number;
  obstacleWanderHeading?: Vec3 | undefined;
  obstacleWanderRemaining: number;
  obstacleContact: boolean;
  obstacleSlideSide: -1 | 0 | 1;
  bodyLookTarget: number;
  headYaw: number;
  headYawTarget: number;
  lookTimer: number;
  swayValue: number;
  swayStart: number;
  swayTarget: number;
  swayElapsed: number;
  swayDuration: number;
  lurchValue: number;
  lurchStart: number;
  lurchTarget: number;
  lurchElapsed: number;
  lurchDuration: number;
  stumbleFactor: number;
  stumbleElapsed: number;
  stumbleDuration: number;
  /** Previous fixed-step pose used only by rendering interpolation. */
  renderPrevious: { pos: Vec3; facing: Vec3; headYaw: number; gaitPhase: number; time?: number };
  regions: ZombieRegions;
  /** Exact mobgen shambler seed shared with the renderer and persisted as simulation state. */
  figureSeed: number;
  /** A destroyed torso leaves an inert, gravity-bound entity that may be revived by a later system. */
  incapacitated: boolean;
  lastPerceived?: Vec3 | undefined;
  stimulusAt?: number | undefined;
  attackWait: number;
  /** Seconds left in the current attack's telegraph windup; 0 = not winding up. Set to
   * type.attack.windup when an attack starts (alongside attackWait), counts down to exactly 0, then the
   * hit resolves (hurtPlayer or a miss) if the target is still in reach/LOS. */
  attackWindup: number;
  /** `acidSpit` telegraph: seconds left in the wind-up, 0 = not winding up. Progress for presentation is
   * `acidSpitWindupProgress`. */
  spitWindup: number;
  /** Seconds that the last heavy enough hit still holds it from moving and starting an attack; 0 = none. */
  staggerSimSeconds: number;
  /** Seconds until the next spit may start; counts down whatever the zombie is doing. */
  spitWait: number;
  /** Seeded stream for the spit's aim, apart from behaviorRng so a spit never shifts movement draws. */
  spitRng: Rng;
  /** Unwrapped gait phase; advances by π for each travelled stepLength metres. */
  gaitPhase: number;
  /** Surface footfall cadence advances only with grounded travel. */
  footstepClock: ShamblerFootstepClock;
  /** Elapsed wandering time, independent of the distance-driven gait. */
  wanderClock: number;
  /** Fixed-step slack/aggravated stance cross-fade (0..1); optional for backward-compatible saves. */
  stanceWeight?: number | undefined;
  /** Fixed-step visual root compensation for a one-step terrain snap, in metres. */
  stepOffset?: number | undefined;
  /** Fixed-step hit reaction time; optional for backward-compatible saves. */
  hitFlinchTime?: number | undefined;
  /** Bone ids severed so far, each one a bone whose disposition is `sever` (packages/mobgen/src/mob/dismember.ts,
   * `severableParts`) — cumulative, never un-severed. A renderer derives what to hide via mobgen's
   * severedBoneSet, not stored pre-expanded here (a cut part already implies everything below it). */
  severed: string[];
  /** Voxel-grid cells of an amalgam's realized figure that hits have knocked out, ascending; empty for every
   * other type. Holes are flesh only: they never change regions, damage, severing or hit tests. */
  carved: number[];
}

export interface AmalgamMemberContribution {
  readonly partId: string;
  readonly rootBone: string;
  readonly regionIds: readonly string[];
}

/** Active member ownership is the seam for per-member attacks and reach; core is never a severable member. */
export const activeAmalgamMembers = (
  zombie: Pick<Zombie, 'type' | 'figureSeed' | 'severed'>,
): readonly AmalgamMemberContribution[] => {
  if (zombie.type.model !== 'amalgam') {
    return [];
  }
  const severed = new Set(zombie.severed);
  return amalgamFigureForType(zombie.type, zombie.figureSeed)
    .manifest.parts.filter((part) => part.severable && !severed.has(part.id))
    .map((part) => ({ partId: part.id, rootBone: part.rootBone, regionIds: part.regionIds }));
};

/** Remaining manifest members share the authored attack reach; with none, the unseverable core cannot attack. */
export const zombieAttackReachMetres = (zombie: Pick<Zombie, 'type' | 'figureSeed' | 'severed'>): number => {
  if (zombie.type.model !== 'amalgam' || activeAmalgamMembers(zombie).length === 0) {
    return zombie.type.model === 'amalgam' ? 0 : zombie.type.attack.reach;
  }
  return zombieAttackReachForType(zombie.type, zombie.figureSeed);
};

export type ZombieState = Omit<
  Zombie,
  | 'type'
  | 'tier'
  | 'behaviorRng'
  | 'soundRng'
  | 'dismemberRng'
  | 'spitRng'
  | 'renderPrevious'
  | 'lastVocalNoiseId'
  | 'modifiers'
> & {
  type: string;
  behaviorRng: RngState;
  soundRng: RngState;
  dismemberRng: RngState;
  spitRng: RngState;
  lastVocalNoiseId: number | null;
};

const validRngState = (state: unknown): state is RngState =>
  Array.isArray(state) && state.length === 4 && state.every((word) => Number.isSafeInteger(word));
const validSpitTimers = (zombie: ZombieState): boolean =>
  Number.isFinite(zombie.spitWindup) &&
  zombie.spitWindup >= 0 &&
  Number.isFinite(zombie.spitWait) &&
  zombie.spitWait >= 0;
const validStaggerTime = (zombie: ZombieState): boolean =>
  Number.isFinite(zombie.staggerSimSeconds) && zombie.staggerSimSeconds >= 0;
const validObstacleWanderState = (zombie: ZombieState): boolean =>
  Number.isFinite(zombie.obstacleWanderRemaining) &&
  zombie.obstacleWanderRemaining >= 0 &&
  zombie.obstacleWanderRemaining > 0 === (zombie.obstacleWanderHeading !== undefined) &&
  (zombie.obstacleWanderHeading === undefined ||
    (Array.isArray(zombie.obstacleWanderHeading) &&
      zombie.obstacleWanderHeading.length === 3 &&
      zombie.obstacleWanderHeading.every(Number.isFinite))) &&
  typeof zombie.obstacleContact === 'boolean' &&
  (zombie.obstacleSlideSide === -1 || zombie.obstacleSlideSide === 0 || zombie.obstacleSlideSide === 1);
const validShamblerFootstepClock = (clock: ShamblerFootstepClock): boolean =>
  Boolean(clock) &&
  Number.isFinite(clock.distanceUntilStep) &&
  clock.distanceUntilStep > 0 &&
  typeof clock.nextLongStep === 'boolean';
const validZombieEventState = (zombie: ZombieState): boolean =>
  (zombie.hesitationFrom === undefined || zombie.hesitationFrom === 'idle' || zombie.hesitationFrom === 'stroll') &&
  (zombie.mode !== 'hesitate' ||
    (zombie.hesitationFrom !== undefined &&
      Number.isFinite(zombie.modeTimer) &&
      zombie.modeTimer >= 0 &&
      validVec3State(zombie.lastPerceived!))) &&
  (zombie.refusedAt === undefined || (Number.isFinite(zombie.refusedAt) && zombie.refusedAt >= 0)) &&
  (zombie.leanTarget === undefined || validVec3State(zombie.leanTarget)) &&
  (zombie.lastVocalNoiseId === null ||
    (Number.isSafeInteger(zombie.lastVocalNoiseId) && zombie.lastVocalNoiseId >= 0)) &&
  (zombie.stimulusAt === undefined || (Number.isFinite(zombie.stimulusAt) && zombie.stimulusAt >= 0)) &&
  Array.isArray(zombie.severed) &&
  zombie.severed.every((part) => typeof part === 'string') &&
  Array.isArray(zombie.carved) &&
  zombie.carved.every(
    (cell, index) => Number.isSafeInteger(cell) && cell >= 0 && (index === 0 || cell > zombie.carved[index - 1]!),
  ) &&
  validShamblerFootstepClock(zombie.footstepClock);
/** Holes play could make: only a type that carves has any, each on flesh in its grid, never the core cell. */
const validCarvedCells = (type: ZombieDef, figureSeed: number, carved: readonly number[]): boolean => {
  if (!type.carving) {
    return carved.length === 0;
  }
  const figure = amalgamFigureForType(type, figureSeed);
  const { owner } = figure.realized.voxels;
  const keep = protectedCoreCell(figure);
  return carved.every((cell) => cell < owner.length && owner[cell]! > 0 && cell !== keep);
};
const validHordeMemberState = (zombie: ZombieState): boolean =>
  (zombie.hordeId === undefined && zombie.hordeOffset === undefined) ||
  (typeof zombie.hordeId === 'string' &&
    zombie.hordeId.length > 0 &&
    Array.isArray(zombie.hordeOffset) &&
    zombie.hordeOffset.length === 3 &&
    zombie.hordeOffset.every(Number.isFinite));

export interface HordeState {
  id: string;
  type: string;
  home: Vec3;
  target: Vec3;
  /** `release` heads for `target` without forgetting it, so an event's horde reaches where it was sent. */
  mode: 'home' | 'roam' | 'noise' | 'release';
  roamTimer: number;
  stimulusAt?: number | undefined;
  lastNoiseId: number;
  rng: RngState;
}

const validVec3State = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const validHordeSnapshotState = (
  horde: HordeState,
  hasHorde: boolean,
  resolveType: (id: string) => ZombieDef | undefined,
): boolean =>
  horde.id.length > 0 &&
  !hasHorde &&
  resolveType(horde.type) !== undefined &&
  validVec3State(horde.home) &&
  validVec3State(horde.target) &&
  ['home', 'roam', 'noise', 'release'].includes(horde.mode) &&
  Number.isFinite(horde.roamTimer) &&
  horde.roamTimer >= 0 &&
  Number.isSafeInteger(horde.lastNoiseId) &&
  horde.lastNoiseId >= 0 &&
  (horde.stimulusAt === undefined || (Number.isFinite(horde.stimulusAt) && horde.stimulusAt >= 0)) &&
  validRngState(horde.rng);

export interface ZombieSystemState {
  nextEntityId: number;
  nextPuddleId: number;
  zombies: { id: number; zombie: ZombieState }[];
  hordes: HordeState[];
  acidGlobs: AcidGlobState[];
  acidPuddles: AcidPuddleState[];
}

export interface VocalNoise {
  id: number;
  pos: Vec3;
  radiusMetres: number;
  expiresAt: number;
}

export interface PlayerSense {
  pos: Vec3;
  /** When present, the solid player box used for hard movement collisions. */
  body?: Body | undefined;
  /** Direction the player faces, in the x/z plane. */
  facing: Vec3;
  movement: PlayerMovement;
  stance?: PlayerStance | undefined;
  lit: boolean;
  lightSeenFrom: number;
  /** Also the height of the light the player carries. */
  eyeHeightMetres: number;
  /** Direct sunlight at the player's position; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  lightSources?: readonly ZombieLightSource[] | undefined;
  vocalNoise?: VocalNoise | undefined;
}

interface ZombieLightSource {
  pos: Vec3;
  seenFrom: number;
  heightMetres: number;
  /** Direct sunlight at the source; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  /** Player-carried light uses the darkness gate; independent sources use lure tuning. */
  carried: boolean;
}

export interface ZombieSystemOptions {
  activeZombieRadiusMetres: number;
  store?: EntityStore<Zombie>;
  terrainFloor?: TerrainFloorAt | undefined;
  seed?: number;
  /** Movement and projectiles use the body's blockers. */
  isSolid: SolidAt;
  isSoundBlocking?: SolidAt;
  meleeBlocker?: MeleeBlocker;
  /**
   * `isSolid` as cached bricks, which an amalgam's exact shape moves against (core/solidBricks.ts). Without
   * it the bricks are read from `isSolid` on every query: right, but slower.
   */
  solidBricks?: SolidBricks | undefined;
  /** True only while terrain at the actor's position is loaded; unloaded actors wait for Slice 4b catch-up. */
  isLoaded?: ((x: number, z: number) => boolean) | undefined;
  /** Held where it stands, by a trap shut on its leg (core/bearTrap.ts); it can still turn and attack. */
  restrained?: ((id: EntityId) => boolean) | undefined;
  /** Visibility alone uses sight opacity. */
  isOpaque: SolidAt;
  blockSize: number;
  physics: PhysicsParams;
  /** Take-off speed in metres per second; the system divides by `blockSize` itself. */
  jumpSpeed: number;
  tuning: SenseDef;
  player: () => PlayerSense;
  dayPhase: () => DayPhaseState;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  hurtPlayer: (
    amount: number,
    hitRegions: readonly ZombieHitRegionChoice[],
    attacker: EntityId,
    kind: DamageKind,
  ) => void;
  /** The id is what a renderer keys its corpse on; the zombie is already out of the store. */
  onDeath?: (id: EntityId, zombie: Zombie) => void;
  /** Called once when torso health reaches zero while the head remains intact. */
  onIncapacitated?: (id: EntityId, zombie: Zombie) => void;
  /** A whole region came off, and the game leaves it behind as an item: a limb whose health ran out, or
   * each arm and the head of a dismembered downed body (see finishDowned). */
  onSevered?: (zombie: Zombie, region: ZombieRegion) => void;
  /** Sound-source position is in block coordinates; body is present when the shambler made the sound or was hit.
   * The player's own swing and hit set `playerMelee`, since content picks their events. */
  onSound?: (event: SoundId, position: Vec3, body?: Zombie, playerMelee?: boolean) => void;
  /** A spit left the mouth. No damage is applied here; the owner of the in-flight glob takes it from this. */
  onAcidSpit?: (release: AcidSpitRelease) => void;
  onAcidPlayerHit?: (hit: ZombiePlayerHit) => void;
  onPlayerExposure?: (contact: ExposureContact) => void;
  onPlayerLeaveExposure?: (source: string) => void;
  onAcidImpact?: (position: Vec3, type: ZombieDef) => void;
  onAcidGroundImpact?: (impact: AcidGroundImpact) => void;
  /** Called for actual ground-travel footfalls of the nearest three moving shamblers. */
  onFootstep?: (position: Vec3, id: EntityId, mode: ZombieMode, body: Zombie) => void;
  /** Presentation only: a hit that did damage, melee or pellet, after its damage is applied. Gore draws from
   * it; the system reads nothing back. */
  onWound?: (id: EntityId, zombie: Zombie, hit: HitImpulse, damage: number) => void;
  /** Called once for every part severed (src/core/zombies.ts's swing — the melee hit path), *after*
   * `zombie.severed` already includes `part`, so a renderer reading zombie.severed at this point sees the
   * new cut too. Fires before onDeath on a killing blow that also severs the head. */
  onSever?: (id: EntityId, zombie: Zombie, part: string, hit: HitImpulse) => void;
  /** Called when a hit knocks flesh out of an amalgam, *after* `zombie.carved` includes `cells`. `hit` is
   * the strike the hole centres on. */
  onCarve?: (id: EntityId, zombie: Zombie, cells: readonly number[], hit: HitImpulse) => void;
  /** Reports the actual result of an attempted player melee swing; absent in normal play. */
  onMeleeResult?: (result: MeleeResult) => void;
  /** Presentation-only recoil for a confirmed hit. */
  onMeleeContact?: (impulse: number) => void;
  /**
   * A bash at a pursuing zombie's obstacle contact: `ahead` is its box moved the obstacle lookahead along its aim.
   * The owner of doors resolves it against the leaf there and makes its noise; true when a leaf took the blow.
   */
  bashObstacle?: (ahead: Body, strength: number) => boolean;
}

const AMALGAM_MEMBER_REGION = /^(member\.\d+)\./;

type TerrainFloorAt = (x: number, z: number) => number;
interface HorizontalFootprint {
  halfWidth: number;
  halfDepth: number;
}

const terrainStance = (x: number, z: number, terrainFloor: TerrainFloorAt, footprint: HorizontalFootprint): number => {
  let level = Number.NEGATIVE_INFINITY;
  for (let bz = Math.floor(z - footprint.halfDepth); bz < Math.ceil(z + footprint.halfDepth); bz++) {
    for (let bx = Math.floor(x - footprint.halfWidth); bx < Math.ceil(x + footprint.halfWidth); bx++) {
      level = Math.max(level, Math.round(terrainFloor(bx, bz)));
    }
  }
  return level;
};
const onTerrainFloor = (pos: Vec3, terrainFloor: TerrainFloorAt, footprint: HorizontalFootprint): boolean =>
  Math.round(pos[1]) === terrainStance(pos[0], pos[2], terrainFloor, footprint);
const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const posedRegionsForZombie = ({
  id,
  zombie,
  blockSize,
  poseCache,
}: {
  id: EntityId;
  zombie: Zombie;
  blockSize: number;
  poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
}): Readonly<Record<string, readonly PosedBoneBox[]>> => {
  const cached = poseCache?.get(id);
  if (cached) {
    return cached;
  }
  const poseInput = zombiePoseInputFor(zombie, id, blockSize);
  const posed =
    zombie.type.model === 'amalgam' ? posedAmalgamRegionBoxes(poseInput) : posedShamblerRegionBoxes(poseInput);
  poseCache?.set(id, posed);
  return posed;
};
const rayMayHitZombie = (zombie: Zombie, origin: Vec3, direction: Vec3, blockSize: number): boolean => {
  const centerY = zombie.body.pos[1] + zombie.body.height * 0.5;
  const nearestT = Math.max(
    0,
    (zombie.body.pos[0] - origin[0]) * direction[0] +
      (centerY - origin[1]) * direction[1] +
      (zombie.body.pos[2] - origin[2]) * direction[2],
  );
  const perpendicular =
    Math.hypot(
      origin[0] + direction[0] * nearestT - zombie.body.pos[0],
      origin[1] + direction[1] * nearestT - centerY,
      origin[2] + direction[2] * nearestT - zombie.body.pos[2],
    ) * blockSize;
  return (
    perpendicular <=
    Math.max(1, Math.hypot(zombie.body.halfWidth, zombie.body.halfDepth ?? zombie.body.halfWidth) * blockSize)
  );
};
const isActiveHitRegion = (zombie: Zombie, region: ZombieHitRegion): boolean => {
  const memberPart = zombie.type.model === 'amalgam' ? AMALGAM_MEMBER_REGION.exec(region)?.[1] : undefined;
  return zombie.regions[region]! > 0 && !(memberPart !== undefined && zombie.severed.includes(memberPart));
};
/** A body's regions with the one whose loss kills last, so a blast severs limbs before it kills. */
const blastOrder = (zombie: Zombie): ZombieHitRegion[] => {
  const regions = Object.keys(zombie.regions) as ZombieHitRegion[];
  return [
    ...regions.filter((region) => !lethalRegion(zombie.type, region)),
    ...regions.filter((region) => lethalRegion(zombie.type, region)),
  ];
};
const sameInvestigationFloor = (
  a: Vec3,
  b: Vec3,
  terrainFloor: TerrainFloorAt | undefined,
  footprint: HorizontalFootprint,
): boolean =>
  Math.round(a[1]) === Math.round(b[1]) ||
  (terrainFloor !== undefined &&
    onTerrainFloor(a, terrainFloor, footprint) &&
    onTerrainFloor(b, terrainFloor, footprint));
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
const angleOf = (v: Vec3): number => Math.atan2(v[0], v[2]);
const headingAt = (angle: number): Vec3 => [Math.sin(angle), 0, Math.cos(angle)];
const OBSTACLE_LOOKAHEAD_METRES = 0.7;
const OBSTACLE_PROBE_DISTANCE_METRES = 0.75;
const OBSTACLE_PROBE_SPEED = 4;
const OBSTACLE_WANDER_ANGLES = [
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  Math.PI,
] as const;
/** The slanted headings that still gain ground toward an intent, which a zombie held up tries to get past a piece. */
const OBSTACLE_BYPASS_ANGLES = [Math.PI / 4, -Math.PI / 4] as const;
const WAY_AROUND_STEPS = 8;
interface ObstacleProbe {
  body: Body;
  intent: Vec3;
  isSolid: SolidAt;
  physics: PhysicsParams;
  blockSize: number;
}
/**
 * Where a body stands after walking `distanceMetres` along a heading, sliding along whatever blocks it. A contact
 * zeroes the blocked axis' speed, so a probe that must get past an edge asks for the heading again each of `steps`.
 */
const probeHeading = (
  { body, isSolid, physics, blockSize }: ObstacleProbe,
  heading: Vec3,
  distanceMetres: number,
  steps = 1,
): Vec3 => {
  const probe: Body = { ...body, pos: copy(body.pos), vel: [0, 0, 0] };
  for (let step = 0; step < steps; step++) {
    probe.vel = [(heading[0] * OBSTACLE_PROBE_SPEED) / blockSize, 0, (heading[2] * OBSTACLE_PROBE_SPEED) / blockSize];
    stepBody(probe, distanceMetres / OBSTACLE_PROBE_SPEED / steps, isSolid, physics);
  }
  return probe.pos;
};
const openWanderHeadings = (probe: ObstacleProbe): Vec3[] =>
  OBSTACLE_WANDER_ANGLES.map((offset) => headingAt(angleOf(probe.intent) + offset)).filter((heading) => {
    const end = probeHeading(probe, heading, OBSTACLE_PROBE_DISTANCE_METRES);
    const { pos } = probe.body;
    const progress = ((end[0] - pos[0]) * heading[0] + (end[2] - pos[2]) * heading[2]) * probe.blockSize;
    return progress >= OBSTACLE_PROBE_DISTANCE_METRES * 0.5;
  });
/**
 * Whether a body held up along its intent can walk past what holds it: within `reachMetres`, a slanted heading still
 * gains at least `minGainFraction` of the ground toward the intent that a clear one would. A wall slides the probe
 * along itself and gains none, so a piece in a doorway or a narrow gap has no way around, and clutter in the open has.
 */
const hasWayAround = (probe: ObstacleProbe, reachMetres: number, minGainFraction: number): boolean =>
  OBSTACLE_BYPASS_ANGLES.some((offset) => {
    const end = probeHeading(probe, headingAt(angleOf(probe.intent) + offset), reachMetres, WAY_AROUND_STEPS);
    const { pos } = probe.body;
    const gained = ((end[0] - pos[0]) * probe.intent[0] + (end[2] - pos[2]) * probe.intent[2]) * probe.blockSize;
    return gained >= reachMetres * Math.cos(offset) * minGainFraction;
  });
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (current: number, target: number, amount: number): number =>
  current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);
const smooth01 = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const approachAngle = (current: number, target: number, amount: number): number =>
  current + Math.sign(wrapAngle(target - current)) * Math.min(Math.abs(wrapAngle(target - current)), amount);
const turnToward = (current: Vec3, target: Vec3, radians: number): Vec3 =>
  headingAt(approachAngle(angleOf(current), angleOf(target), radians));
/**
 * Turns a zombie by up to `radians` and gives the heading it moves along. A forward walker turns toward `move`
 * and moves only where it faces, so it turns before it heads somewhere new; an omnidirectional one moves along
 * `move` at once and turns to face `goal`.
 */
const steer = (zombie: Zombie, move: Vec3, radians: number, goal: Vec3 = move): Vec3 => {
  if (zombie.type.locomotion === 'omnidirectional') {
    zombie.facing = turnToward(zombie.facing, goal, radians);
    return move;
  }
  zombie.facing = turnToward(zombie.facing, move, radians);
  return zombie.facing;
};
const inRange = (rng: Rng, range: { min: number; max: number }): number => rng.range(range.min, range.max);

/** The player point every zombie attack aims at, in metres above the feet: the chest. */
export const PLAYER_CHEST_METRES = 1;

interface AttackReachProbe {
  zombie: Zombie;
  zombiePos: Vec3;
  playerPos: Vec3;
  blockSize: number;
  isSolid: SolidAt;
}

/** A grab reaches horizontally from the body, within its type's vertical band, chest to chest. */
const grabOrigin = (
  { zombie, zombiePos, playerPos, blockSize }: AttackReachProbe,
  reachMetres: number,
  chestOffset: number,
): Vec3 | undefined =>
  horizontalDistance(playerPos, zombiePos) * blockSize > reachMetres ||
  Math.abs(playerPos[1] - zombiePos[1]) * blockSize >= requiredGrabBand(zombie.type)
    ? undefined
    : [zombiePos[0], zombiePos[1] + chestOffset, zombiePos[2]];

/** An amalgam's tentacle strikes in a straight line from its core, at any height, as far as its reach. */
const strikeOrigin = (
  { zombie, zombiePos, blockSize }: AttackReachProbe,
  reachMetres: number,
  playerChest: Vec3,
): Vec3 | undefined => {
  const offset = amalgamStrikeOrigin(amalgamFigureForType(zombie.type, zombie.figureSeed), zombie.facing);
  const origin: Vec3 = [
    zombiePos[0] + offset[0] / blockSize,
    zombiePos[1] + offset[1] / blockSize,
    zombiePos[2] + offset[2] / blockSize,
  ];
  return Math.hypot(...sub(playerChest, origin)) * blockSize > reachMetres ? undefined : origin;
};

/** Shared by both attack start (telegraph) and attack resolve (after the windup elapses): the attack's
 * reach rule, then a clear line from its origin to the player's chest. Used identically at both times so
 * "still in reach" at resolve means exactly what "in reach" meant at start. */
const withinAttackReach = (probe: AttackReachProbe): boolean => {
  const { zombie, playerPos, blockSize, isSolid } = probe;
  const reachMetres = zombieAttackReachMetres(zombie);
  if (reachMetres <= 0) {
    return false;
  }
  const chestOffset = PLAYER_CHEST_METRES / blockSize;
  const playerChest: Vec3 = [playerPos[0], playerPos[1] + chestOffset, playerPos[2]];
  const origin =
    zombie.type.model === 'amalgam'
      ? strikeOrigin(probe, reachMetres, playerChest)
      : grabOrigin(probe, reachMetres, chestOffset);
  return origin !== undefined && clearLine(origin, playerChest, isSolid);
};

/** Nothing solid between two points: the line rule every attack's start and resolve share. */
const clearLine = (from: Vec3, to: Vec3, isSolid: SolidAt): boolean => {
  const toward = sub(to, from);
  const lineDistance = Math.hypot(...toward);
  return lineDistance > 0 && raycast(from, unit(toward), lineDistance, isSolid) === undefined;
};

/** Where a spit leaves a zombie: its posed mouth, held at the end of the wind-up, so the line follows the
 * drawn-back head and its gaze. */
const spitOrigin = (zombie: Zombie, id: EntityId, blockSize: number): Vec3 =>
  posedMouth({ ...zombiePoseInputFor(zombie, id, blockSize), spitProgress: 1 });

/** The chest follows the stance through the eye height, so crouching behind low cover lowers the spit's target. */
const spitChest = (player: PlayerSense, tuning: SenseDef, blockSize: number): Vec3 => {
  const metres = player.eyeHeightMetres * tuning.chestEyeFraction;
  return [player.pos[0], player.pos[1] + metres / blockSize, player.pos[2]];
};

/** The mouth-to-chest line at release, by the same rule as a melee strike. */
const spitLineClear = (origin: Vec3, chest: Vec3, isSolid: SolidAt): boolean => clearLine(origin, chest, isSolid);

/** What a released spit hands the simulation: the glob's start, its seeded direction and the hit moves it carries. */
export interface AcidSpitRelease {
  source: EntityId;
  origin: Vec3;
  /** Unit direction from the mouth, spread already applied. */
  aim: Vec3;
  moves: NonNullable<ZombieDef['acidSpit']>['moves'];
}

export interface ZombiePlayerHit {
  damage: number;
  kind: DamageKind;
  hitRegions: readonly ZombieHitRegionChoice[];
  regionRoll: number;
  sourceName: string;
}

export interface AcidGroundImpact {
  position: Vec3;
  source: EntityId;
  type: string;
  puddle: NonNullable<ZombieDef['acidSpit']>['puddle'];
}

type GlobContact =
  | { kind: 'solid'; distance: number; normal: Vec3 }
  | { kind: 'player'; distance: number }
  | { kind: 'zombie'; distance: number; hit: RegionHit };

/** A spitter that sees the player inside its range band stands and faces; outside the band it closes in. */
const holdSpitGround = (scratch: ZombieTickScratch, toward: Vec3): void => {
  const { zombie, type, sees, metresToTarget, dt } = scratch;
  const band = type.acidSpit?.rangeBand;
  if (
    band &&
    zombie.mode === 'chase' &&
    sees &&
    metresToTarget >= band.nearMetres &&
    metresToTarget <= band.farMetres
  ) {
    scratch.moving = false;
    steer(zombie, toward, (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }
};

// ---- dismemberment: which part a hit can sever, and the gameplay effect of already-severed parts ----
// The body's bone dispositions say what each hit region may lose, so no skeleton's bone names are listed
// here; see packages/mobgen/src/mob/shamblerFigure.ts, `ShamblerFigure`. The random roll picks among arm
// parts; a destroyed region cuts at its top part; the head has its own headOnKillChance roll.

const cutsFor = (zombie: Zombie) => {
  const figure = humanoidFigure(zombie.type.model, zombie.figureSeed);
  return { parts: figure.severableParts, bones: figure.realized.body.bones };
};

/** The part a destroyed region cuts at, parents first, so the whole region goes; undefined where it can't be cut. */
const regionCut = (zombie: Zombie, region: ZombieRegion): string | undefined => cutsFor(zombie).parts[region][0];

/** Arm parts still worth severing: neither severed nor below a severed part. Deepest first and left before
 * right, so the dismember roll draws the same parts in the same order on every humanoid-like arm. */
const availableArmParts = (zombie: Zombie): string[] => {
  const { parts, bones } = cutsFor(zombie);
  const hidden = severedBoneSet(bones, zombie.severed);
  const ordered: string[] = [];
  for (let depth = Math.max(parts.leftArm.length, parts.rightArm.length) - 1; depth >= 0; depth--) {
    for (const arm of [parts.leftArm, parts.rightArm]) {
      const part = arm[depth];
      if (part !== undefined && !hidden.has(part)) {
        ordered.push(part);
      }
    }
  }
  return ordered;
};

/** True once an arm's cut reaches above its last part: a lost hand alone still lets it grab with the stump. */
const armDisabled = (arm: readonly string[], hidden: ReadonlySet<string>): boolean =>
  arm.length > 0 && hidden.has(arm[Math.max(0, arm.length - 2)]!);

/** Gameplay effect, first slice: with both arms disabled there's nothing left to grab or claw with — the
 * zombie can still chase, but never starts a new attack (see the windup start check in tick()).
 * Already-started windups aren't cancelled retroactively; this only gates a *new* one. */
const canStillAttack = (zombie: Zombie): boolean => {
  if (zombie.severed.length === 0) {
    return true;
  }
  const { parts, bones } = cutsFor(zombie);
  const hidden = severedBoneSet(bones, zombie.severed);
  return !(armDisabled(parts.leftArm, hidden) && armDisabled(parts.rightArm, hidden));
};

const meleeOutcome = (
  killed: boolean,
  incapacitated: boolean,
  part: string | undefined,
  headPart: string | undefined,
): MeleeResult['outcome'] => {
  if (killed) {
    return part !== undefined && part === headPart ? 'decapitated' : 'killed';
  }
  if (incapacitated) {
    return 'incapacitated';
  }
  return part ? 'severed' : 'nothing';
};

const meleeHitSounds = (weapon: HitWeapon, isFist: boolean): SoundId[] => {
  const hitSound = weapon.hitSound ?? (isFist ? 'melee_hit_fist' : 'melee_hit');
  return weapon.hitLayerSound === undefined ? [hitSound] : [hitSound, weapon.hitLayerSound];
};

interface JumpObstacleProbe {
  body: Body;
  direction: Vec3;
  isSolid: SolidAt;
  physics: PhysicsParams;
  jumpSpeed: number;
  blockSize: number;
}

const canJumpObstacle = ({ body, direction, isSolid, physics, jumpSpeed, blockSize }: JumpObstacleProbe): boolean => {
  const maxJumpMetres = (jumpSpeed * jumpSpeed) / (2 * physics.gravity * blockSize);
  const probeX = Math.floor(body.pos[0] + (direction[0] * 0.65) / blockSize);
  const probeZ = Math.floor(body.pos[2] + (direction[2] * 0.65) / blockSize);
  const footCell = Math.floor(body.pos[1] + 0.01);
  const maxTop = Math.floor(body.pos[1] + maxJumpMetres / blockSize);
  let top = footCell;
  while (top <= maxTop && isSolid(probeX, top, probeZ)) {
    top += 1;
  }
  if (top === footCell) {
    return false;
  }
  const riseMetres = (top - body.pos[1]) * blockSize;
  if (riseMetres <= physics.stepHeight * blockSize || riseMetres > maxJumpMetres) {
    return false;
  }
  for (let y = top; y < Math.ceil(top + body.height); y++) {
    if (isSolid(probeX, y, probeZ)) {
      return false;
    }
  }
  return true;
};

export interface PerceptionInput {
  zombie: ZombieDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  dayPhase: DayPhase;
  sightBlend: number;
  blockSize: number;
  isSolid: SolidAt;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  tuning: SenseDef;
}

export type HearingTier = 'near' | 'far';
export interface HearingInput {
  zombie: ZombieDef;
  from: Vec3;
  player: PlayerSense;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
  tuning: SenseDef;
}
// Phases share this scratch to avoid per-zombie allocation, so write each per-zombie field before its first read.
// `test/zombies.test.ts`, `vocalNoiseDoesNotLeakBetweenZombiePasses`, guards the cross-pass case.
interface ZombieTickScratch {
  dt: number;
  time: number;
  player: PlayerSense;
  dayState: DayPhaseState;
  blockSize: number;
  isSolid: SolidAt;
  isOpaque: SolidAt;
  groundedAtTickStart: Map<Zombie, boolean>;
  id: EntityId;
  zombie: Zombie;
  type: ZombieDef;
  rng: Rng;
  pos: Vec3;
  perception: PerceptionInput;
  hearingInput: HearingInput;
  sees: boolean;
  lightTarget?: Vec3 | undefined;
  vocal?: HeardNoise | undefined;
  tier?: HearingTier | undefined;
  target: Vec3;
  direction: Vec3;
  aimDirection?: Vec3 | undefined;
  desiredSpeed: number;
  returnArrived: boolean;
  obstacleDirection?: Vec3 | undefined;
  stroll: boolean;
  wanderingAtTickStart: boolean;
  metresToTarget: number;
  seeking: boolean;
  inReach: boolean;
  moving: boolean;
  jumpAttempted: boolean;
  beforeStep: Vec3;
  travelled: number;
  wallAhead: boolean;
  dx: number;
  dz: number;
  forward: number;
  obstacleContact: boolean;
  wasObstacleContact: boolean;
  stepHeightMetres: number;
}
const createZombieTickScratch = (): ZombieTickScratch => ({
  dt: 0,
  time: 0,
  player: undefined as unknown as PlayerSense,
  dayState: undefined as unknown as DayPhaseState,
  blockSize: 0,
  isSolid: undefined as unknown as SolidAt,
  isOpaque: undefined as unknown as SolidAt,
  groundedAtTickStart: undefined as unknown as Map<Zombie, boolean>,
  id: 0,
  zombie: undefined as unknown as Zombie,
  type: undefined as unknown as ZombieDef,
  rng: undefined as unknown as Rng,
  pos: [0, 0, 0],
  perception: {} as PerceptionInput,
  hearingInput: {} as HearingInput,
  sees: false,
  lightTarget: undefined,
  vocal: undefined,
  tier: undefined,
  target: [0, 0, 0],
  direction: [0, 0, 0],
  aimDirection: undefined,
  desiredSpeed: 0,
  returnArrived: false,
  obstacleDirection: undefined,
  stroll: false,
  wanderingAtTickStart: false,
  metresToTarget: 0,
  seeking: false,
  inReach: false,
  moving: false,
  jumpAttempted: false,
  beforeStep: [0, 0, 0],
  travelled: 0,
  wallAhead: false,
  dx: 0,
  dz: 0,
  forward: 0,
  obstacleContact: false,
  wasObstacleContact: false,
  stepHeightMetres: 0,
});
export interface HeardNoise {
  tier: HearingTier;
  target: Vec3;
}

const hearingRange = (zombie: ZombieDef, movement: PlayerMovement): number => {
  if (movement === 'sprinting') {
    return zombie.hearingRange.sprint * zombie.hearing;
  }
  if (movement === 'jogging') {
    return zombie.hearingRange.jog * zombie.hearing;
  }
  if (movement === 'walking') {
    return zombie.hearingRange.walk * zombie.hearing;
  }
  return 0;
};

const hearingTier = ({
  zombie,
  from,
  player,
  blockSize,
  isSolid,
  tuning,
}: Omit<HearingInput, 'rng'>): HearingTier | undefined => {
  const range =
    hearingRange(zombie, player.movement) * (loweredStanceTuning(tuning, player.stance)?.hearingRangeScale ?? 1);
  if (range <= 0) {
    return undefined;
  }
  const distance = Math.hypot(...sub(player.pos, from)) * blockSize;
  if (distance > range * zombie.hearingModel.farMultiplier) {
    return undefined;
  }
  const earOffset = zombie.earHeightMetres / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [player.pos[0], player.pos[1] + earOffset, player.pos[2]];
  const wallScale = soundOcclusion({ listener: origin, source, isSolid, globalWall: tuning.wall }).occluded
    ? tuning.wall.hearingRangeScale
    : 1;
  const effectiveRange = range * wallScale;
  if (distance <= effectiveRange) {
    return 'near';
  }
  if (distance <= effectiveRange * zombie.hearingModel.farMultiplier) {
    return 'far';
  }
  return undefined;
};

const farBearingTarget = ({
  zombie,
  from,
  source,
  blockSize,
  rng,
}: {
  zombie: ZombieDef;
  from: Vec3;
  source: Vec3;
  blockSize: number;
  rng: Rng;
}): Vec3 => {
  const angle = Math.atan2(source[0] - from[0], source[2] - from[2]);
  const error = rng.range(-zombie.hearingModel.bearingErrorRadians, zombie.hearingModel.bearingErrorRadians);
  const bearing = headingAt(angle + error);
  const distance = zombie.hearingModel.investigationDistanceMetres / blockSize;
  return [from[0] + bearing[0] * distance, from[1], from[2] + bearing[2] * distance];
};

/** Returns an exact near-noise position or a seeded, uncertain far bearing. */
export const hearPlayer = (input: HearingInput): HeardNoise | undefined => {
  const tier = hearingTier(input);
  if (!tier) {
    return undefined;
  }
  return {
    tier,
    target: tier === 'near' ? copy(input.player.pos) : farBearingTarget({ ...input, source: input.player.pos }),
  };
};

export interface VocalNoiseInput {
  zombie: ZombieDef;
  from: Vec3;
  noise: VocalNoise;
  time: number;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
  tuning: SenseDef;
}

/** Applies the shared coarse wall step and two-tier bearing model to a player sound. */
export const hearVocalNoise = ({
  zombie,
  from,
  noise,
  time,
  blockSize,
  isSolid,
  rng,
  tuning,
}: VocalNoiseInput): HeardNoise | undefined => {
  if (time > noise.expiresAt) {
    return undefined;
  }
  const distance = Math.hypot(...sub(noise.pos, from)) * blockSize;
  if (distance > noise.radiusMetres * zombie.hearing * zombie.hearingModel.farMultiplier) {
    return undefined;
  }
  const earOffset = zombie.earHeightMetres / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [noise.pos[0], noise.pos[1] + earOffset, noise.pos[2]];
  const wallScale = soundOcclusion({ listener: origin, source, isSolid, globalWall: tuning.wall }).occluded
    ? tuning.wall.hearingRangeScale
    : 1;
  const hearingRadius = noise.radiusMetres * zombie.hearing * wallScale;
  if (distance <= hearingRadius) {
    return { tier: 'near', target: copy(noise.pos) };
  }
  if (distance <= hearingRadius * zombie.hearingModel.farMultiplier) {
    return {
      tier: 'far',
      target: farBearingTarget({ zombie, from, source: noise.pos, blockSize, rng }),
    };
  }
  return undefined;
};

const seesPlayer = ({
  zombie,
  from,
  facing,
  player,
  dayPhase,
  sightBlend,
  blockSize,
  isSolid,
  isSunExposedAt,
  tuning,
}: PerceptionInput): boolean => {
  const delta = sub(player.pos, from);
  const metres = Math.hypot(delta[0], delta[2]) * blockSize;
  const dir = unit(delta);
  const look = unit(facing);
  const dot = Math.max(-1, Math.min(1, look[0] * dir[0] + look[2] * dir[2]));
  const inCone = dot >= Math.cos((zombie.sightCone * Math.PI) / 180);
  if (!inCone || metres <= 0) {
    return false;
  }
  let sightRange = zombie.nightSight + (zombie.sight - zombie.nightSight) * sightBlend;
  const playerSunlit = player.sunlit ?? isSunExposedAt?.(player.pos) ?? dayPhase === 'day';
  const playerLightScale = lightSenseRangeScale('carried', playerSunlit, tuning.light);
  const lightSpotScale = zombie.lightSightScale ?? 1;
  const maximumRange = Math.max(sightRange, player.lit ? player.lightSeenFrom * playerLightScale * lightSpotScale : 0);
  if (metres > maximumRange) {
    return false;
  }
  const rayOrigin: Vec3 = [from[0], from[1] + zombie.eyeHeightMetres / blockSize, from[2]];
  const rayTarget: Vec3 = [player.pos[0], player.pos[1] + player.eyeHeightMetres / blockSize, player.pos[2]];
  const toTarget = sub(rayTarget, rayOrigin);
  const clear = raycast(rayOrigin, unit(toTarget), Math.hypot(...toTarget), isSolid) === undefined;
  if (player.lit && clear && playerLightScale > 0) {
    sightRange = Math.max(sightRange, player.lightSeenFrom * playerLightScale * lightSpotScale);
  } else {
    sightRange *= loweredStanceTuning(tuning, player.stance)?.sightRangeScale ?? 1;
  }
  return clear && metres <= sightRange;
};

const canSeeLight = ({
  zombie,
  from,
  look,
  source,
  dayPhase,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  zombie: ZombieDef;
  from: Vec3;
  look: Vec3;
  source: ZombieLightSource;
  dayPhase: DayPhase;
  blockSize: number;
  isOpaque: SolidAt;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  tuning: SenseDef;
}): number | undefined => {
  const delta = sub(source.pos, from);
  const distance = Math.hypot(delta[0], delta[2]) * blockSize;
  const sunlit = source.sunlit ?? isSunExposedAt?.(source.pos) ?? dayPhase === 'day';
  const exposure = source.carried ? 'carried' : 'world';
  if (
    distance <= 0 ||
    distance > source.seenFrom * lightSenseRangeScale(exposure, sunlit, tuning.light) * (zombie.lightSightScale ?? 1)
  ) {
    return undefined;
  }
  const direction = unit(delta);
  const dot = Math.max(-1, Math.min(1, look[0] * direction[0] + look[2] * direction[2]));
  if (dot < Math.cos((zombie.sightCone * Math.PI) / 180)) {
    return undefined;
  }
  const origin: Vec3 = [from[0], from[1] + zombie.eyeHeightMetres / blockSize, from[2]];
  const target: Vec3 = [source.pos[0], source.pos[1] + source.heightMetres / blockSize, source.pos[2]];
  const ray = sub(target, origin);
  return raycast(origin, unit(ray), Math.hypot(...ray), isOpaque) === undefined ? distance : undefined;
};

const visibleLightTarget = ({
  zombie,
  from,
  facing,
  player,
  dayPhase,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  zombie: ZombieDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  dayPhase: DayPhase;
  blockSize: number;
  isOpaque: SolidAt;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  tuning: SenseDef;
}): Vec3 | undefined => {
  const look = unit(facing);
  let nearest: ZombieLightSource | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const source of player.lightSources ?? []) {
    const distance = canSeeLight({ zombie, from, look, source, dayPhase, blockSize, isOpaque, isSunExposedAt, tuning });
    if (distance !== undefined && distance < nearestDistance) {
      nearest = source;
      nearestDistance = distance;
    }
  }
  return nearest ? copy(nearest.pos) : undefined;
};

/** Returns true for sight or either audible tier, using metres for distances and angles. */
export const perceivePlayer = (input: PerceptionInput): boolean =>
  seesPlayer(input) || hearingTier(input) !== undefined;

const zombieSnapshotFields = [
  'type',
  'hordeId',
  'hordeOffset',
  'body',
  'facing',
  'home',
  'mode',
  'investigationTier',
  'behaviorRng',
  'soundRng',
  'dismemberRng',
  'spitRng',
  'idleSoundTimer',
  'lastVocalNoiseId',
  'modeTimer',
  'hesitationFrom',
  'refusedAt',
  'leanTarget',
  'searchAnchor',
  'searchTimer',
  'searchStrolling',
  'searchHeading',
  'strollHeading',
  'horizontalSpeed',
  'obstacleWanderHeading',
  'obstacleWanderRemaining',
  'obstacleContact',
  'obstacleSlideSide',
  'bodyLookTarget',
  'headYaw',
  'headYawTarget',
  'lookTimer',
  'swayValue',
  'swayStart',
  'swayTarget',
  'swayElapsed',
  'swayDuration',
  'lurchValue',
  'lurchStart',
  'lurchTarget',
  'lurchElapsed',
  'lurchDuration',
  'stumbleFactor',
  'stumbleElapsed',
  'stumbleDuration',
  'regions',
  'figureSeed',
  'incapacitated',
  'lastPerceived',
  'stimulusAt',
  'attackWait',
  'attackWindup',
  'spitWindup',
  'staggerSimSeconds',
  'spitWait',
  'gaitPhase',
  'footstepClock',
  'wanderClock',
  'stanceWeight',
  'stepOffset',
  'hitFlinchTime',
  'severed',
  'carved',
] as const satisfies readonly (keyof ZombieState)[];
type ZombieSnapshotField = (typeof zombieSnapshotFields)[number];
type ZombieSnapshot = Pick<ZombieState, ZombieSnapshotField> &
  Record<Exclude<keyof ZombieState, ZombieSnapshotField>, never>;

const hordeSnapshotFields = [
  'id',
  'type',
  'home',
  'target',
  'mode',
  'roamTimer',
  'stimulusAt',
  'lastNoiseId',
  'rng',
] as const satisfies readonly (keyof HordeState)[];
type HordeSnapshotField = (typeof hordeSnapshotFields)[number];
type HordeSnapshot = Pick<HordeState, HordeSnapshotField> &
  Record<Exclude<keyof HordeState, HordeSnapshotField>, never>;

type ZombieSnapshotProjectors = {
  [K in ZombieSnapshotField]-?: (zombie: Zombie) => ZombieSnapshot[K];
} & Record<Exclude<keyof ZombieState, ZombieSnapshotField>, never>;

interface HordeSnapshotInput {
  readonly horde: Omit<HordeState, 'rng'>;
  readonly rng: Rng;
}

type HordeSnapshotProjectors = {
  [K in HordeSnapshotField]-?: (input: HordeSnapshotInput) => HordeSnapshot[K];
} & Record<Exclude<keyof HordeState, HordeSnapshotField>, never>;

const projectSnapshot = <Source extends object>(
  source: Source,
  projectors: Record<string, (source: Source) => unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(projectors).flatMap(([key, project]) => {
      const value = project(source);
      return value === undefined ? [] : [[key, value]];
    }),
  );

const zombieSnapshotProjectors = {
  type: (zombie) => zombie.type.id,
  hordeId: (zombie) => zombie.hordeId,
  hordeOffset: (zombie) => (zombie.hordeOffset === undefined ? undefined : ([...zombie.hordeOffset] as Vec3)),
  body: (zombie) => ({ ...zombie.body, pos: [...zombie.body.pos], vel: [...zombie.body.vel] }),
  facing: (zombie) => [...zombie.facing],
  home: (zombie) => [...zombie.home],
  mode: (zombie) => zombie.mode,
  investigationTier: (zombie) => zombie.investigationTier,
  behaviorRng: (zombie) => [...zombie.behaviorRng.state()] as RngState,
  soundRng: (zombie) => [...zombie.soundRng.state()] as RngState,
  dismemberRng: (zombie) => [...zombie.dismemberRng.state()] as RngState,
  spitRng: (zombie) => [...zombie.spitRng.state()] as RngState,
  idleSoundTimer: (zombie) => zombie.idleSoundTimer,
  lastVocalNoiseId: (zombie) => zombie.lastVocalNoiseId ?? null,
  modeTimer: (zombie) => zombie.modeTimer,
  hesitationFrom: (zombie) => zombie.hesitationFrom,
  refusedAt: (zombie) => zombie.refusedAt,
  leanTarget: (zombie) => (zombie.leanTarget === undefined ? undefined : copy(zombie.leanTarget)),
  searchAnchor: (zombie) => (zombie.searchAnchor === undefined ? undefined : [...zombie.searchAnchor]),
  searchTimer: (zombie) => zombie.searchTimer,
  searchStrolling: (zombie) => zombie.searchStrolling,
  searchHeading: (zombie) => [...zombie.searchHeading],
  strollHeading: (zombie) => [...zombie.strollHeading],
  horizontalSpeed: (zombie) => zombie.horizontalSpeed,
  obstacleWanderHeading: (zombie) =>
    zombie.obstacleWanderHeading === undefined ? undefined : ([...zombie.obstacleWanderHeading] as Vec3),
  obstacleWanderRemaining: (zombie) => zombie.obstacleWanderRemaining,
  obstacleContact: (zombie) => zombie.obstacleContact,
  obstacleSlideSide: (zombie) => zombie.obstacleSlideSide,
  bodyLookTarget: (zombie) => zombie.bodyLookTarget,
  headYaw: (zombie) => zombie.headYaw,
  headYawTarget: (zombie) => zombie.headYawTarget,
  lookTimer: (zombie) => zombie.lookTimer,
  swayValue: (zombie) => zombie.swayValue,
  swayStart: (zombie) => zombie.swayStart,
  swayTarget: (zombie) => zombie.swayTarget,
  swayElapsed: (zombie) => zombie.swayElapsed,
  swayDuration: (zombie) => zombie.swayDuration,
  lurchValue: (zombie) => zombie.lurchValue,
  lurchStart: (zombie) => zombie.lurchStart,
  lurchTarget: (zombie) => zombie.lurchTarget,
  lurchElapsed: (zombie) => zombie.lurchElapsed,
  lurchDuration: (zombie) => zombie.lurchDuration,
  stumbleFactor: (zombie) => zombie.stumbleFactor,
  stumbleElapsed: (zombie) => zombie.stumbleElapsed,
  stumbleDuration: (zombie) => zombie.stumbleDuration,
  regions: (zombie) => ({ ...zombie.regions }),
  figureSeed: (zombie) => zombie.figureSeed,
  incapacitated: (zombie) => zombie.incapacitated,
  lastPerceived: (zombie) => (zombie.lastPerceived === undefined ? undefined : [...zombie.lastPerceived]),
  stimulusAt: (zombie) => zombie.stimulusAt,
  attackWait: (zombie) => zombie.attackWait,
  attackWindup: (zombie) => zombie.attackWindup,
  spitWindup: (zombie) => zombie.spitWindup,
  staggerSimSeconds: (zombie) => zombie.staggerSimSeconds,
  spitWait: (zombie) => zombie.spitWait,
  gaitPhase: (zombie) => zombie.gaitPhase,
  footstepClock: (zombie) => ({ ...zombie.footstepClock }),
  wanderClock: (zombie) => zombie.wanderClock,
  stanceWeight: (zombie) => zombie.stanceWeight,
  stepOffset: (zombie) => zombie.stepOffset,
  hitFlinchTime: (zombie) => zombie.hitFlinchTime,
  severed: (zombie) => [...zombie.severed],
  carved: (zombie) => [...zombie.carved],
} satisfies ZombieSnapshotProjectors;

const hordeSnapshotProjectors = {
  id: ({ horde }) => horde.id,
  type: ({ horde }) => horde.type,
  home: ({ horde }) => [...horde.home],
  target: ({ horde }) => [...horde.target],
  mode: ({ horde }) => horde.mode,
  roamTimer: ({ horde }) => horde.roamTimer,
  stimulusAt: ({ horde }) => horde.stimulusAt,
  lastNoiseId: ({ horde }) => horde.lastNoiseId,
  rng: ({ rng }) => [...rng.state()] as RngState,
} satisfies HordeSnapshotProjectors;

const snapshotZombie = (id: number, zombie: Zombie): { id: number; zombie: ZombieSnapshot } => ({
  id,
  zombie: projectSnapshot(zombie, zombieSnapshotProjectors) as ZombieSnapshot,
});

const snapshotHorde = (horde: Omit<HordeState, 'rng'>, rng: Rng): HordeSnapshot =>
  projectSnapshot({ horde, rng }, hordeSnapshotProjectors) as HordeSnapshot;

/** The nearest region a ray strikes, and for an amalgam the flesh cell. */
interface RegionHit {
  readonly id: EntityId;
  readonly zombie: Zombie;
  readonly region: ZombieHitRegion;
  /** In blocks along the ray. */
  readonly distance: number;
  readonly boxes: readonly PosedBoneBox[];
  readonly box: PosedBoneBox;
  readonly cell: number | undefined;
}

/**
 * Shoves a body off the terrain its shape's turn of `turn` radians swung into, if a push can, and drops its
 * velocity back toward what it was pushed off; see ZombieSystem.settleTurn.
 */
const pushTurn = (body: Body, shape: AmalgamShape, turn: number): boolean => {
  const { pos, vel } = body;
  const push = shape.pushOut(pos, turn * shape.radius);
  if (!push) {
    return false;
  }
  pos[0] += push[0];
  pos[2] += push[2];
  const away = unit(push);
  const back = Math.min(0, vel[0] * away[0] + vel[2] * away[2]);
  vel[0] -= back * away[0];
  vel[2] -= back * away[2];
  return true;
};

/** An amalgam body's exact shape, and the last facing it turned to clear of terrain. */
interface AmalgamCollider {
  readonly zombie: Zombie;
  readonly shape: AmalgamShape;
  facing: Vec3;
  /** Where it last came to rest on the ground, so a step that could change nothing is skipped. */
  rest?: { readonly pos: Vec3; readonly facing: Vec3; readonly version: number } | undefined;
}

export class ZombieSystem {
  readonly store: EntityStore<Zombie>;
  private readonly options: ZombieSystemOptions;
  private globs: { state: AcidGlobState; type: ZombieDef }[] = [];
  private puddles: { state: AcidPuddleState; type: ZombieDef }[] = [];
  private nextPuddleId = 0;

  get acidPuddles(): readonly Readonly<AcidPuddleState>[] {
    return this.puddles.map(({ state }) => state);
  }

  get acidGlobs(): readonly Readonly<AcidGlobState>[] {
    return this.globs.map(({ state }) => state);
  }
  private readonly tickScratch = createZombieTickScratch();
  private readonly chainStimuli: { caller: Zombie; origin: Vec3; target: Vec3 }[] = [];
  private readonly hordes = new Map<string, { state: Omit<HordeState, 'rng'>; rng: Rng }>();
  private frozen = false;
  private readonly solidBricks: SolidBricks;
  /** Per body: its amalgam's shape and the last facing it turned to without meeting terrain; null otherwise. */
  private readonly shapes = new WeakMap<Body, AmalgamCollider | null>();
  private readonly missing = new WeakMap<
    Zombie,
    { carved: readonly number[]; severed: number; missing: MissingFlesh }
  >();

  constructor(options: ZombieSystemOptions) {
    this.options = options;
    this.store = options.store ?? new MapEntityStore<Zombie>();
    this.solidBricks = options.solidBricks ?? testedBricks(options.isSolid);
  }

  /** The amalgam's flesh as its body's shape, turned to its facing; every other body moves as its box. */
  readonly shapeOf: ShapeOf = (body) => this.colliderOf(body)?.shape;

  private colliderOf(body: Body): AmalgamCollider | undefined {
    let collider = this.shapes.get(body);
    if (collider === undefined) {
      const zombie = [...this.store.entries()].find(([, candidate]) => candidate.body === body)?.[1];
      collider =
        zombie?.type.model === 'amalgam'
          ? {
              zombie,
              shape: new AmalgamShape(
                amalgamFigureForType(zombie.type, zombie.figureSeed),
                this.options.blockSize,
                this.solidBricks,
              ),
              facing: copy(zombie.facing),
            }
          : null;
      this.shapes.set(body, collider);
    }
    if (!collider) {
      return undefined;
    }
    const { zombie, shape } = collider;
    shape.keep(zombie.carved, zombie.severed.length, () => this.missingFor(zombie));
    shape.face(zombie.facing);
    return collider;
  }

  /** The flesh an amalgam has lost, rebuilt only when its holes or severed members change. */
  private missingFor(zombie: Zombie): MissingFlesh {
    const cached = this.missing.get(zombie);
    if (cached && cached.carved === zombie.carved && cached.severed === zombie.severed.length) {
      return cached.missing;
    }
    const missing = missingFlesh(amalgamFigureForType(zombie.type, zombie.figureSeed), zombie);
    this.missing.set(zombie, { carved: zombie.carved, severed: zombie.severed.length, missing });
    return missing;
  }

  /**
   * Turns an amalgam clear of terrain. A turn that swings its flesh into terrain shoves the body off it by the
   * shortest push that frees the turned flesh, as a body against a wall pivots off it to turn, and that tick
   * it doesn't also move back into what it was pushed off. When no push as far as the turn moved its flesh
   * frees it, it keeps the last facing that was clear. If both overlap (it started in terrain), the turn stands.
   */
  private settleTurn(zombie: Zombie): void {
    const collider = this.colliderOf(zombie.body);
    if (!collider) {
      return;
    }
    const { facing, shape } = collider;
    if (zombie.facing[0] === facing[0] && zombie.facing[1] === facing[1] && zombie.facing[2] === facing[2]) {
      return;
    }
    const { pos } = zombie.body;
    if (shape.overlapsTerrain(pos)) {
      shape.face(facing);
      const wasClear = !shape.overlapsTerrain(pos);
      shape.face(zombie.facing);
      const turn = Math.abs(wrapAngle(angleOf(zombie.facing) - angleOf(facing)));
      if (wasClear && !pushTurn(zombie.body, shape, turn)) {
        shape.face(facing);
        zombie.facing = copy(facing);
        return;
      }
    }
    collider.facing = copy(zombie.facing);
  }
  /**
   * Whether an amalgam's step this tick could change nothing, so its shape tests are skipped: it rests on
   * the ground where it last came to rest, neither moving nor turning, and no solid block has changed.
   */
  private restsStill(zombie: Zombie): boolean {
    const rest = this.colliderOf(zombie.body)?.rest;
    const { body, facing } = zombie;
    if (
      !(rest && body.onGround) ||
      body.vel[0] !== 0 ||
      body.vel[1] > 0 ||
      body.vel[2] !== 0 ||
      rest.version !== this.solidBricks.version ||
      rest.pos.some((value, axis) => value !== body.pos[axis]) ||
      rest.facing.some((value, axis) => value !== facing[axis])
    ) {
      return false;
    }
    body.vel[1] = 0;
    return true;
  }

  private noteRest(zombie: Zombie): void {
    const collider = this.colliderOf(zombie.body);
    if (collider) {
      collider.rest = zombie.body.onGround
        ? { pos: copy(zombie.body.pos), facing: copy(zombie.facing), version: this.solidBricks.version }
        : undefined;
    }
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  /** Debug-only caller-controlled pause for living shambler AI; this state is deliberately not saved. */
  setFrozen(frozen: boolean): void {
    if (this.frozen === frozen) {
      return;
    }
    this.frozen = frozen;
    if (frozen) {
      for (const [, zombie] of this.store.entries()) {
        this.captureRenderPrevious(zombie);
        if (!zombie.incapacitated) {
          zombie.attackWindup = 0;
          zombie.spitWindup = 0;
        }
      }
    }
  }

  private captureRenderPrevious(zombie: Zombie, time?: number): void {
    zombie.renderPrevious = {
      pos: copy(zombie.body.pos),
      facing: copy(zombie.facing),
      headYaw: zombie.headYaw,
      gaitPhase: zombie.gaitPhase,
      ...(time === undefined ? {} : { time }),
    };
  }

  snapshotState(): Readonly<ZombieSystemState> {
    return freezeSnapshot({
      nextEntityId: this.store.nextId,
      nextPuddleId: this.nextPuddleId,
      zombies: [...this.store.entries()].map(([id, zombie]) => snapshotZombie(id, zombie)),
      hordes: [...this.hordes.values()].map(({ state: horde, rng }) => snapshotHorde(horde, rng)),
      acidGlobs: this.globs.map(({ state }) => ({ ...state, pos: [...state.pos], velocity: [...state.velocity] })),
      acidPuddles: this.puddles.map(({ state }) => ({ ...state, pos: [...state.pos] })),
    });
  }

  private restorePuddles(state: ZombieSystemState, resolveType: (id: string) => ZombieDef | undefined) {
    if (!Number.isSafeInteger(state.nextPuddleId) || state.nextPuddleId < 0) {
      throw new Error('Invalid acid puddle sequence');
    }
    const puddleIds = new Set<number>();
    return state.acidPuddles.map((puddle) => {
      const type = resolveType(puddle.type);
      if (
        !(
          type?.acidSpit &&
          validVec3State(puddle.pos) &&
          Number.isFinite(puddle.remainingSimSeconds) &&
          Number.isSafeInteger(puddle.id)
        ) ||
        puddle.id < 0 ||
        puddle.id >= state.nextPuddleId ||
        puddleIds.has(puddle.id) ||
        puddle.remainingSimSeconds <= 0 ||
        !Number.isFinite(puddle.damagePerSimSecond) ||
        puddle.damagePerSimSecond < 0
      ) {
        throw new Error('Invalid acid puddle state');
      }
      puddleIds.add(puddle.id);
      return { state: { ...puddle, pos: copy(puddle.pos) }, type: type! };
    });
  }

  restoreState(state: ZombieSystemState, resolveType: (id: string) => ZombieDef | undefined): void {
    if (this.store.size > 0) {
      throw new Error('Zombie state restores only into an empty entity store');
    }
    const puddles = this.restorePuddles(state, resolveType);
    const globs = state.acidGlobs.map((glob) => {
      const type = resolveType(glob.type);
      const valid =
        type?.acidSpit?.moves.some((move) => move.id === glob.move) &&
        Number.isSafeInteger(glob.source) &&
        glob.source >= 1 &&
        glob.source < state.nextEntityId &&
        validVec3State(glob.pos) &&
        validVec3State(glob.velocity) &&
        Number.isFinite(glob.damage) &&
        glob.damage >= 0 &&
        Number.isFinite(glob.puddleDamagePerSimSecond) &&
        glob.puddleDamagePerSimSecond >= 0 &&
        Number.isFinite(glob.regionRoll) &&
        glob.regionRoll >= 0 &&
        glob.regionRoll < 1;
      if (!(type && valid)) {
        throw new Error('Invalid acid glob state');
      }
      return { state: { ...glob, pos: copy(glob.pos), velocity: copy(glob.velocity) }, type };
    });
    const entries = state.zombies.map(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validate every persisted zombie invariant before mutating the entity store.
      ({ id, zombie }) => {
        if (
          !Number.isSafeInteger(id) ||
          id < 1 ||
          !validRngState(zombie.behaviorRng) ||
          !validRngState(zombie.soundRng) ||
          !validRngState(zombie.dismemberRng) ||
          !validRngState(zombie.spitRng) ||
          !validSpitTimers(zombie) ||
          !validStaggerTime(zombie) ||
          !Number.isFinite(zombie.idleSoundTimer) ||
          zombie.idleSoundTimer < 0 ||
          !validZombieEventState(zombie) ||
          !validHordeMemberState(zombie) ||
          !Number.isSafeInteger(zombie.figureSeed) ||
          !validHitFlinchTime(zombie.hitFlinchTime) ||
          !validStanceWeight(zombie.stanceWeight) ||
          !validStepOffset(zombie.stepOffset) ||
          !validObstacleWanderState(zombie) ||
          typeof zombie.incapacitated !== 'boolean'
        ) {
          throw new Error(`Invalid zombie state for entity ${id}`);
        }
        const type = resolveType(zombie.type);
        if (!type) {
          throw new Error(`Missing zombie type ${zombie.type}`);
        }
        if (type.model === 'amalgam' && zombie.figureSeed !== AMALGAM_FIGURE_SEED) {
          throw new Error(`Invalid amalgam figure seed for entity ${id}`);
        }
        if (type.model !== 'amalgam' && !requiredFigureSeeds(type).includes(zombie.figureSeed)) {
          throw new Error(`Invalid zombie state for entity ${id}`);
        }
        const expectedRegions = zombieRegionsFor(type, zombie.figureSeed);
        const expectedRegionIds = Object.keys(expectedRegions);
        if (
          !zombie.regions ||
          Object.keys(zombie.regions).length !== expectedRegionIds.length ||
          expectedRegionIds.some((region) => {
            const health = zombie.regions[region];
            return !Number.isFinite(health) || health! < 0 || health! > expectedRegions[region]!;
          })
        ) {
          throw new Error(`Invalid zombie regions for entity ${id}`);
        }
        if (type.model === 'amalgam') {
          const envelope = amalgamCollisionEnvelope(
            amalgamFigureForType(type, zombie.figureSeed),
            this.options.blockSize,
          );
          if (
            zombie.body.halfWidth !== envelope.halfWidth ||
            zombie.body.halfDepth !== envelope.halfDepth ||
            zombie.body.height !== envelope.height
          ) {
            throw new Error(`Invalid amalgam collision envelope for entity ${id}`);
          }
          const validParts = new Set(
            amalgamFigureForType(type, zombie.figureSeed)
              .manifest.parts.filter((part) => part.severable)
              .map((part) => part.id),
          );
          if (
            new Set(zombie.severed).size !== zombie.severed.length ||
            zombie.severed.some((part) => !validParts.has(part))
          ) {
            throw new Error(`Invalid amalgam severed parts for entity ${id}`);
          }
        }
        if (!validCarvedCells(type, zombie.figureSeed, zombie.carved)) {
          throw new Error(`Invalid carved cells for entity ${id}`);
        }
        if (zombie.spitWindup > 0 && type.acidSpit === undefined) {
          throw new Error(`Invalid acid spit state for entity ${id}`);
        }
        const { type: _type, behaviorRng, soundRng, dismemberRng, spitRng, lastVocalNoiseId, ...fields } = zombie;
        const restored: Zombie = {
          ...fields,
          type,
          modifiers: [],
          regions: { ...zombie.regions },
          behaviorRng: new Rng(behaviorRng),
          soundRng: new Rng(soundRng),
          dismemberRng: new Rng(dismemberRng),
          spitRng: new Rng(spitRng),
          lastVocalNoiseId: lastVocalNoiseId ?? undefined,
          footstepClock: { ...zombie.footstepClock },
          body: { ...zombie.body, pos: [...zombie.body.pos], vel: [...zombie.body.vel] },
          facing: [...zombie.facing],
          home: [...zombie.home],
          ...(zombie.searchAnchor === undefined ? {} : { searchAnchor: [...zombie.searchAnchor] }),
          searchHeading: [...zombie.searchHeading],
          strollHeading: [...zombie.strollHeading],
          ...(zombie.obstacleWanderHeading === undefined
            ? {}
            : { obstacleWanderHeading: [...zombie.obstacleWanderHeading] as Vec3 }),
          ...(zombie.hordeOffset === undefined ? {} : { hordeOffset: [...zombie.hordeOffset] as Vec3 }),
          ...(zombie.lastPerceived === undefined ? {} : { lastPerceived: [...zombie.lastPerceived] }),
          tier: this.tierAt(zombie.body.pos, this.options.player()),
          renderPrevious: {
            pos: [...zombie.body.pos],
            facing: [...zombie.facing],
            headYaw: zombie.headYaw,
            gaitPhase: zombie.gaitPhase,
          },
          severed: [...zombie.severed],
          carved: [...zombie.carved],
        };
        return [id, restored] as const;
      },
    );
    this.store.restore(entries, state.nextEntityId);
    this.globs = globs;
    this.puddles = puddles;
    this.nextPuddleId = state.nextPuddleId;
    this.hordes.clear();
    for (const horde of state.hordes ?? []) {
      if (!validHordeSnapshotState(horde, this.hordes.has(horde.id), resolveType)) {
        throw new Error(`Invalid horde state ${horde.id}`);
      }
      this.hordes.set(horde.id, {
        state: {
          id: horde.id,
          type: horde.type,
          home: [...horde.home],
          target: [...horde.target],
          mode: horde.mode,
          roamTimer: horde.roamTimer,
          ...(horde.stimulusAt === undefined ? {} : { stimulusAt: horde.stimulusAt }),
          lastNoiseId: horde.lastNoiseId,
        },
        rng: new Rng(horde.rng),
      });
    }
    for (const [, zombie] of this.store.entries()) {
      if (zombie.hordeId !== undefined) {
        const horde = this.hordes.get(zombie.hordeId)?.state;
        if (!horde || horde.type !== zombie.type.id) {
          throw new Error(`Missing or mismatched horde ${zombie.hordeId} for zombie`);
        }
      }
    }
  }

  private tickLookAround(zombie: Zombie, dt: number): void {
    const { type, behaviorRng: rng } = zombie;
    zombie.lookTimer -= dt;
    if (zombie.lookTimer <= 0) {
      zombie.bodyLookTarget =
        angleOf(zombie.facing) +
        rng.range(-type.wander.bodyLookArcDegrees, type.wander.bodyLookArcDegrees) * 0.5 * (Math.PI / 180);
      zombie.headYawTarget =
        rng.range(-type.wander.headLookArcDegrees, type.wander.headLookArcDegrees) * 0.5 * (Math.PI / 180);
      zombie.lookTimer = inRange(rng, type.wander.lookIntervalSimSeconds);
    }
    zombie.facing = turnToward(
      zombie.facing,
      headingAt(zombie.bodyLookTarget),
      (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
    );
    zombie.headYaw = approachAngle(
      zombie.headYaw,
      zombie.headYawTarget,
      (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180,
    );
  }

  private beginIdle(zombie: Zombie): void {
    zombie.mode = 'idle';
    zombie.investigationTier = undefined;
    zombie.searchAnchor = undefined;
    zombie.searchTimer = 0;
    zombie.searchStrolling = false;
    zombie.modeTimer = inRange(zombie.behaviorRng, zombie.type.wander.idleSimSeconds);
    zombie.lookTimer = 0;
    zombie.bodyLookTarget = angleOf(zombie.facing);
    zombie.headYawTarget = 0;
    zombie.horizontalSpeed = 0;
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
  }

  private beginStroll(zombie: Zombie): void {
    const { type, body, home, behaviorRng } = zombie;
    const duration = inRange(behaviorRng, type.wander.strollSimSeconds);
    let heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    if (zombie.leanTarget) {
      const toward = unit(sub(zombie.leanTarget, body.pos));
      const weight = type.hearingModel.refusalLean;
      heading = unit([
        heading[0] * (1 - weight) + toward[0] * weight,
        0,
        heading[2] * (1 - weight) + toward[2] * weight,
      ]);
      zombie.leanTarget = undefined;
    }
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, home) * this.options.blockSize > type.wander.leashMetres) {
      heading = unit([home[0] - body.pos[0], 0, home[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    }
    zombie.mode = 'stroll';
    zombie.investigationTier = undefined;
    zombie.searchAnchor = undefined;
    zombie.searchTimer = 0;
    zombie.searchStrolling = false;
    zombie.modeTimer = duration;
    zombie.strollHeading = heading;
    zombie.bodyLookTarget = angleOf(heading);
    zombie.headYawTarget = 0;
  }

  private beginSearch(zombie: Zombie): void {
    const { type, behaviorRng: rng } = zombie;
    zombie.mode = 'search';
    zombie.investigationTier = undefined;
    zombie.searchAnchor = copy(zombie.lastPerceived ?? zombie.body.pos);
    zombie.searchTimer = inRange(rng, type.hearingModel.searchSimSeconds);
    zombie.searchStrolling = false;
    zombie.searchHeading = copy(zombie.facing);
    zombie.modeTimer = inRange(rng, type.wander.idleSimSeconds);
    zombie.lookTimer = 0;
    zombie.bodyLookTarget = angleOf(zombie.facing);
    zombie.headYawTarget = 0;
    zombie.horizontalSpeed = 0;
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
  }

  private beginSearchStroll(zombie: Zombie): void {
    const { type, body, searchAnchor, behaviorRng: rng } = zombie;
    if (!searchAnchor) {
      return;
    }
    const duration = Math.min(inRange(rng, type.hearingModel.searchStrollSimSeconds), zombie.searchTimer);
    let heading = headingAt(rng.range(-Math.PI, Math.PI));
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, searchAnchor) * this.options.blockSize > type.hearingModel.searchRadiusMetres) {
      heading = unit([searchAnchor[0] - body.pos[0], 0, searchAnchor[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(rng.range(-Math.PI, Math.PI));
    }
    zombie.searchStrolling = true;
    zombie.searchHeading = heading;
    zombie.modeTimer = duration;
    zombie.bodyLookTarget = angleOf(heading);
    zombie.headYawTarget = 0;
  }

  private stepChaseMotion(zombie: Zombie, dt: number): { sway: number; speedFactor: number } {
    const { chaseMotion } = zombie.type;
    const rng = zombie.behaviorRng;
    if (zombie.swayDuration === 0 || zombie.swayElapsed >= zombie.swayDuration) {
      zombie.swayStart = zombie.swayValue;
      zombie.swayTarget = rng.range(-chaseMotion.swayDegrees, chaseMotion.swayDegrees);
      zombie.swayDuration = inRange(rng, chaseMotion.swayIntervalSimSeconds);
      zombie.swayElapsed = 0;
    } else {
      zombie.swayElapsed = Math.min(zombie.swayDuration, zombie.swayElapsed + dt);
    }
    zombie.swayValue = lerp(zombie.swayStart, zombie.swayTarget, smooth01(zombie.swayElapsed / zombie.swayDuration));

    if (zombie.lurchDuration === 0 || zombie.lurchElapsed >= zombie.lurchDuration) {
      zombie.lurchStart = zombie.lurchValue;
      zombie.lurchTarget = inRange(rng, chaseMotion.speedMultiplier);
      zombie.lurchDuration = chaseMotion.lurchSimSeconds;
      zombie.lurchElapsed = 0;
    } else {
      zombie.lurchElapsed = Math.min(zombie.lurchDuration, zombie.lurchElapsed + dt);
    }
    zombie.lurchValue = lerp(
      zombie.lurchStart,
      zombie.lurchTarget,
      smooth01(zombie.lurchElapsed / zombie.lurchDuration),
    );

    if (zombie.stumbleDuration === 0 && rng.chance(chaseMotion.stumbleChancePerSimSecond * dt)) {
      zombie.stumbleDuration = inRange(rng, chaseMotion.stumbleDurationSimSeconds);
      zombie.stumbleElapsed = 0;
    }
    if (zombie.stumbleDuration > 0) {
      zombie.stumbleElapsed = Math.min(zombie.stumbleDuration, zombie.stumbleElapsed + dt);
      const entering = smooth01(Math.min(1, zombie.stumbleElapsed / chaseMotion.stumbleEaseSimSeconds));
      const leaving = smooth01(
        Math.min(1, (zombie.stumbleDuration - zombie.stumbleElapsed) / chaseMotion.stumbleEaseSimSeconds),
      );
      const depth = Math.min(entering, leaving);
      zombie.stumbleFactor = 1 - depth * (1 - chaseMotion.stumbleSpeedFraction);
      if (zombie.stumbleElapsed >= zombie.stumbleDuration) {
        zombie.stumbleDuration = 0;
        zombie.stumbleElapsed = 0;
        zombie.stumbleFactor = 1;
      }
    }
    return {
      sway: zombie.swayValue * (Math.PI / 180),
      speedFactor: zombie.lurchValue * zombie.stumbleFactor,
    };
  }

  add(type: ZombieDef, position: Vec3, facing: Vec3 = [0, 0, -1]): EntityId {
    const direction = unit(facing);
    const figureSeed =
      type.model === 'amalgam'
        ? AMALGAM_FIGURE_SEED
        : requiredFigureSeeds(type)[
            Rng.stream(this.options.seed ?? 0, `zombie-figure:${this.store.nextId}`).int(
              0,
              requiredFigureSeeds(type).length - 1,
            )
          ]!;
    const dimensions = zombieBodyDimensions(type, this.options.blockSize);
    const zombie: Zombie = {
      type,
      modifiers: [],
      tier: this.tierAt(position, this.options.player()),
      body: {
        pos: copy(position),
        vel: [0, 0, 0],
        halfWidth: dimensions.halfWidth,
        ...(dimensions.halfDepth === undefined ? {} : { halfDepth: dimensions.halfDepth }),
        height: dimensions.height,
        onGround: false,
      },
      facing: direction,
      home: copy(position),
      mode: 'idle',
      investigationTier: undefined,
      behaviorRng: Rng.stream(this.options.seed ?? 0, `zombie:${this.store.size + 1}`),
      soundRng: Rng.stream(this.options.seed ?? 0, `zombie-sound:${this.store.size + 1}`),
      dismemberRng: Rng.stream(this.options.seed ?? 0, `zombie-dismember:${this.store.size + 1}`),
      spitRng: Rng.stream(this.options.seed ?? 0, `zombie-spit:${this.store.size + 1}`),
      idleSoundTimer: 8,
      modeTimer: 0,
      searchAnchor: undefined,
      searchTimer: 0,
      searchStrolling: false,
      searchHeading: copy(direction),
      strollHeading: copy(direction),
      horizontalSpeed: 0,
      obstacleWanderRemaining: 0,
      obstacleContact: false,
      obstacleSlideSide: 0,
      bodyLookTarget: angleOf(direction),
      headYaw: 0,
      headYawTarget: 0,
      lookTimer: 0,
      swayValue: 0,
      swayStart: 0,
      swayTarget: 0,
      swayElapsed: 0,
      swayDuration: 0,
      lurchValue: 1,
      lurchStart: 1,
      lurchTarget: 1,
      lurchElapsed: 0,
      lurchDuration: 0,
      stumbleFactor: 1,
      stumbleElapsed: 0,
      stumbleDuration: 0,
      renderPrevious: { pos: copy(position), facing: copy(direction), headYaw: 0, gaitPhase: 0 },
      regions: zombieRegionsFor(type, figureSeed),
      figureSeed,
      incapacitated: false,
      attackWait: 0,
      attackWindup: 0,
      spitWindup: 0,
      staggerSimSeconds: 0,
      spitWait: 0,
      gaitPhase: 0,
      footstepClock: initialShamblerFootstepClock(type.stepLength),
      wanderClock: 0,
      stepOffset: 0,
      severed: [],
      carved: [],
    };
    const id = this.store.add(zombie);
    // EntityStore ids are stable within the world's entity lifetime.
    zombie.behaviorRng = Rng.stream(this.options.seed ?? 0, `zombie:${id}`);
    zombie.soundRng = Rng.stream(this.options.seed ?? 0, `zombie-sound:${id}`);
    zombie.dismemberRng = Rng.stream(this.options.seed ?? 0, `zombie-dismember:${id}`);
    zombie.spitRng = Rng.stream(this.options.seed ?? 0, `zombie-spit:${id}`);
    zombie.idleSoundTimer = 8 + zombie.soundRng.range(0, 12);
    this.beginIdle(zombie);
    return id;
  }

  addHorde(id: string, type: ZombieDef, center: Vec3, count: number): void {
    if (!id || this.hordes.has(id) || !Number.isSafeInteger(count) || count < 1 || !center.every(Number.isFinite)) {
      throw new Error(`Invalid or duplicate horde ${id}`);
    }
    const state = {
      id,
      type: type.id,
      home: copy(center),
      target: copy(center),
      mode: 'home' as const,
      roamTimer: 0,
      lastNoiseId: 0,
    };
    const rng = Rng.stream(this.options.seed ?? 0, `horde:${id}`);
    this.hordes.set(id, { state, rng });
    const { innerMetres, stepMetres } = type.hordeSpacing;
    for (let index = 0; index < count; index++) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radiusMetres = innerMetres + stepMetres * Math.sqrt(index);
      const offset: Vec3 = [
        (Math.cos(angle) * radiusMetres) / this.options.blockSize,
        0,
        (Math.sin(angle) * radiusMetres) / this.options.blockSize,
      ];
      const position: Vec3 = [center[0] + offset[0], center[1], center[2] + offset[2]];
      const member = this.store.get(this.add(type, position, [center[0] - position[0], 0, center[2] - position[2]]))!;
      member.hordeId = id;
      member.hordeOffset = offset;
      member.home = copy(position);
      member.body.onGround = true;
    }
  }

  /** A horde sent from `center` to `target`, which also becomes its home once it arrives. */
  releaseHorde(id: string, type: ZombieDef, { center, count, target }: { center: Vec3; count: number; target: Vec3 }) {
    this.addHorde(id, type, center, count);
    const horde = this.hordes.get(id)!.state;
    horde.home = copy(target);
    horde.target = copy(target);
    horde.mode = 'release';
  }

  private tickFrozen(dt: number, entries: readonly (readonly [EntityId, Zombie])[] = [...this.store.entries()]): void {
    for (const [, zombie] of entries) {
      this.captureRenderPrevious(zombie);
      if (!zombie.incapacitated) {
        continue;
      }
      this.tickIncapacitated(zombie, dt);
    }
  }

  private tierAt(position: Vec3, player: PlayerSense): ZombieTier {
    const loaded = this.options.isLoaded?.(position[0], position[2]) ?? true;
    if (!loaded) {
      return 'unloaded';
    }
    return horizontalDistance(position, player.pos) * this.options.blockSize <= this.options.activeZombieRadiusMetres
      ? 'active'
      : 'background';
  }

  private classifyTiers(player: PlayerSense): readonly (readonly [EntityId, Zombie])[] {
    const entries = [...this.store.entries()];
    for (const [, zombie] of entries) {
      zombie.tier = this.tierAt(zombie.body.pos, player);
    }
    return entries;
  }

  private hordeCenter(id: string): Vec3 | undefined {
    const members = [...this.store.entries()].flatMap(([, zombie]) => (zombie.hordeId === id ? [zombie] : []));
    if (members.length === 0) {
      return undefined;
    }
    return members.reduce<Vec3>(
      (sum, zombie) => [
        sum[0] + zombie.body.pos[0] / members.length,
        sum[1] + zombie.body.pos[1] / members.length,
        sum[2] + zombie.body.pos[2] / members.length,
      ],
      [0, 0, 0],
    );
  }

  private hordeTarget(zombie: Zombie): Vec3 | undefined {
    if (zombie.hordeId === undefined || zombie.hordeOffset === undefined) {
      return undefined;
    }
    const horde = this.hordes.get(zombie.hordeId)?.state;
    return horde
      ? [
          horde.target[0] + zombie.hordeOffset[0],
          horde.target[1] + zombie.hordeOffset[1],
          horde.target[2] + zombie.hordeOffset[2],
        ]
      : undefined;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep ordered noise, arrival, and night-roam transitions together as one horde state machine.
  private updateHordes(dt: number, time: number, player: PlayerSense, dayPhase: DayPhase): void {
    const { blockSize } = this.options;
    const isSolid = this.options.isSoundBlocking ?? this.options.isSolid;
    for (const { state: horde, rng } of this.hordes.values()) {
      const center = this.hordeCenter(horde.id);
      const member = [...this.store.entries()].find(([, zombie]) => zombie.hordeId === horde.id)?.[1];
      if (!(center && member)) {
        continue;
      }
      const noise = player.vocalNoise;
      if (noise && noise.id !== horde.lastNoiseId) {
        horde.lastNoiseId = noise.id;
        const heard = hearVocalNoise({
          zombie: member.type,
          from: center,
          noise,
          time,
          blockSize,
          isSolid,
          rng,
          tuning: this.options.tuning,
        });
        if (heard) {
          horde.target = copy(heard.target);
          horde.mode = 'noise';
          horde.stimulusAt = time;
        }
      }
      const night = dayPhase !== 'day';
      const arrived = horizontalDistance(center, horde.target) * blockSize <= 3;
      if (
        horde.mode === 'noise' &&
        horde.stimulusAt !== undefined &&
        time - horde.stimulusAt >= member.type.stimulusMemorySimSeconds
      ) {
        horde.mode = night ? 'roam' : 'home';
        horde.stimulusAt = undefined;
        horde.roamTimer = 0;
      }
      if ((horde.mode === 'noise' || horde.mode === 'release') && arrived) {
        horde.mode = night ? 'roam' : 'home';
        horde.stimulusAt = undefined;
        horde.roamTimer = 0;
      }
      const driven = horde.mode === 'noise' || horde.mode === 'release';
      if (!(night || driven)) {
        horde.mode = 'home';
        horde.target = copy(horde.home);
        horde.roamTimer = 0;
      } else if (night && !driven) {
        horde.roamTimer -= dt;
        if (horde.mode !== 'roam' || horde.roamTimer <= 0 || arrived) {
          const angle = rng.range(-Math.PI, Math.PI);
          const distance = rng.range(12, 20) / blockSize;
          horde.target = [center[0] + Math.cos(angle) * distance, center[1], center[2] + Math.sin(angle) * distance];
          horde.mode = 'roam';
          horde.roamTimer = rng.range(16, 28);
        }
      }
    }
  }

  /** Advances one deterministic slice of distant actors; scheduler ticks every slice, each actor every half-second. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep per-actor perception, target selection, and bounded collision step together.
  tickBackground(dt: number, time: number, sliceIndex = 0, sliceCount = 1): void {
    if (dt <= 0 || this.frozen) {
      return;
    }
    const player = this.options.player();
    const dayState = this.options.dayPhase();
    if (sliceIndex === 0) {
      this.updateHordes(dt, time, player, dayState.phase);
    }
    const { blockSize, isSolid } = this.options;
    const physics = { ...this.options.physics, obstacles: player.body ? [player.body] : [], shapeOf: this.shapeOf };
    const scratch = this.tickScratch;
    scratch.dt = dt;
    scratch.time = time;
    scratch.player = player;
    scratch.dayState = dayState;
    scratch.blockSize = blockSize;
    scratch.isSolid = isSolid;
    scratch.isOpaque = this.options.isOpaque;
    const entries = [...this.store.entries()].filter(
      ([id, zombie]) => zombie.tier === 'background' && id % sliceCount === sliceIndex,
    );
    for (const [id, zombie] of entries) {
      this.captureRenderPrevious(zombie, time);
      if (zombie.incapacitated) {
        this.tickIncapacitated(zombie, dt);
        continue;
      }
      scratch.id = id;
      scratch.zombie = zombie;
      scratch.pos = zombie.body.pos;
      scratch.type = zombie.type;
      scratch.rng = zombie.behaviorRng;
      this.updateZombieTimers();
      this.updatePerception();
      this.updateAttention();
      this.forgetIndividualStimulus(zombie, time);
    }
    this.processChainStimuli(time);
    for (const [id, zombie] of entries) {
      if (zombie.incapacitated) {
        continue;
      }
      scratch.id = id;
      scratch.zombie = zombie;
      scratch.pos = zombie.body.pos;
      scratch.type = zombie.type;
      scratch.rng = zombie.behaviorRng;
      let target = zombie.mode === 'hesitate' ? undefined : (this.hordeTarget(zombie) ?? zombie.lastPerceived);
      scratch.sees = zombie.mode === 'chase';
      if (scratch.sees) {
        target = player.pos;
      }
      let direction: Vec3;
      let speed: number;
      if (target) {
        const offset = sub(target, zombie.body.pos);
        const distance = Math.hypot(offset[0], offset[2]) * blockSize;
        direction = distance > 0.5 ? unit([offset[0], 0, offset[2]]) : [0, 0, 0];
        speed =
          distance > 0.5
            ? Math.min(
                zombie.type.speed.chaseMetresPerSimSecond,
                zombie.type.speed.backgroundStepMetres / dt,
                distance / dt,
              )
            : 0;
        if (direction[0] !== 0 || direction[2] !== 0) {
          zombie.facing = copy(direction);
        }
      } else {
        this.selectMovementIntent();
        const { direction: movementDirection, desiredSpeed } = scratch;
        direction = movementDirection;
        speed = desiredSpeed;
      }
      if (zombie.staggerSimSeconds > 0 || this.options.restrained?.(id) === true) {
        speed = 0;
      }
      zombie.horizontalSpeed = speed;
      zombie.body.vel[0] = (direction[0] * speed) / blockSize;
      zombie.body.vel[2] = (direction[2] * speed) / blockSize;
      const before = copy(zombie.body.pos);
      this.settleTurn(zombie);
      if (zombie.body.onGround) {
        stepBodyHorizontal(zombie.body, {
          dx: zombie.body.vel[0] * dt,
          dz: zombie.body.vel[2] * dt,
          isSolid,
          params: physics,
        });
      } else {
        stepBody(zombie.body, dt, isSolid, physics);
      }
      const travelled = horizontalDistance(before, zombie.body.pos) * blockSize;
      zombie.gaitPhase += (travelled / zombie.type.stepLength) * Math.PI;
      if (zombie.mode === 'stroll' && zombie.modeTimer <= 0 && zombie.horizontalSpeed <= 0.01) {
        this.beginIdle(zombie);
      }
    }
  }

  private tickIncapacitated(zombie: Zombie, dt: number): void {
    zombie.horizontalSpeed = 0;
    zombie.attackWait = 0;
    zombie.attackWindup = 0;
    zombie.spitWindup = 0;
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
    stepBody(zombie.body, dt, this.options.isSolid, { ...this.options.physics, obstacles: [], shapeOf: this.shapeOf });
  }

  private updateZombieTimers(): void {
    const { zombie, dt } = this.tickScratch;
    if (zombie.hitFlinchTime !== undefined) {
      const nextFlinchTime = zombie.hitFlinchTime + dt;
      zombie.hitFlinchTime = nextFlinchTime > HIT_FLINCH_DURATION ? undefined : nextFlinchTime;
    }
    zombie.attackWait = Math.max(0, zombie.attackWait - dt);
    zombie.spitWait = Math.max(0, zombie.spitWait - dt);
    zombie.staggerSimSeconds = Math.max(0, zombie.staggerSimSeconds - dt);
  }

  private updatePerception(): void {
    const scratch = this.tickScratch;
    const { zombie, type, pos, player, dayState, blockSize, isOpaque, time, rng, perception } = scratch;
    const soundBlocking = this.options.isSoundBlocking ?? scratch.isSolid;
    perception.zombie = type;
    perception.from = pos;
    perception.facing = zombie.facing;
    perception.player = player;
    perception.dayPhase = dayState.phase;
    perception.sightBlend = dayState.sightBlend;
    perception.blockSize = blockSize;
    perception.isSolid = isOpaque;
    perception.isSunExposedAt = this.options.isSunExposedAt;
    perception.tuning = this.options.tuning;
    scratch.sees = seesPlayer(perception);
    scratch.lightTarget = visibleLightTarget({
      zombie: type,
      from: pos,
      facing: zombie.facing,
      player,
      dayPhase: dayState.phase,
      blockSize,
      isOpaque,
      isSunExposedAt: this.options.isSunExposedAt,
      tuning: this.options.tuning,
    });
    if (
      scratch.lightTarget &&
      zombie.lastPerceived?.every((coordinate, axis) => coordinate === scratch.lightTarget![axis])
    ) {
      scratch.lightTarget = undefined;
    }
    if (scratch.sees && zombie.obstacleWanderRemaining > 0) {
      zombie.obstacleWanderRemaining = 0;
      zombie.obstacleWanderHeading = undefined;
    }
    const hearing = scratch.hearingInput;
    hearing.zombie = type;
    hearing.from = pos;
    hearing.player = player;
    hearing.blockSize = blockSize;
    hearing.isSolid = soundBlocking;
    hearing.rng = rng;
    hearing.tuning = this.options.tuning;
    scratch.vocal = undefined;
    if (player.vocalNoise && zombie.lastVocalNoiseId !== player.vocalNoise.id) {
      zombie.lastVocalNoiseId = player.vocalNoise.id;
      scratch.vocal = hearVocalNoise({
        zombie: type,
        from: pos,
        noise: player.vocalNoise,
        time,
        blockSize,
        isSolid: soundBlocking,
        rng,
        tuning: this.options.tuning,
      });
    }
    scratch.tier = scratch.sees ? undefined : (scratch.vocal?.tier ?? hearingTier(hearing));
  }

  private tickHesitation(): boolean {
    const { zombie, time, sees, player, lightTarget, dt, vocal } = this.tickScratch;
    const loud = vocal && player.vocalNoise!.radiusMetres >= zombie.type.hearingModel.loudNoiseRadiusMetres;
    if (sees || loud || lightTarget || zombie.hordeId !== undefined) {
      return false;
    }
    zombie.modeTimer = Math.max(0, zombie.modeTimer - dt);
    if (zombie.modeTimer > 0) {
      return true;
    }
    if (zombie.hesitationFrom === 'stroll') {
      zombie.mode = 'investigate';
      zombie.stimulusAt = time;
    } else {
      zombie.leanTarget = copy(zombie.lastPerceived!);
      zombie.refusedAt = time;
      zombie.lastPerceived = undefined;
      zombie.stimulusAt = undefined;
      this.beginIdle(zombie);
    }
    zombie.hesitationFrom = undefined;
    this.announcePursuit('hesitate');
    return true;
  }

  private updateAttention(): void {
    const { zombie, time, sees, tier, player, lightTarget } = this.tickScratch;
    const previous = zombie.mode;
    if (previous === 'hesitate' && this.tickHesitation()) {
      return;
    }
    this.resolveAttention();
    const suspicious =
      zombie.refusedAt !== undefined && time - zombie.refusedAt < zombie.type.hearingModel.refusalSuspicionSimSeconds;
    if (
      (previous === 'idle' || previous === 'stroll') &&
      zombie.mode === 'investigate' &&
      tier &&
      this.tickScratch.vocal &&
      !sees &&
      !lightTarget &&
      zombie.hordeId === undefined &&
      !suspicious &&
      player.vocalNoise!.radiusMetres < zombie.type.hearingModel.loudNoiseRadiusMetres
    ) {
      zombie.hesitationFrom = previous;
      zombie.mode = 'hesitate';
      zombie.modeTimer = inRange(zombie.behaviorRng, zombie.type.hearingModel.hesitationSimSeconds);
    }
    if (zombie.mode !== 'hesitate') {
      zombie.hesitationFrom = undefined;
    }
    this.announcePursuit(previous);
  }

  private announcePursuit(previous: ZombieMode): void {
    const { zombie, pos } = this.tickScratch;
    if (
      (zombie.mode === 'chase' || zombie.mode === 'investigate') &&
      previous !== 'chase' &&
      previous !== 'investigate'
    ) {
      zombie.leanTarget = undefined;
      this.options.onSound?.(zombie.type.sounds.alert, copy(pos), zombie);
      this.chainStimuli.push({ caller: zombie, origin: copy(pos), target: copy(zombie.lastPerceived!) });
    }
  }

  private processChainStimuli(time: number): void {
    // Drain to closure before movement so entity iteration cannot delay a later caller's listeners.
    for (const stimulus of this.chainStimuli) {
      const { chainRadiusMetres, chainChance } = stimulus.caller.type.hearingModel;
      for (const [, zombie] of this.store.entries()) {
        if (
          zombie.incapacitated ||
          zombie.mode === 'chase' ||
          zombie.mode === 'investigate' ||
          horizontalDistance(zombie.body.pos, stimulus.origin) * this.options.blockSize > chainRadiusMetres ||
          zombie.soundRng.next() >= chainChance
        ) {
          continue;
        }
        zombie.mode = 'investigate';
        zombie.hesitationFrom = undefined;
        zombie.investigationTier = 'far';
        zombie.searchAnchor = undefined;
        zombie.searchTimer = 0;
        zombie.searchStrolling = false;
        zombie.leanTarget = undefined;
        zombie.lastPerceived = copy(stimulus.target);
        zombie.stimulusAt = time;
        this.options.onSound?.(zombie.type.sounds.alert, copy(zombie.body.pos), zombie);
        this.chainStimuli.push({ caller: zombie, origin: copy(zombie.body.pos), target: copy(stimulus.target) });
      }
    }
    this.chainStimuli.length = 0;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Preserve precedence between sight, near/far noise, prior chase, and horde attention.
  private resolveAttention(): void {
    const scratch = this.tickScratch;
    const { zombie, player, pos, tier, sees, vocal, blockSize, lightTarget } = scratch;
    if (sees) {
      zombie.mode = 'chase';
      zombie.investigationTier = undefined;
      zombie.searchAnchor = undefined;
      zombie.searchTimer = 0;
      zombie.searchStrolling = false;
      zombie.lastPerceived = copy(player.pos);
    } else if (tier === 'near') {
      zombie.mode = 'investigate';
      zombie.investigationTier = 'near';
      zombie.searchAnchor = undefined;
      zombie.searchTimer = 0;
      zombie.searchStrolling = false;
      zombie.lastPerceived = copy(vocal?.tier === 'near' ? vocal.target : player.pos);
    } else if (lightTarget) {
      zombie.mode = 'investigate';
      zombie.investigationTier = 'near';
      zombie.searchAnchor = undefined;
      zombie.searchTimer = 0;
      zombie.searchStrolling = false;
      zombie.lastPerceived = copy(lightTarget);
    } else if (
      tier === 'far' &&
      (zombie.mode === 'idle' || zombie.mode === 'stroll' || zombie.mode === 'search' || zombie.mode === 'hesitate')
    ) {
      zombie.mode = 'investigate';
      zombie.investigationTier = 'far';
      zombie.searchAnchor = undefined;
      zombie.searchTimer = 0;
      zombie.searchStrolling = false;
      zombie.lastPerceived =
        vocal?.tier === 'far'
          ? vocal.target
          : farBearingTarget({ zombie: zombie.type, from: pos, source: player.pos, rng: scratch.rng, blockSize });
      const { terrainFloor } = this.options;
      const footprint = {
        halfWidth: zombie.body.halfWidth,
        halfDepth: zombie.body.halfDepth ?? zombie.body.halfWidth,
      };
      if (terrainFloor && onTerrainFloor(pos, terrainFloor, footprint)) {
        zombie.lastPerceived[1] = terrainStance(
          zombie.lastPerceived[0],
          zombie.lastPerceived[2],
          terrainFloor,
          footprint,
        );
      }
    } else if (zombie.mode === 'chase') {
      zombie.mode = 'investigate';
      zombie.investigationTier = 'near';
    }
    if (sees || tier || lightTarget) {
      zombie.stimulusAt = scratch.time;
    }
    const groupTarget = sees || tier ? undefined : this.hordeTarget(zombie);
    if (groupTarget) {
      zombie.mode = 'investigate';
      zombie.investigationTier = 'far';
      zombie.searchAnchor = undefined;
      zombie.searchTimer = 0;
      zombie.searchStrolling = false;
      zombie.lastPerceived = groupTarget;
    }
  }

  private forgetIndividualStimulus(zombie: Zombie, time: number): void {
    if (
      zombie.hordeId !== undefined ||
      zombie.mode !== 'investigate' ||
      zombie.stimulusAt === undefined ||
      time - zombie.stimulusAt < zombie.type.stimulusMemorySimSeconds
    ) {
      return;
    }
    zombie.stimulusAt = undefined;
    zombie.lastPerceived = undefined;
    zombie.investigationTier = undefined;
    zombie.searchAnchor = undefined;
    zombie.searchTimer = 0;
    zombie.searchStrolling = false;
    zombie.mode = 'return';
  }

  private checkInvestigationArrival(): void {
    const scratch = this.tickScratch;
    const { zombie, pos } = scratch;
    if (zombie.mode !== 'investigate') {
      return;
    }
    const target = zombie.lastPerceived ?? zombie.home;
    if (
      Math.hypot(...sub(target, pos)) * scratch.blockSize <= 1 &&
      sameInvestigationFloor(pos, target, this.options.terrainFloor, {
        halfWidth: zombie.body.halfWidth,
        halfDepth: zombie.body.halfDepth ?? zombie.body.halfWidth,
      })
    ) {
      this.beginSearch(zombie);
    }
  }

  private updateIdleSound(): void {
    const scratch = this.tickScratch;
    const { zombie, dt, pos } = scratch;
    if (zombie.mode !== 'idle' && zombie.mode !== 'stroll') {
      return;
    }
    zombie.idleSoundTimer -= dt;
    if (zombie.idleSoundTimer <= 0) {
      this.options.onSound?.(zombie.type.sounds.idle, copy(pos), zombie);
      zombie.idleSoundTimer = 8 + zombie.soundRng.range(0, 12);
    }
  }

  private selectMovementIntent(): void {
    const scratch = this.tickScratch;
    const { zombie } = scratch;
    scratch.target = zombie.home;
    scratch.direction = [0, 0, 0];
    scratch.aimDirection = undefined;
    scratch.desiredSpeed = 0;
    scratch.returnArrived = false;
    scratch.obstacleDirection = zombie.obstacleWanderRemaining > 0 ? zombie.obstacleWanderHeading : undefined;
    scratch.stroll = zombie.mode === 'stroll';
    scratch.wanderingAtTickStart = zombie.obstacleWanderRemaining > 0;
    this.updateIdleSound();
    switch (zombie.mode) {
      case 'hesitate': {
        const bearing = angleOf(sub(zombie.lastPerceived!, zombie.body.pos));
        zombie.headYawTarget = bearing - angleOf(zombie.facing);
        zombie.headYaw = approachAngle(
          zombie.headYaw,
          zombie.headYawTarget,
          (zombie.type.wander.headTurnDegreesPerSimSecond * Math.PI * scratch.dt) / 180,
        );
        return;
      }
      case 'idle':
        this.selectIdleIntent();
        return;
      case 'stroll':
        this.selectStrollIntent();
        return;
      case 'search':
        this.selectSearchIntent();
        return;
      default:
        this.selectTravelIntent();
    }
  }

  private selectIdleIntent(): void {
    const { zombie, dt } = this.tickScratch;
    zombie.modeTimer -= dt;
    this.tickLookAround(zombie, dt);
    if (zombie.modeTimer <= 0) {
      this.beginStroll(zombie);
    }
  }

  private selectStrollIntent(): void {
    const scratch = this.tickScratch;
    const { zombie, type, dt, obstacleDirection } = scratch;
    zombie.modeTimer -= dt;
    scratch.direction = obstacleDirection ?? zombie.strollHeading;
    scratch.aimDirection = scratch.direction;
    scratch.desiredSpeed = obstacleDirection || zombie.modeTimer > 0 ? type.speed.wanderMetresPerSimSecond : 0;
    scratch.direction = steer(
      zombie,
      scratch.direction,
      (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
    );
    zombie.headYaw = approachAngle(zombie.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private selectSearchIntent(): void {
    const scratch = this.tickScratch;
    const { zombie, type, dt, obstacleDirection, pos } = scratch;
    zombie.searchTimer -= dt;
    if (zombie.searchTimer <= 0) {
      zombie.mode = 'return';
      zombie.searchAnchor = undefined;
      zombie.searchStrolling = false;
      scratch.target = zombie.home;
      scratch.direction = obstacleDirection ?? unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
      scratch.aimDirection = scratch.direction;
      scratch.direction = steer(
        zombie,
        scratch.direction,
        (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
      );
      scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
    } else if (zombie.searchStrolling) {
      zombie.modeTimer -= dt;
      if (zombie.modeTimer <= 0) {
        zombie.searchStrolling = false;
        zombie.modeTimer = inRange(scratch.rng, type.wander.idleSimSeconds);
        this.tickLookAround(zombie, dt);
      } else {
        scratch.direction = obstacleDirection ?? zombie.searchHeading;
        scratch.aimDirection = scratch.direction;
        scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
        scratch.direction = steer(
          zombie,
          scratch.direction,
          (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
        );
        zombie.headYaw = approachAngle(
          zombie.headYaw,
          0,
          (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180,
        );
      }
    } else {
      zombie.modeTimer -= dt;
      this.tickLookAround(zombie, dt);
      if (zombie.modeTimer <= 0) {
        this.beginSearchStroll(zombie);
      }
    }
  }

  private selectTravelIntent(): void {
    const scratch = this.tickScratch;
    const { zombie, type, player, blockSize, pos, obstacleDirection, dt } = scratch;
    if (zombie.mode === 'chase') {
      scratch.target = player.pos;
    } else if (zombie.mode === 'investigate') {
      scratch.target = zombie.lastPerceived ?? zombie.home;
    }
    scratch.metresToTarget = horizontalDistance(scratch.target, pos) * blockSize;
    scratch.returnArrived = zombie.mode === 'return' && scratch.metresToTarget < 0.4;
    scratch.seeking = zombie.mode === 'chase' || zombie.mode === 'investigate';
    scratch.inReach = zombie.mode === 'chase' && this.reachableZombieMoves(zombie, pos, scratch.target).length > 0;
    const toward = unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
    scratch.direction = obstacleDirection ?? toward;
    scratch.moving = scratch.seeking ? !scratch.inReach : scratch.returnArrived || scratch.metresToTarget > 0.25;
    holdSpitGround(scratch, toward);
    if (scratch.moving) {
      scratch.aimDirection = scratch.direction;
      if (scratch.seeking) {
        const motion = this.stepChaseMotion(zombie, dt);
        scratch.direction = headingAt(angleOf(scratch.direction) + motion.sway);
        scratch.desiredSpeed = type.speed.chaseMetresPerSimSecond * motion.speedFactor;
      } else if (!scratch.returnArrived) {
        scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
      }
      const turnRadians = (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180;
      scratch.direction = steer(zombie, scratch.direction, turnRadians, toward);
    } else {
      scratch.direction = [0, 0, 0];
    }
    zombie.headYaw = approachAngle(zombie.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private updateMovementSpeed(): void {
    const scratch = this.tickScratch;
    const { zombie, type, dt } = scratch;
    if (
      (zombie.regions.leftLeg! <= 0 && zombie.regions.rightLeg! <= 0) ||
      zombie.staggerSimSeconds > 0 ||
      this.options.restrained?.(scratch.id) === true
    ) {
      scratch.desiredSpeed = 0;
      scratch.direction = [0, 0, 0];
      scratch.aimDirection = undefined;
      zombie.horizontalSpeed = 0;
    }
    const acceleration =
      zombie.stumbleFactor < 1 && zombie.horizontalSpeed > scratch.desiredSpeed
        ? type.chaseMotion.stumbleDecelerationMetresPerSimSecondSquared
        : type.wander.movementAccelerationMetresPerSimSecondSquared;
    zombie.horizontalSpeed = approach(zombie.horizontalSpeed, scratch.desiredSpeed, acceleration * dt);
    if (zombie.mode !== 'search' || !zombie.searchStrolling || !zombie.searchAnchor) {
      return;
    }
    const radius = horizontalDistance(scratch.pos, zombie.searchAnchor) * scratch.blockSize;
    const away = unit([scratch.pos[0] - zombie.searchAnchor[0], 0, scratch.pos[2] - zombie.searchAnchor[2]]);
    const outward = scratch.direction[0] * away[0] + scratch.direction[2] * away[2];
    if (outward > 0) {
      const remaining = Math.max(0, type.hearingModel.searchRadiusMetres - radius);
      zombie.horizontalSpeed = Math.min(zombie.horizontalSpeed, remaining / (dt * outward));
    }
  }

  private applyObstacleSlide(): void {
    const scratch = this.tickScratch;
    const { zombie, aimDirection, wanderingAtTickStart } = scratch;
    if (!wanderingAtTickStart && zombie.obstacleContact && zombie.obstacleSlideSide !== 0 && aimDirection) {
      scratch.direction = headingAt(angleOf(aimDirection) + (zombie.obstacleSlideSide * Math.PI) / 2);
    }
  }

  private stepZombieBody(): void {
    const scratch = this.tickScratch;
    const { zombie, direction, blockSize, dt, isSolid, player, aimDirection } = scratch;
    zombie.body.vel[0] = (direction[0] * zombie.horizontalSpeed) / blockSize;
    zombie.body.vel[2] = (direction[2] * zombie.horizontalSpeed) / blockSize;
    scratch.jumpAttempted =
      zombie.type.canJumpObstacles &&
      zombie.horizontalSpeed > 0.01 &&
      zombie.body.onGround &&
      canJumpObstacle({
        body: zombie.body,
        direction,
        isSolid,
        physics: this.options.physics,
        jumpSpeed: this.options.jumpSpeed,
        blockSize,
      });
    if (scratch.jumpAttempted) {
      zombie.body.vel[1] = this.options.jumpSpeed / blockSize;
    }
    scratch.beforeStep = copy(scratch.pos);
    this.settleTurn(zombie);
    if (!this.restsStill(zombie)) {
      const obstacles = player.body ? [player.body] : [];
      stepBody(zombie.body, dt, isSolid, {
        ...this.options.physics,
        stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2,
        obstacles,
        shapeOf: this.shapeOf,
      });
      this.noteRest(zombie);
    }
    scratch.travelled = horizontalDistance(scratch.beforeStep, zombie.body.pos) * blockSize;
    scratch.wallAhead = aimDirection !== undefined && this.wallAhead(aimDirection);
    scratch.dx = zombie.body.pos[0] - scratch.beforeStep[0];
    scratch.dz = zombie.body.pos[2] - scratch.beforeStep[2];
    scratch.forward = aimDirection ? (scratch.dx * aimDirection[0] + scratch.dz * aimDirection[2]) * blockSize : 0;
    scratch.obstacleContact =
      scratch.wallAhead &&
      !scratch.jumpAttempted &&
      zombie.horizontalSpeed > 0.01 &&
      scratch.forward < zombie.horizontalSpeed * dt * 0.1;
  }

  /**
   * Whether a wall stands just ahead along `aim`. A box-sized body moves its box as far ahead and tests
   * whether it meets terrain: a ray from its centre misses the block corner its body catches, so it would
   * grind against that corner without ever registering the contact. An amalgam's flesh reaches metres past
   * its centre, so its shape is moved as far ahead instead.
   */
  private wallAhead(aim: Vec3): boolean {
    const { zombie, isSolid } = this.tickScratch;
    const shape = this.shapeOf(zombie.body);
    if (shape) {
      return this.fleshMeets(shape, aim);
    }
    return bodyOverlapsTerrain(this.bodyAhead(aim), isSolid);
  }

  /** The zombie's box at its tick start, moved the obstacle lookahead along `aim`. */
  private bodyAhead(aim: Vec3): Body {
    const { zombie, beforeStep, blockSize } = this.tickScratch;
    const reach = OBSTACLE_LOOKAHEAD_METRES / blockSize;
    return { ...zombie.body, pos: [beforeStep[0] + aim[0] * reach, beforeStep[1], beforeStep[2] + aim[2] * reach] };
  }

  /** Whether an amalgam's flesh, moved the obstacle lookahead along `heading` and lifted over a step, meets terrain. */
  private fleshMeets(shape: BodyShape, heading: Vec3): boolean {
    const { zombie, blockSize } = this.tickScratch;
    const { pos } = zombie.body;
    const reach = OBSTACLE_LOOKAHEAD_METRES / blockSize;
    const lift = this.options.physics.stepHeight + CONTACT_SKIN * 2;
    return shape.overlapsTerrain([pos[0] + heading[0] * reach, pos[1] + lift, pos[2] + heading[2] * reach]);
  }

  /**
   * The side an amalgam meeting a wall slides to: the one its flesh can move to. Met at a slant, that is the
   * side the wall leads it along; caught on a door frame or wall end, the side that frees it. A random side
   * there could back it out of the gap it was sliding into or pin it. When both sides are open, or neither
   * side is free, it draws, as a shambler always does.
   */
  private openSide(aim: Vec3): -1 | 1 | undefined {
    const shape = this.shapeOf(this.tickScratch.zombie.body);
    if (!shape) {
      return undefined;
    }
    const left = !this.fleshMeets(shape, [aim[2], 0, -aim[0]]);
    const right = !this.fleshMeets(shape, [-aim[2], 0, aim[0]]);
    if (left === right) {
      return undefined;
    }
    return left ? 1 : -1;
  }

  private startObstacleWander(): void {
    const scratch = this.tickScratch;
    const { zombie, sees, wanderingAtTickStart, obstacleContact, wasObstacleContact, aimDirection, rng } = scratch;
    if (
      !(sees || wanderingAtTickStart) &&
      obstacleContact &&
      !wasObstacleContact &&
      aimDirection &&
      rng.chance(zombie.type.wander.obstacleWanderChance)
    ) {
      const physics = { ...this.options.physics, stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2 };
      const headings = openWanderHeadings({
        body: zombie.body,
        intent: aimDirection,
        isSolid: scratch.isSolid,
        physics,
        blockSize: scratch.blockSize,
      });
      if (headings.length > 0) {
        zombie.obstacleWanderHeading = headings[rng.int(0, headings.length - 1)]!;
        zombie.obstacleWanderRemaining = zombie.type.wander.obstacleWanderDistanceMetres;
      }
    }
  }

  private updateObstacleSlideSide(): void {
    const scratch = this.tickScratch;
    const { zombie, obstacleContact, wasObstacleContact, aimDirection, jumpAttempted, travelled, rng } = scratch;
    if (!obstacleContact) {
      zombie.obstacleSlideSide = 0;
    } else if (!wasObstacleContact && aimDirection && !jumpAttempted) {
      const side = rng.int(0, 1) === 0 ? -1 : 1;
      zombie.obstacleSlideSide = this.openSide(aimDirection) ?? side;
    } else if (zombie.obstacleSlideSide !== 0 && !jumpAttempted && travelled < 0.0001) {
      zombie.obstacleSlideSide = zombie.obstacleSlideSide === -1 ? 1 : -1;
    }
  }

  private updateObstacleContact(): void {
    const scratch = this.tickScratch;
    const { zombie, obstacleContact, travelled, wanderingAtTickStart } = scratch;
    scratch.wasObstacleContact = zombie.obstacleContact;
    if (wanderingAtTickStart) {
      if (obstacleContact) {
        zombie.obstacleWanderRemaining = 0;
        zombie.obstacleWanderHeading = undefined;
      } else {
        zombie.obstacleWanderRemaining = Math.max(0, zombie.obstacleWanderRemaining - travelled);
        if (zombie.obstacleWanderRemaining === 0) {
          zombie.obstacleWanderHeading = undefined;
        }
      }
    }
    this.updateObstacleSlideSide();
    this.startObstacleWander();
    zombie.obstacleContact = obstacleContact;
    this.bashObstacle();
  }

  /**
   * A zombie held up on the way to its target bashes what holds it, once per attack cooldown, but only where that is
   * its one way through (`DESIGN.md`, "Senses and AI"): a piece it can walk past is left to its slide and wander.
   * Whether the blow does anything is the piece's gate, not the zombie's (`DESIGN.md`, "Base building and
   * electricity"); a type of strength 0 never bashes. A zombie whose blow lands stays at the piece instead of sliding
   * or wandering off along the wall.
   */
  private bashObstacle(): void {
    const scratch = this.tickScratch;
    const { zombie, type, obstacleContact, aimDirection } = scratch;
    const { bashObstacle } = this.options;
    if (
      !(bashObstacle && obstacleContact && aimDirection) ||
      type.strength <= 0 ||
      (zombie.mode !== 'chase' && zombie.mode !== 'investigate') ||
      zombie.attackWait > 0 ||
      zombie.attackWindup > 0
    ) {
      return;
    }
    const around = {
      body: zombie.body,
      intent: aimDirection,
      isSolid: scratch.isSolid,
      physics: { ...this.options.physics, stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2 },
      blockSize: scratch.blockSize,
    };
    if (
      hasWayAround(around, type.wander.wayAroundReachMetres, type.wander.wayAroundMinGainFraction) ||
      !bashObstacle(this.bodyAhead(aimDirection), type.strength)
    ) {
      return;
    }
    zombie.attackWait = type.attack.cooldownSimSeconds;
    zombie.obstacleSlideSide = 0;
    zombie.obstacleWanderHeading = undefined;
    zombie.obstacleWanderRemaining = 0;
  }

  private updateMovementAfterStep(): void {
    const scratch = this.tickScratch;
    const { zombie, blockSize, dt, travelled, beforeStep, groundedAtTickStart, stroll } = scratch;
    scratch.stepHeightMetres = this.options.physics.stepHeight * blockSize;
    const stepOffsetState = updateStepOffset(
      {
        offset: zombie.stepOffset ?? 0,
        previous: {
          position: beforeStep.map((coordinate) => coordinate * blockSize) as Vec3,
          grounded: groundedAtTickStart.get(zombie) ?? false,
        },
      },
      {
        position: zombie.body.pos.map((coordinate) => coordinate * blockSize) as Vec3,
        grounded: zombie.body.onGround,
        dt,
        stepHeightMetres: scratch.stepHeightMetres,
      },
    );
    zombie.stepOffset = stepOffsetState.offset;
    zombie.gaitPhase += (travelled / zombie.type.stepLength) * Math.PI;
    if (zombie.mode === 'idle' || zombie.mode === 'stroll') {
      zombie.wanderClock += dt;
    }
    if (stroll && zombie.mode === 'stroll' && zombie.horizontalSpeed > 0.01) {
      const requested = zombie.horizontalSpeed * dt;
      if (travelled + 1e-4 < requested * 0.1) {
        this.beginIdle(zombie);
      }
    }
    if (stroll && zombie.mode === 'stroll' && zombie.modeTimer <= 0 && zombie.horizontalSpeed <= 0.01) {
      this.beginIdle(zombie);
    }
    if (zombie.mode === 'search' && zombie.searchStrolling && zombie.horizontalSpeed > 0.01) {
      const requested = zombie.horizontalSpeed * dt;
      if (travelled + 1e-4 < requested * 0.1) {
        zombie.searchStrolling = false;
        zombie.modeTimer = inRange(scratch.rng, zombie.type.wander.idleSimSeconds);
      }
    }
  }

  private reachableZombieMoves(zombie: Zombie, zombiePos: Vec3, playerPos: Vec3): ZombieMove[] {
    return zombie.type.attack.moves.filter((move) =>
      withinAttackReach({
        zombie,
        zombiePos,
        playerPos,
        blockSize: this.options.blockSize,
        isSolid:
          this.options.meleeBlocker?.({
            kind: 'zombie',
            motion: move.motion,
            reachMetres: zombieAttackReachMetres(zombie),
          }) ?? this.options.isSolid,
      }),
    );
  }

  private resolveZombieAttack(): void {
    const scratch = this.tickScratch;
    const { zombie, dt, player, type, pos } = scratch;
    if (zombie.attackWindup > 0) {
      zombie.attackWindup = Math.max(0, zombie.attackWindup - dt);
      if (zombie.attackWindup <= 0) {
        const moves = this.reachableZombieMoves(zombie, pos, player.pos);
        if (moves.length > 0) {
          const move = pickZombieMove(moves, scratch.rng.next());
          this.options.hurtPlayer(move.damage, move.hitRegions, scratch.id, move.damageKind);
        }
      }
    } else if (
      zombie.mode === 'chase' &&
      zombie.staggerSimSeconds <= 0 &&
      zombie.attackWait <= 0 &&
      zombie.spitWindup <= 0 &&
      (type.model === 'amalgam' ? activeAmalgamMembers(zombie).length > 0 : canStillAttack(zombie)) &&
      this.reachableZombieMoves(zombie, pos, player.pos).length > 0
    ) {
      this.options.onSound?.(type.sounds.attack, copy(pos), zombie);
      zombie.attackWindup = type.attack.windupSimSeconds;
      zombie.attackWait = type.attack.cooldownSimSeconds;
    }
    this.resolveAcidSpit();
  }

  /** Doc: `docs/acid-zombie.md`, "The spit". Sight starts it, release re-checks the line, a hit cancels it. */
  private resolveAcidSpit(): void {
    const scratch = this.tickScratch;
    const { zombie, dt, player, blockSize, type, pos, isSolid } = scratch;
    const spit = type.acidSpit;
    if (!spit) {
      return;
    }
    if (zombie.spitWindup > 0) {
      zombie.spitWindup = Math.max(0, zombie.spitWindup - dt);
      if (zombie.spitWindup > 0) {
        return;
      }
      const chest = spitChest(player, this.options.tuning, blockSize);
      const origin = spitOrigin(zombie, scratch.id, blockSize);
      if (!spitLineClear(origin, chest, isSolid)) {
        return;
      }
      zombie.spitWait = spit.cooldownSimSeconds;
      const spread = (zombie.spitRng.range(-1, 1) * spit.spreadDegrees * Math.PI) / 180;
      const toPlayer = sub(chest, origin);
      const heading = headingAt(angleOf(toPlayer) + spread);
      const reach = Math.hypot(toPlayer[0], toPlayer[2]);
      const aim = unit([heading[0] * reach, toPlayer[1], heading[2] * reach]);
      const release = { source: scratch.id, origin, aim, moves: spit.moves };
      const move = pickZombieMove(spit.moves, zombie.spitRng.next());
      const speed = spit.globMetresPerSimSecond / blockSize;
      const gravity = spit.globGravityMetresPerSimSecondSquared / blockSize;
      const flightSeconds = Math.hypot(...toPlayer) / speed;
      this.globs.push({
        type,
        state: {
          source: scratch.id,
          type: type.id,
          move: move.id,
          pos: copy(origin),
          velocity: [aim[0] * speed, aim[1] * speed + 0.5 * gravity * flightSeconds, aim[2] * speed],
          damage: modified('attack.damage', move.damage, zombie),
          puddleDamagePerSimSecond: modified('attack.damage', spit.puddle.damagePerSimSecond, zombie),
          regionRoll: zombie.spitRng.next(),
        },
      });
      this.options.onAcidSpit?.(release);
      return;
    }
    const metres = horizontalDistance(player.pos, pos) * blockSize;
    if (
      zombie.mode === 'chase' &&
      scratch.sees &&
      zombie.staggerSimSeconds <= 0 &&
      zombie.spitWait <= 0 &&
      zombie.attackWindup <= 0 &&
      metres >= spit.rangeBand.nearMetres &&
      metres <= spit.rangeBand.farMetres
    ) {
      this.options.onSound?.(type.sounds.attack, copy(pos), zombie);
      zombie.spitWindup = spit.windupSimSeconds;
    }
  }

  private finishZombieTick(): void {
    const scratch = this.tickScratch;
    const { zombie, returnArrived, blockSize, dt, id } = scratch;
    if (zombie.mode === 'return' && returnArrived && zombie.horizontalSpeed <= 0.01) {
      this.beginIdle(zombie);
    }
    const poseInput = zombiePoseInputFor(zombie, id, blockSize);
    const stanceTarget = targetStanceWeight(poseInput);
    zombie.stanceWeight = advanceStanceWeight(zombie.stanceWeight ?? stanceTarget, stanceTarget, dt);
  }

  private separateZombieBodies(
    entries: readonly (readonly [EntityId, Zombie])[],
    dt: number,
    player: PlayerSense,
  ): void {
    const { blockSize, isSolid } = this.tickScratch;
    const { shapeOf } = this;
    separateBodies({
      bodies: entries.filter(([, zombie]) => !zombie.incapacitated).map(([, zombie]) => zombie.body),
      dt,
      isSolid,
      blockSize,
      obstacles: player.body ? [player.body] : [],
      shapeOf,
    });
    if (!player.body) {
      return;
    }
    for (const [, zombie] of entries) {
      if (!zombie.incapacitated) {
        separateBodyPair({ first: player.body, second: zombie.body, dt, isSolid, blockSize, shapeOf });
      }
    }
  }

  private emitFootsteps(
    entries: readonly (readonly [EntityId, Zombie])[],
    groundedAtTickStart: Map<Zombie, boolean>,
    player: PlayerSense,
    blockSize: number,
  ): void {
    const footfallCandidates = entries.flatMap(([id, zombie]) => {
      if (
        zombie.type.footstepSound !== 'shambler' ||
        !groundedAtTickStart.get(zombie) ||
        !zombie.body.onGround ||
        zombie.horizontalSpeed <= 0.01
      ) {
        return [];
      }
      const travelledMetres = horizontalDistance(zombie.renderPrevious.pos, zombie.body.pos) * blockSize;
      const advance = advanceShamblerFootsteps(zombie.footstepClock, travelledMetres, zombie.type.stepLength);
      zombie.footstepClock = advance.clock;
      return travelledMetres > 0 ? [{ id, zombie, steps: advance.steps }] : [];
    });
    const footstepVoices = new Set(
      [...footfallCandidates]
        .sort(
          (a, b) =>
            horizontalDistance(a.zombie.body.pos, player.pos) - horizontalDistance(b.zombie.body.pos, player.pos) ||
            a.id - b.id,
        )
        .slice(0, SHAMBLER_FOOTSTEP_VOICE_CAP)
        .map(({ zombie }) => zombie),
    );
    for (const { id, zombie, steps } of footfallCandidates) {
      if (!footstepVoices.has(zombie)) {
        continue;
      }
      for (let step = 0; step < steps; step++) {
        this.options.onFootstep?.(copy(zombie.body.pos), id, zombie.mode, zombie);
      }
    }
  }

  /** Advances every selected zombie at a fixed caller-supplied simulation dt. */
  tick(
    dt: number,
    time = 0,
    _hands?: { right: number | null; left: number | null },
    selection: 'all' | 'active' = 'all',
  ): void {
    if (dt <= 0) {
      return;
    }
    const player = this.options.player();
    const classified = this.classifyTiers(player);
    const entries = selection === 'active' ? classified.filter(([, zombie]) => zombie.tier === 'active') : classified;
    if (this.frozen) {
      this.tickFrozen(dt, entries);
      return;
    }
    this.tickAcidPuddles(dt, player);
    this.tickAcidGlobs(dt, player);
    const dayState = this.options.dayPhase();
    const { blockSize, isSolid } = this.options;
    const groundedAtTickStart = new Map<Zombie, boolean>();
    const scratch = this.tickScratch;
    scratch.dt = dt;
    scratch.time = time;
    scratch.player = player;
    scratch.dayState = dayState;
    scratch.blockSize = blockSize;
    scratch.isSolid = isSolid;
    scratch.isOpaque = this.options.isOpaque;
    scratch.groundedAtTickStart = groundedAtTickStart;
    for (const [id, zombie] of entries) {
      groundedAtTickStart.set(zombie, zombie.body.onGround);
      this.captureRenderPrevious(zombie, time);
      if (zombie.incapacitated) {
        this.tickIncapacitated(zombie, dt);
        continue;
      }
      scratch.id = id;
      scratch.zombie = zombie;
      scratch.pos = zombie.body.pos;
      scratch.type = zombie.type;
      scratch.rng = zombie.behaviorRng;
      this.updateZombieTimers();
      this.updatePerception();
      this.updateAttention();
      this.forgetIndividualStimulus(zombie, time);
    }
    this.processChainStimuli(time);
    for (const [id, zombie] of entries) {
      if (zombie.incapacitated) {
        continue;
      }
      scratch.id = id;
      scratch.zombie = zombie;
      scratch.pos = zombie.body.pos;
      scratch.type = zombie.type;
      scratch.rng = zombie.behaviorRng;
      scratch.sees = zombie.mode === 'chase';
      this.checkInvestigationArrival();

      this.selectMovementIntent();

      this.updateMovementSpeed();
      this.applyObstacleSlide();
      this.stepZombieBody();
      this.updateObstacleContact();
      this.updateMovementAfterStep();
      this.resolveZombieAttack();
      this.finishZombieTick();
    }
    this.separateZombieBodies(entries, dt, player);
    this.emitFootsteps(entries, groundedAtTickStart, player, blockSize);
  }

  private tickAcidPuddles(dt: number, player: PlayerSense): void {
    for (const { state: puddle, type } of this.puddles) {
      const radius = type.acidSpit!.puddle.radiusMetres / this.options.blockSize;
      const damage = puddle.damagePerSimSecond * Math.min(dt, puddle.remainingSimSeconds);
      for (const region of ['leftLeg', 'rightLeg'] as const) {
        const id = `acid-puddle:${puddle.id}:${region}`;
        if (player.body && feetInAcidPuddle(player.body, puddle, radius) && damage > 0) {
          this.options.onPlayerExposure?.({
            id,
            rate: puddle.damagePerSimSecond / 2,
            cause: `a ${type.name.toLowerCase()}`,
            region,
            kind: 'acid',
            touch: 'ground',
          });
        } else {
          this.options.onPlayerLeaveExposure?.(id);
        }
      }
      this.burnZombieFeet(puddle, radius, damage);
      puddle.remainingSimSeconds = Math.max(0, puddle.remainingSimSeconds - dt);
      if (puddle.remainingSimSeconds === 0) {
        for (const region of ['leftLeg', 'rightLeg'] as const) {
          this.options.onPlayerLeaveExposure?.(`acid-puddle:${puddle.id}:${region}`);
        }
      }
    }
    this.puddles = this.puddles.filter(({ state }) => state.remainingSimSeconds > 0);
  }

  private burnZombieFeet(puddle: Readonly<AcidPuddleState>, radius: number, damage: number): void {
    for (const [id, zombie] of this.store.entries()) {
      const burn = acidDamageToZombie(zombie.type, damage);
      if (burn <= 0 || !feetInAcidPuddle(zombie.body, puddle, radius)) {
        continue;
      }
      const legs = (Object.keys(zombie.regions) as ZombieHitRegion[]).filter((region) =>
        ['leftLeg', 'rightLeg'].includes(zombieRegionClass(region)),
      );
      for (const region of legs) {
        if (zombie.regions[region]! <= 0) {
          continue;
        }
        const healthAfter = this.damageRegion(zombie, region, burn / legs.length);
        this.resolveRegionDamage(id, zombie, region, healthAfter);
      }
    }
  }

  private tickAcidGlobs(dt: number, player: PlayerSense): void {
    const poseCache = new Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>>();
    this.globs = this.globs.filter(({ state, type }) => {
      const impact = advanceAcidGlob<GlobContact>(
        state,
        dt,
        type.acidSpit!.globGravityMetresPerSimSecondSquared / this.options.blockSize,
        (origin, direction, distance) =>
          this.acidGlobContact({ origin, direction, distance, source: state.source, player, poseCache }),
      );
      if (!impact) {
        return true;
      }
      this.resolveAcidGlobImpact(state, type, impact);
      return false;
    });
  }

  private resolveAcidGlobImpact(
    state: AcidGlobState,
    type: ZombieDef,
    { contact, position }: { contact: GlobContact; position: Vec3 },
  ): void {
    const spit = type.acidSpit!;
    const move = spit.moves.find((candidate) => candidate.id === state.move)!;
    if (contact.kind === 'player') {
      this.options.onAcidPlayerHit?.({
        damage: state.damage,
        kind: move.damageKind,
        hitRegions: move.hitRegions,
        regionRoll: state.regionRoll,
        sourceName: type.name,
      });
    } else if (contact.kind === 'zombie') {
      const { id, zombie, region, cell } = contact.hit;
      const damage = move.damageKind === 'acid' ? acidDamageToZombie(zombie.type, state.damage) : state.damage;
      if (damage > 0) {
        const strike = this.applyMeleeHit({
          id,
          zombie,
          region,
          cell,
          origin: position,
          direction: unit(state.velocity),
          distanceMetres: 0,
          weapon: projectileWeapon(damage, 0, 0),
          damageType: 'blunt',
          damageOverride: damage,
          isFist: false,
          projectile: true,
        });
        if (strike) {
          this.carve(id, zombie, [strike]);
        }
      }
    } else if (contact.normal[1] > 0) {
      this.puddles.push({
        type,
        state: {
          id: this.nextPuddleId,
          type: type.id,
          pos: copy(position),
          remainingSimSeconds: spit.puddle.lifetimeSimSeconds,
          damagePerSimSecond: state.puddleDamagePerSimSecond,
        },
      });
      this.nextPuddleId += 1;
      this.options.onAcidGroundImpact?.({
        position: copy(position),
        source: state.source,
        type: type.id,
        puddle: spit.puddle,
      });
    }
    this.options.onAcidImpact?.(copy(position), type);
  }

  private acidGlobContact({
    origin,
    direction,
    distance,
    source,
    player,
    poseCache,
  }: {
    origin: Vec3;
    direction: Vec3;
    distance: number;
    source: EntityId;
    player: PlayerSense;
    poseCache: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>>;
  }): GlobContact | undefined {
    const contacts: GlobContact[] = [];
    const solid = raycast(origin, direction, distance, this.options.isSolid);
    if (solid) {
      contacts.push({ kind: 'solid', distance: solid.distance, normal: solid.normal });
    }
    const zombie = this.firstRegionHit({
      origin,
      direction,
      isBlocked: this.options.isSolid,
      exclude: source,
      poseCache,
    });
    if (zombie) {
      contacts.push({ kind: 'zombie', distance: zombie.distance, hit: zombie });
    }
    if (player.body) {
      const { body } = player;
      const relative: Vec3 = [
        origin[0] - body.pos[0],
        origin[1] - body.pos[1] - body.height / 2,
        origin[2] - body.pos[2],
      ];
      const entry = rayBoxEntry(relative, direction, [
        body.halfWidth,
        body.height / 2,
        body.halfDepth ?? body.halfWidth,
      ]);
      if (entry !== undefined) {
        contacts.push({ kind: 'player', distance: entry });
      }
    }
    return contacts.filter((contact) => contact.distance <= distance).sort((a, b) => a.distance - b.distance)[0];
  }

  tickActive(dt: number, time = 0, hands?: { right: number | null; left: number | null }): void {
    this.tick(dt, time, hands, 'active');
  }

  private firstRegionHit({
    origin,
    direction,
    isBlocked,
    poseCache,
    exclude,
  }: {
    origin: Vec3;
    direction: Vec3;
    isBlocked: SolidAt;
    poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
    exclude?: EntityId;
  }): RegionHit | undefined {
    let nearest: RegionHit | undefined;
    for (const [id, zombie] of this.store.entries()) {
      if (
        id !== exclude &&
        !zombie.incapacitated &&
        rayMayHitZombie(zombie, origin, direction, this.options.blockSize)
      ) {
        nearest = this.nearerRegionHit({ id, zombie, origin, direction, isBlocked, poseCache }, nearest);
      }
    }
    return nearest;
  }

  /** The ray's first unblocked hit on one zombie's regions when it is nearer than `nearest`, else `nearest`. */
  private nearerRegionHit(
    {
      id,
      zombie,
      origin,
      direction,
      isBlocked,
      poseCache,
    }: {
      id: EntityId;
      zombie: Zombie;
      origin: Vec3;
      direction: Vec3;
      isBlocked: SolidAt;
      poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
    },
    nearest: RegionHit | undefined,
  ): RegionHit | undefined {
    const { blockSize } = this.options;
    const posed = posedRegionsForZombie({ id, zombie, blockSize, poseCache });
    const figure = zombie.type.model === 'amalgam' ? amalgamFigureForType(zombie.type, zombie.figureSeed) : undefined;
    let found = nearest;
    for (const regionId of Object.keys(zombie.regions)) {
      const region = regionId as ZombieHitRegion;
      if (!isActiveHitRegion(zombie, region)) {
        continue;
      }
      const boxes = posed[region] ?? [];
      // An amalgam is struck only on its flesh: its boxes are loose around rounded lobes (#563).
      const hit: { readonly distance: number; readonly box: PosedBoneBox; readonly cell?: number } | undefined = figure
        ? fleshHit({ figure, missing: this.missingFor(zombie), boxes, origin, direction, blockSize })
        : posedRegionHit(boxes, origin, direction, blockSize);
      if (
        hit !== undefined &&
        hit.distance < (found?.distance ?? Number.POSITIVE_INFINITY) &&
        !raycast(origin, direction, hit.distance, isBlocked)
      ) {
        found = { id, zombie, region, distance: hit.distance, boxes, box: hit.box, cell: hit.cell };
      }
    }
    return found;
  }

  /** Purely queries the first visible posed region along the ray, including hits beyond melee reach. */
  aimAt(origin: Vec3, direction: Vec3, weapon: HitWeapon): ZombieAim | undefined {
    return this.targetAt({
      origin,
      direction,
      weapon,
      isBlocked: (x, y, z) => this.options.isSolid(x, y, z) || this.options.isOpaque(x, y, z),
    });
  }

  private targetAt({
    origin,
    direction,
    weapon,
    isBlocked,
    poseCache,
  }: {
    origin: Vec3;
    direction: Vec3;
    weapon: HitWeapon;
    isBlocked: SolidAt;
    poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
  }): ZombieAim | undefined {
    const found = this.firstRegionHit({ origin, direction: unit(direction), isBlocked, poseCache });
    if (!found) {
      return undefined;
    }
    const { id, zombie, region, distance, boxes, box, cell } = found;
    const distanceMetres = distance * this.options.blockSize;
    const reachMetres = PLAYER_ARM_REACH_M + weapon.reach;
    return {
      id,
      region,
      distanceMetres,
      reachMetres,
      inReach: distanceMetres <= reachMetres,
      health: zombie.regions[region]!,
      maxHealth: maxZombieRegionHealth(zombie.type, region) ?? zombie.regions[region]!,
      boxes,
      hitBox: box,
      cell,
    };
  }

  /** Hitscan pellets use the same posed regions, solid occlusion, HP/death and dismemberment path as melee.
   * They do not consume melee stamina, advance its cooldown or emit fist/swing sounds. */
  firePellets(shot: Omit<PelletShot, 'diameterMm'>): number {
    let hits = 0;
    const poseCache = new Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>>();
    const weapon: HitWeapon = {
      ...projectileWeapon(shot.damage, shot.rangeMetres, shot.impulse),
      type: 'pierce',
      ...(shot.headDamageMultiplier === undefined ? {} : { headDamageMultiplier: shot.headDamageMultiplier }),
    };
    // One shot's pellets carve one hole per amalgam, struck against the flesh as it was before the shot's
    // holes, so pellets on one line can't tunnel through the body.
    const strikes = new Map<EntityId, { zombie: Zombie; strikes: AmalgamStrike[] }>();
    for (const direction of shot.directions) {
      const aim = this.targetAt({
        origin: shot.origin,
        direction,
        weapon,
        isBlocked: this.options.isSolid,
        poseCache,
      });
      const zombie = aim && aim.distanceMetres <= shot.rangeMetres ? this.store.get(aim.id) : undefined;
      if (!(aim && zombie)) {
        continue;
      }
      const strike = this.applyMeleeHit({
        id: aim.id,
        zombie,
        region: aim.region,
        cell: aim.cell,
        origin: shot.origin,
        direction,
        distanceMetres: aim.distanceMetres,
        weapon,
        damageType: 'pierce',
        isFist: false,
        projectile: true,
      });
      if (strike) {
        const entry = strikes.get(aim.id) ?? { zombie, strikes: [] };
        entry.strikes.push(strike);
        strikes.set(aim.id, entry);
      }
      hits += 1;
    }
    for (const [id, entry] of strikes) {
      this.carve(id, entry.zombie, entry.strikes);
    }
    return hits;
  }

  /**
   * A detonation at the fragments' origin (`DESIGN.md`, "Hand grenade"). The blast takes its falloff damage from
   * every region of each standing body whose centre it sees, the lethal region last so limbs come off before the
   * kill; then the fragments fly as a shot does. Returns the bodies the blast reached.
   */
  detonate({ blast, fragments }: Detonation): number {
    const { origin } = fragments;
    let reached = 0;
    for (const [id, zombie] of [...this.store.entries()]) {
      const centre = bodyCentre(zombie.body);
      const distance = Math.hypot(centre[0] - origin[0], centre[1] - origin[1], centre[2] - origin[2]);
      const distanceMetres = distance * this.options.blockSize;
      const share = blastShare(blast, distanceMetres);
      if (zombie.incapacitated || share <= 0 || !inSight(origin, centre, this.options.isSolid)) {
        continue;
      }
      reached += 1;
      const toward: Vec3 =
        distance > 0 ? [centre[0] - origin[0], centre[1] - origin[1], centre[2] - origin[2]] : [0, 1, 0];
      const weapon = projectileWeapon(blast.damage * share, blast.radiusMetres, blast.impulse * share);
      for (const region of blastOrder(zombie)) {
        if (this.store.get(id) !== zombie) {
          break;
        }
        if (isActiveHitRegion(zombie, region)) {
          this.applyMeleeHit({
            id,
            zombie,
            region,
            cell: undefined,
            origin,
            direction: toward,
            distanceMetres,
            weapon,
            damageType: 'blunt',
            isFist: false,
            projectile: true,
          });
        }
      }
    }
    this.firePellets(fragments);
    return reached;
  }

  playPlayerMeleeSwing(origin: Vec3, weapon: MeleeWeapon): void {
    this.options.onSound?.(weapon.swingSound ?? 'melee_swing', copy(origin), undefined, true);
  }

  resolvePlayerMelee(origin: Vec3, direction: Vec3, weapon: MeleeWeapon, isFist: boolean): boolean {
    return this.resolveMeleeNow(origin, direction, weapon, isFist) !== undefined;
  }

  private resolveMeleeNow(origin: Vec3, direction: Vec3, weapon: MeleeWeapon, isFist = false): EntityId | undefined {
    const isBlocked = this.options.meleeBlocker?.({ kind: 'player', motion: weapon.motion }) ?? this.options.isSolid;
    const aim = this.targetAt({ origin, direction, weapon, isBlocked });
    if (!aim?.inReach) {
      this.options.onMeleeResult?.({ damage: 0, outcome: 'nothing' });
      return undefined;
    }
    const zombie = this.store.get(aim.id);
    if (!zombie) {
      return undefined;
    }
    const strike = this.applyMeleeHit({
      id: aim.id,
      zombie,
      region: aim.region,
      cell: aim.cell,
      origin,
      direction,
      distanceMetres: aim.distanceMetres,
      weapon,
      damageType: weapon.type ?? 'blunt',
      isFist,
    });
    if (strike) {
      this.carve(aim.id, zombie, [strike]);
    }
    return aim.id;
  }

  /** Immediate combat-query helper retained for deterministic geometry tests; play uses PlayerCombat. */
  swing(origin: Vec3, direction: Vec3, weapon: MeleeWeapon, isFist = false): EntityId | undefined {
    this.playPlayerMeleeSwing(origin, weapon);
    return this.resolveMeleeNow(origin, direction, weapon, isFist);
  }

  /** Applies one hit's damage and effects; returns where it struck an amalgam's flesh, for the caller to carve. */
  private applyMeleeHit({
    id,
    zombie,
    region,
    cell,
    origin,
    direction,
    distanceMetres,
    weapon,
    damageType,
    isFist,
    projectile = false,
    damageOverride,
  }: MeleeHitContext & { projectile?: boolean; damageOverride?: number }): AmalgamStrike | undefined {
    const ray = unit(direction);
    const distance = distanceMetres / this.options.blockSize;
    const hit: HitImpulse = {
      point: [origin[0] + ray[0] * distance, origin[1] + ray[1] * distance, origin[2] + ray[2] * distance],
      direction: ray,
      impulse: weapon.impulse ?? 4,
    };
    const damage = damageOverride ?? meleeDamageForContact(zombie, region, weapon, damageType);
    if (!projectile) {
      this.options.onMeleeContact?.(hit.impulse);
      for (const event of meleeHitSounds(weapon, isFist)) {
        this.options.onSound?.(event, copy(zombie.body.pos), zombie, true);
      }
    }
    const healthBefore = zombie.regions[region]!;
    const severedBefore = new Set(zombie.severed);
    this.options.onSound?.(zombie.type.sounds.hurt, copy(zombie.body.pos), zombie);
    const healthAfter = this.damageRegion(zombie, region, damage);
    if (healthAfter < healthBefore) {
      zombie.hitFlinchTime = 0;
      this.cancelAcidSpit(zombie);
    }
    if (!projectile) {
      this.stagger(zombie, hit.impulse);
    }
    if (damage > 0) {
      this.options.onWound?.(id, zombie, hit, damage);
    }
    const killed = healthAfter === 0 && lethalRegion(zombie.type, region);
    const incapacitated = this.applyMeleeEffects({ id, zombie, region, healthAfter, killed, hit });
    const newParts = zombie.severed.filter((candidate) => !severedBefore.has(candidate));
    const headPart = zombie.type.model === 'amalgam' ? undefined : regionCut(zombie, 'head');
    const part = headPart !== undefined && newParts.includes(headPart) ? headPart : newParts[0];
    const outcome = meleeOutcome(killed, incapacitated, part, headPart);
    if (!projectile) {
      this.options.onMeleeResult?.({
        id,
        region,
        damage: healthBefore - healthAfter,
        healthBefore,
        healthAfter,
        outcome,
        ...(part === undefined ? {} : { part }),
      });
    }
    return strikeOf(zombie, cell, damage, hit);
  }

  /** Knocks out the flesh around one hole: the strikes' central cell, sized by their summed damage. */
  private carve(id: EntityId, zombie: Zombie, strikes: readonly AmalgamStrike[]): void {
    const { carving } = zombie.type;
    if (!carving || strikes.length === 0) {
      return;
    }
    const figure = amalgamFigureForType(zombie.type, zombie.figureSeed);
    const struck = centralCell(
      figure,
      strikes.map((strike) => strike.cell),
    );
    const cells = carveAround({
      figure,
      carving,
      missing: missingFlesh(figure, zombie),
      struck,
      damage: strikes.reduce((total, strike) => total + strike.damage, 0),
    });
    if (cells.length === 0) {
      return;
    }
    zombie.carved = [...zombie.carved, ...cells].sort((a, b) => a - b);
    this.options.onCarve?.(id, zombie, cells, strikes.find((strike) => strike.cell === struck)!.hit);
  }

  /** Doc: `docs/stagger.md`. A heavy enough hit spoils the attack in progress; position is never touched. */
  private stagger(zombie: Zombie, impulse: number): void {
    const { stagger } = zombie.type;
    if (!stagger || impulse < stagger.impulseThreshold) {
      return;
    }
    zombie.staggerSimSeconds = Math.max(zombie.staggerSimSeconds, stagger.durationSimSeconds);
    zombie.attackWindup = 0;
    this.cancelAcidSpit(zombie);
  }

  /** A hit during the wind-up spoils the spit and spends the content fraction of the cooldown. */
  private cancelAcidSpit(zombie: Zombie): void {
    const spit = zombie.type.acidSpit;
    if (spit && zombie.spitWindup > 0) {
      zombie.spitWindup = 0;
      zombie.spitWait = spit.cancelPenaltyFraction * spit.cooldownSimSeconds;
    }
  }

  private applyMeleeEffects({ id, zombie, region, healthAfter, killed, hit }: MeleeEffectsContext): boolean {
    if (zombie.type.model === 'amalgam') {
      const member = AMALGAM_MEMBER_REGION.exec(region)?.[1];
      if (member && healthAfter === 0) {
        this.sever(id, zombie, member, hit);
      }
    } else {
      const cut =
        healthAfter === 0 && region !== 'head' && region !== 'torso'
          ? regionCut(zombie, region as ZombieRegion)
          : undefined;
      if (cut !== undefined) {
        this.sever(id, zombie, cut, hit);
      }
      this.rollDismember(id, zombie, killed, hit);
    }
    const incapacitated = this.resolveRegionDamage(id, zombie, region, healthAfter);
    if (!killed && zombie.type.model !== 'amalgam' && region !== 'head' && region !== 'torso' && healthAfter === 0) {
      this.options.onSevered?.(zombie, region as ZombieRegion);
    }
    return incapacitated;
  }

  /** Takes health from a zombie's legs not yet destroyed, shared between them, as a hit there would. */
  injureLegs(id: EntityId, damage: number): void {
    const zombie = this.store.get(id);
    if (!zombie || damage <= 0) {
      return;
    }
    const legs = (Object.keys(zombie.regions) as ZombieHitRegion[]).filter(
      (region) => ['leftLeg', 'rightLeg'].includes(zombieRegionClass(region)) && zombie.regions[region]! > 0,
    );
    for (const region of legs) {
      if (this.store.get(id) === zombie) {
        this.resolveRegionDamage(id, zombie, region, this.damageRegion(zombie, region, damage / legs.length));
      }
    }
  }

  private damageRegion(zombie: Zombie, region: ZombieHitRegion, damage: number): number {
    const healthAfter = Math.max(0, zombie.regions[region]! - damage);
    zombie.regions[region] = healthAfter;
    return healthAfter;
  }

  private resolveRegionDamage(id: EntityId, zombie: Zombie, region: ZombieHitRegion, healthAfter: number): boolean {
    const killed = healthAfter === 0 && lethalRegion(zombie.type, region);
    const incapacitated =
      zombie.type.model !== 'amalgam' && region === 'torso' && healthAfter === 0 && zombie.regions.head! > 0;
    if (incapacitated && !zombie.incapacitated) {
      zombie.incapacitated = true;
      zombie.horizontalSpeed = 0;
      zombie.attackWait = 0;
      zombie.attackWindup = 0;
      zombie.body.vel[0] = 0;
      zombie.body.vel[2] = 0;
      this.options.onIncapacitated?.(id, zombie);
    }
    if (killed) {
      this.store.remove(id);
      this.options.onDeath?.(id, zombie);
    }
    return incapacitated;
  }

  /**
   * Ends a downed zombie as a kill does: its head is destroyed, it leaves the store and onDeath fires, so its
   * body sinks as a corpse. Dismembering first cuts off whichever arms are still on, and the head, each left
   * behind through onSevered. Returns why not for a zombie that isn't lying downed.
   */
  finishDowned(id: EntityId, dismember: boolean): string | undefined {
    const zombie = this.store.get(id);
    if (!zombie?.incapacitated) {
      return "It isn't lying there any more";
    }
    if (dismember) {
      const hit: HitImpulse = { point: copy(zombie.body.pos), direction: [0, -1, 0], impulse: 0 };
      for (const region of ['leftArm', 'rightArm', 'head'] as const) {
        const part = regionCut(zombie, region);
        if (part !== undefined && !zombie.severed.includes(part)) {
          this.sever(id, zombie, part, hit);
          this.options.onSevered?.(zombie, region);
        }
      }
    }
    zombie.regions.head = 0;
    this.store.remove(id);
    this.options.onDeath?.(id, zombie);
    return undefined;
  }

  /** Records `part` as severed (cumulative, saved) and tells the renderer; a part already cut is a no-op. */
  private sever(id: EntityId, zombie: Zombie, part: string, hit: HitImpulse): void {
    if (zombie.severed.includes(part)) {
      return;
    }
    zombie.severed.push(part);
    this.options.onSever?.(id, zombie, part, hit);
  }

  /** Independent rolls for this hit: type.dismember.chance for a random not-yet-severed arm part (skipping
   * one already implied by a containing part — see availableArmParts), and, only on a killing blow,
   * type.dismember.headOnKillChance for the head too. Uses zombie.dismemberRng, not behaviorRng — see
   * Zombie.dismemberRng's own doc comment. */
  private rollDismember(id: EntityId, zombie: Zombie, killed: boolean, hit: HitImpulse): void {
    const { dismember } = zombie.type;
    if (zombie.dismemberRng.chance(dismember.chance)) {
      const available = availableArmParts(zombie);
      if (available.length > 0) {
        const part = available[zombie.dismemberRng.int(0, available.length - 1)]!;
        this.sever(id, zombie, part, hit);
      }
    }
    const head = regionCut(zombie, 'head');
    if (
      killed &&
      head !== undefined &&
      !zombie.severed.includes(head) &&
      zombie.dismemberRng.chance(dismember.headOnKillChance)
    ) {
      this.sever(id, zombie, head, hit);
    }
  }
}
