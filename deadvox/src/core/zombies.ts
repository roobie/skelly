import { SHAMBLER_FIGURE_SEEDS } from '@mobgen/mob/shamblerFigure.ts';
import { AMALGAM_FIGURE_SEED, amalgamCollisionEnvelope, amalgamFigureForType } from './amalgamFigure.ts';
import type { ZombieDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { advanceShamblerFootsteps, initialShamblerFootstepClock, type ShamblerFootstepClock } from './footsteps.ts';
import { lightSenseRangeScale } from './lights.ts';
import {
  type Body,
  CONTACT_SKIN,
  type PhysicsParams,
  separateBodies,
  separateBodyPair,
  stepBody,
  stepBodyHorizontal,
} from './physics.ts';
import { Rng, type RngState } from './random.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { SenseDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SoundEventId } from './soundEvents.ts';
import { soundOcclusion } from './soundOcclusion.ts';
import { updateStepOffset } from './stepOffset.ts';
import type { PlayerHitArea } from './wear.ts';
import { advanceStanceWeight, HIT_FLINCH_DURATION, targetStanceWeight, zombiePoseInputFor } from './zombiePose.ts';
import { ZOMBIE_REGION_NAMES } from './zombieRegionNames.ts';
import {
  type PosedBoneBox,
  posedAmalgamRegionBoxes,
  posedRegionHitDistance,
  posedShamblerRegionBoxes,
  type ZombieHitRegion,
  type ZombieRegion,
  type ZombieRegions,
} from './zombieRegions.ts';

export type PlayerMovement = 'walking' | 'jogging' | 'sprinting' | 'still';
export type ZombieTier = 'active' | 'background' | 'unloaded';
export const ACTIVE_ZOMBIE_RADIUS_METRES = 40;
export const BACKGROUND_ZOMBIE_RATE = 2;
export const BACKGROUND_ZOMBIE_SLICE_COUNT = 30;
export const BACKGROUND_ZOMBIE_SLICE_RATE = BACKGROUND_ZOMBIE_RATE * BACKGROUND_ZOMBIE_SLICE_COUNT;
const BACKGROUND_STEP_CAP_METRES = 1;
export type ZombieMode = 'idle' | 'stroll' | 'search' | 'chase' | 'investigate' | 'return';

/** Effective eye-to-hand reach in metres, including leaning into a swing; weapon reach extends beyond it. */
export const PLAYER_ARM_REACH_M = 1.2;

import type { PelletShot } from './pellets.ts';

export const FISTS_MELEE = { damage: 8, reach: 0.1, cooldown: 0.8, stamina: 4, impulse: 4 } as const;

const zombieRegionClass = (region: ZombieHitRegion): string =>
  region === 'core.trunk' ? 'torso' : (region.split('.').at(-1) ?? region);

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

type MeleeDamageType = 'blunt' | 'cut' | 'pierce';

export interface MeleeWeapon {
  readonly damage: number;
  readonly reach: number;
  readonly cooldown: number;
  readonly stamina?: number | undefined;
  readonly impulse?: number | undefined;
  readonly damageVariance?: number | undefined;
  readonly headDamageMultiplier?: number | undefined;
  readonly limbDamageMultiplier?: number | undefined;
  readonly speedMultiplier?: number | undefined;
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
}

interface MeleeHitContext {
  readonly id: EntityId;
  readonly zombie: Zombie;
  readonly region: ZombieHitRegion;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly distanceMetres: number;
  readonly weapon: MeleeWeapon;
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
  weapon: MeleeWeapon,
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

export interface MeleeResult {
  readonly id?: EntityId | undefined;
  readonly region?: ZombieHitRegion | undefined;
  readonly damage: number;
  readonly healthBefore?: number | undefined;
  readonly healthAfter?: number | undefined;
  readonly outcome: 'nothing' | 'severed' | 'incapacitated' | 'killed' | 'decapitated';
  readonly part?: string | undefined;
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
  /** Part names (mobgen/src/mob/dismember.ts's SEVERABLE_PARTS, e.g. "upperArm.L", "head") severed so
   * far — cumulative, never un-severed. A renderer derives what to hide via mobgen's severedBoneSet, not
   * stored pre-expanded here (severing upperArm.L already implies forearm.L/hand.L without listing them). */
  severed: string[];
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
  return zombie.type.attack.reach * amalgamFigureForType(zombie.type, zombie.figureSeed).scale;
};

export type ZombieState = Omit<
  Zombie,
  'type' | 'tier' | 'behaviorRng' | 'soundRng' | 'dismemberRng' | 'renderPrevious' | 'lastVocalNoiseId'
> & {
  type: string;
  behaviorRng: RngState;
  soundRng: RngState;
  dismemberRng: RngState;
  lastVocalNoiseId: number | null;
};

const validRngState = (state: unknown): state is RngState =>
  Array.isArray(state) && state.length === 4 && state.every((word) => Number.isSafeInteger(word));
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
  (zombie.lastVocalNoiseId === null ||
    (Number.isSafeInteger(zombie.lastVocalNoiseId) && zombie.lastVocalNoiseId >= 0)) &&
  (zombie.stimulusAt === undefined || (Number.isFinite(zombie.stimulusAt) && zombie.stimulusAt >= 0)) &&
  Array.isArray(zombie.severed) &&
  zombie.severed.every((part) => typeof part === 'string') &&
  validShamblerFootstepClock(zombie.footstepClock);
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
  mode: 'home' | 'roam' | 'noise';
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
  ['home', 'roam', 'noise'].includes(horde.mode) &&
  Number.isFinite(horde.roamTimer) &&
  horde.roamTimer >= 0 &&
  Number.isSafeInteger(horde.lastNoiseId) &&
  horde.lastNoiseId >= 0 &&
  (horde.stimulusAt === undefined || (Number.isFinite(horde.stimulusAt) && horde.stimulusAt >= 0)) &&
  validRngState(horde.rng);

export interface ZombieSystemState {
  nextEntityId: number;
  zombies: { id: number; zombie: ZombieState }[];
  hordes: HordeState[];
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
  crouching?: boolean | undefined;
  lit: boolean;
  lightSeenFrom: number;
  eyeHeightMetres?: number | undefined;
  lightHeightMetres?: number | undefined;
  /** Direct sunlight at the player's position; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  lightSources?: readonly ZombieLightSource[] | undefined;
  vocalNoise?: VocalNoise | undefined;
}

interface ZombieLightSource {
  pos: Vec3;
  seenFrom: number;
  heightMetres?: number | undefined;
  /** Direct sunlight at the source; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  /** Player-carried light uses the darkness gate; independent sources use lure tuning. */
  carried: boolean;
}

export interface ZombieSystemOptions {
  store?: EntityStore<Zombie>;
  terrainFloor?: TerrainFloorAt | undefined;
  seed?: number;
  /** Movement, attacks and hearing use the body's blockers. */
  isSolid: SolidAt;
  /** True only while terrain at the actor's position is loaded; unloaded actors wait for Slice 4 catch-up. */
  isLoaded?: ((x: number, z: number) => boolean) | undefined;
  /** Visibility alone uses sight opacity. */
  isOpaque: SolidAt;
  blockSize: number;
  physics: PhysicsParams;
  /** Take-off speed in metres per second, like `PLAYER.jump`; the system divides by `blockSize` itself. */
  jumpSpeed: number;
  tuning: SenseDef;
  player: () => PlayerSense;
  hour: () => number;
  isSunExposedAt?: ((position: Vec3, hour: number) => boolean) | undefined;
  hurtPlayer: (amount: number, area: PlayerHitArea, attacker: EntityId) => void;
  /** The id is what a renderer keys its corpse on; the zombie is already out of the store. */
  onDeath?: (id: EntityId, zombie: Zombie) => void;
  /** Called once when torso health reaches zero while the head remains intact. */
  onIncapacitated?: (id: EntityId, zombie: Zombie) => void;
  /** A region other than the head ran out of health: the game leaves the severed part behind (an item). */
  onSevered?: (zombie: Zombie, region: Exclude<ZombieRegion, 'head'>) => void;
  /** Sound-source position is in block coordinates; body is present when the shambler made the sound. */
  onSound?: (event: SoundEventId, position: Vec3, body?: Zombie) => void;
  /** Called for actual ground-travel footfalls of the nearest three moving shamblers. */
  onFootstep?: (position: Vec3, id: EntityId, mode: ZombieMode, body: Zombie) => void;
  /** Called once for every part severed (src/core/zombies.ts's swing — the melee hit path), *after*
   * `zombie.severed` already includes `part`, so a renderer reading zombie.severed at this point sees the
   * new cut too. Fires before onDeath on a killing blow that also severs the head. */
  onSever?: (id: EntityId, zombie: Zombie, part: string, hit: HitImpulse) => void;
  /** Reports the actual result of an attempted player melee swing; absent in normal play. */
  onMeleeResult?: (result: MeleeResult) => void;
  /** Presentation-only recoil for a confirmed hit. */
  onMeleeContact?: (impulse: number) => void;
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
const openWanderHeadings = ({
  body,
  intent,
  isSolid,
  physics,
  blockSize,
}: {
  body: Body;
  intent: Vec3;
  isSolid: SolidAt;
  physics: PhysicsParams;
  blockSize: number;
}): Vec3[] => {
  const initial = copy(body.pos);
  const duration = OBSTACLE_PROBE_DISTANCE_METRES / OBSTACLE_PROBE_SPEED;
  const headings: Vec3[] = [];
  for (const offset of OBSTACLE_WANDER_ANGLES) {
    const heading = headingAt(angleOf(intent) + offset);
    const probe: Body = {
      ...body,
      pos: copy(initial),
      vel: [(heading[0] * OBSTACLE_PROBE_SPEED) / blockSize, 0, (heading[2] * OBSTACLE_PROBE_SPEED) / blockSize],
    };
    stepBody(probe, duration, isSolid, physics);
    const progress = ((probe.pos[0] - initial[0]) * heading[0] + (probe.pos[2] - initial[2]) * heading[2]) * blockSize;
    if (progress >= OBSTACLE_PROBE_DISTANCE_METRES * 0.5) {
      headings.push(heading);
    }
  }
  return headings;
};
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (current: number, target: number, amount: number): number =>
  current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);
const smooth01 = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const approachAngle = (current: number, target: number, amount: number): number =>
  current + Math.sign(wrapAngle(target - current)) * Math.min(Math.abs(wrapAngle(target - current)), amount);
const turnToward = (current: Vec3, target: Vec3, radians: number): Vec3 =>
  headingAt(approachAngle(angleOf(current), angleOf(target), radians));
const inRange = (rng: Rng, range: { min: number; max: number }): number => rng.range(range.min, range.max);

interface AttackReachProbe {
  zombiePos: Vec3;
  playerPos: Vec3;
  reachMetres: number;
  blockSize: number;
  isSolid: SolidAt;
}

/** Shared by both attack start (telegraph) and attack resolve (after the windup elapses): horizontal
 * reach, a vertical band matching a standing player, and clear chest-to-chest line of sight. Used
 * identically at both times so "still in reach" at resolve means exactly what "in reach" meant at start. */
const withinAttackReach = ({ zombiePos, playerPos, reachMetres, blockSize, isSolid }: AttackReachProbe): boolean => {
  if (reachMetres <= 0 || horizontalDistance(playerPos, zombiePos) * blockSize > reachMetres) {
    return false;
  }
  if (Math.abs(playerPos[1] - zombiePos[1]) * blockSize >= 1.7) {
    return false;
  }
  const chestOffset = 1 / blockSize;
  const zombieChest: Vec3 = [zombiePos[0], zombiePos[1] + chestOffset, zombiePos[2]];
  const playerChest: Vec3 = [playerPos[0], playerPos[1] + chestOffset, playerPos[2]];
  const toPlayer = sub(playerChest, zombieChest);
  const chestDistance = Math.hypot(...toPlayer);
  return chestDistance > 0 && raycast(zombieChest, unit(toPlayer), chestDistance, isSolid) === undefined;
};

// ---- dismemberment: which part a hit can sever, and the gameplay effect of already-severed parts ----
// Mirrors mobgen/src/mob/dismember.ts's SEVERABLE_PARTS (arms only here — the head has its own
// headOnKillChance roll in swing(), not picked randomly among these).

const ARM_PARTS = ['hand.L', 'hand.R', 'forearm.L', 'forearm.R', 'upperArm.L', 'upperArm.R'] as const;
/** A part already severed further up the same arm makes a part below it moot to sever again (upperArm.L
 * severed already implies forearm.L/hand.L are gone too — see mobgen's severedBoneSet). */
const CONTAINING_PARTS: Readonly<Record<(typeof ARM_PARTS)[number], readonly string[]>> = {
  'hand.L': ['forearm.L', 'upperArm.L'],
  'hand.R': ['forearm.R', 'upperArm.R'],
  'forearm.L': ['upperArm.L'],
  'forearm.R': ['upperArm.R'],
  'upperArm.L': [],
  'upperArm.R': [],
};

type ArmRegion = 'leftArm' | 'rightArm';
/** The mobgen part a destroyed arm region cuts at (the figure's own left is -X, mobgen's ".L"). */
const meleeOutcome = (killed: boolean, incapacitated: boolean, part: string | undefined): MeleeResult['outcome'] => {
  if (killed) {
    return part === 'head' ? 'decapitated' : 'killed';
  }
  if (incapacitated) {
    return 'incapacitated';
  }
  return part ? 'severed' : 'nothing';
};

const ARM_REGION_PART: Readonly<Record<ArmRegion, (typeof ARM_PARTS)[number]>> = {
  leftArm: 'upperArm.L',
  rightArm: 'upperArm.R',
};

/** Arm parts still worth severing: not already severed, and not already implied by a containing part
 * severed further up the same arm (see CONTAINING_PARTS). Empty once both arms are fully gone. */
const availableArmParts = (severed: readonly string[]): (typeof ARM_PARTS)[number][] =>
  ARM_PARTS.filter((part) => !(severed.includes(part) || CONTAINING_PARTS[part].some((c) => severed.includes(c))));

/** True once a side's arm is gone at the forearm or above (a hand-only loss still lets it attack — it's
 * grabbing with the other hand or the stump itself). */
const armGoneAtForearmOrAbove = (severed: readonly string[], side: 'L' | 'R'): boolean =>
  severed.includes(`forearm.${side}`) || severed.includes(`upperArm.${side}`);

/** Gameplay effect, first slice: with both arms gone at the forearm or above, there's nothing left to grab
 * or claw with — the zombie can still chase, but never starts a new attack (see the windup start check in
 * tick()). Already-started windups aren't cancelled retroactively; this only gates a *new* one. */
const canStillAttack = (severed: readonly string[]): boolean =>
  !(armGoneAtForearmOrAbove(severed, 'L') && armGoneAtForearmOrAbove(severed, 'R'));

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

/** Daylight follows the sky's 06:30 dawn and 19:30 dusk keys. */
const isDaylight = (hour: number): boolean => hour >= 6.5 && hour < 19.5;

export interface PerceptionInput {
  zombie: ZombieDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  hour: number;
  blockSize: number;
  isSolid: SolidAt;
  isSunExposedAt?: ((position: Vec3, hour: number) => boolean) | undefined;
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
  hour: number;
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
  wasAware: boolean;
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
  hour: 0,
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
  wasAware: false,
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
  const range = hearingRange(zombie, player.movement) * (player.crouching ? tuning.crouch.hearingRangeScale : 1);
  if (range <= 0) {
    return undefined;
  }
  const distance = Math.hypot(...sub(player.pos, from)) * blockSize;
  const earOffset = 1.3 / blockSize;
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
  const earOffset = 1.3 / blockSize;
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
  hour,
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
  const rayOrigin: Vec3 = [from[0], from[1] + 1.3 / blockSize, from[2]];
  const eyeHeight = player.eyeHeightMetres ?? 1.3;
  const lightHeight = player.lightHeightMetres ?? eyeHeight;
  const clearAtHeight = (heightMetres: number): boolean => {
    const rayTarget: Vec3 = [player.pos[0], player.pos[1] + heightMetres / blockSize, player.pos[2]];
    const toTarget = sub(rayTarget, rayOrigin);
    return raycast(rayOrigin, unit(toTarget), Math.hypot(...toTarget), isSolid) === undefined;
  };
  const clear = clearAtHeight(eyeHeight);
  const lightClear = !player.lit || clearAtHeight(lightHeight);
  let sightRange = isDaylight(hour) ? zombie.sight : zombie.nightSight;
  const playerSunlit = player.sunlit ?? isSunExposedAt?.(player.pos, hour) ?? isDaylight(hour);
  const playerLightScale = lightSenseRangeScale('carried', playerSunlit, tuning.light);
  if (player.lit && lightClear && playerLightScale > 0) {
    sightRange = Math.max(sightRange, player.lightSeenFrom * playerLightScale);
  } else if (player.crouching) {
    sightRange *= tuning.crouch.sightRangeScale;
  }
  return clear && metres <= sightRange;
};

const canSeeLight = ({
  zombie,
  from,
  look,
  source,
  hour,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  zombie: ZombieDef;
  from: Vec3;
  look: Vec3;
  source: ZombieLightSource;
  hour: number;
  blockSize: number;
  isOpaque: SolidAt;
  isSunExposedAt?: ((position: Vec3, hour: number) => boolean) | undefined;
  tuning: SenseDef;
}): number | undefined => {
  const delta = sub(source.pos, from);
  const distance = Math.hypot(delta[0], delta[2]) * blockSize;
  const sunlit = source.sunlit ?? isSunExposedAt?.(source.pos, hour) ?? isDaylight(hour);
  const exposure = source.carried ? 'carried' : 'world';
  if (distance <= 0 || distance > source.seenFrom * lightSenseRangeScale(exposure, sunlit, tuning.light)) {
    return undefined;
  }
  const direction = unit(delta);
  const dot = Math.max(-1, Math.min(1, look[0] * direction[0] + look[2] * direction[2]));
  if (dot < Math.cos((zombie.sightCone * Math.PI) / 180)) {
    return undefined;
  }
  const origin: Vec3 = [from[0], from[1] + 1.3 / blockSize, from[2]];
  const height = source.heightMetres ?? 0.15;
  const target: Vec3 = [source.pos[0], source.pos[1] + height / blockSize, source.pos[2]];
  const ray = sub(target, origin);
  return raycast(origin, unit(ray), Math.hypot(...ray), isOpaque) === undefined ? distance : undefined;
};

const visibleLightTarget = ({
  zombie,
  from,
  facing,
  player,
  hour,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  zombie: ZombieDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  hour: number;
  blockSize: number;
  isOpaque: SolidAt;
  isSunExposedAt?: ((position: Vec3, hour: number) => boolean) | undefined;
  tuning: SenseDef;
}): Vec3 | undefined => {
  const look = unit(facing);
  let nearest: ZombieLightSource | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const source of player.lightSources ?? []) {
    const distance = canSeeLight({ zombie, from, look, source, hour, blockSize, isOpaque, isSunExposedAt, tuning });
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

const snapshotZombie = (id: number, zombie: Zombie): { id: number; zombie: ZombieState } => {
  const {
    type,
    behaviorRng,
    soundRng,
    dismemberRng,
    tier: _tier,
    renderPrevious: _renderPrevious,
    searchAnchor,
    obstacleWanderHeading,
    lastPerceived,
    investigationTier,
    stanceWeight,
    hitFlinchTime,
    hordeId,
    stimulusAt,
    stepOffset,
    ...state
  } = zombie;
  return {
    id,
    zombie: {
      ...state,
      regions: { ...zombie.regions },
      type: type.id,
      behaviorRng: [...behaviorRng.state()] as RngState,
      soundRng: [...soundRng.state()] as RngState,
      dismemberRng: [...dismemberRng.state()] as RngState,
      lastVocalNoiseId: zombie.lastVocalNoiseId ?? null,
      ...(investigationTier === undefined ? {} : { investigationTier }),
      ...(stanceWeight === undefined ? {} : { stanceWeight }),
      ...(hitFlinchTime === undefined ? {} : { hitFlinchTime }),
      ...(hordeId === undefined ? {} : { hordeId }),
      ...(stimulusAt === undefined ? {} : { stimulusAt }),
      ...(stepOffset === undefined ? {} : { stepOffset }),
      body: { ...zombie.body, pos: [...zombie.body.pos], vel: [...zombie.body.vel] },
      facing: [...zombie.facing],
      home: [...zombie.home],
      ...(searchAnchor === undefined ? {} : { searchAnchor: [...searchAnchor] }),
      searchHeading: [...zombie.searchHeading],
      strollHeading: [...zombie.strollHeading],
      ...(lastPerceived === undefined ? {} : { lastPerceived: [...lastPerceived] }),
      ...(obstacleWanderHeading === undefined ? {} : { obstacleWanderHeading: [...obstacleWanderHeading] as Vec3 }),
      ...(zombie.hordeOffset === undefined ? {} : { hordeOffset: [...zombie.hordeOffset] as Vec3 }),
      severed: [...zombie.severed],
    },
  };
};

export class ZombieSystem {
  readonly store: EntityStore<Zombie>;
  private readonly options: ZombieSystemOptions;
  private readonly tickScratch = createZombieTickScratch();
  private readonly hordes = new Map<string, { state: Omit<HordeState, 'rng'>; rng: Rng }>();
  private frozen = false;

  constructor(options: ZombieSystemOptions) {
    this.options = options;
    this.store = options.store ?? new MapEntityStore<Zombie>();
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
      zombies: [...this.store.entries()].map(([id, zombie]) => snapshotZombie(id, zombie)),
      hordes: [...this.hordes.values()].map(({ state: horde, rng }) => {
        const { stimulusAt, ...state } = horde;
        return {
          ...state,
          home: [...horde.home],
          target: [...horde.target],
          ...(stimulusAt === undefined ? {} : { stimulusAt }),
          rng: [...rng.state()] as RngState,
        };
      }),
    });
  }

  restoreState(state: ZombieSystemState, resolveType: (id: string) => ZombieDef | undefined): void {
    if (this.store.size > 0) {
      throw new Error('Zombie state restores only into an empty entity store');
    }
    const entries = state.zombies.map(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validate every persisted zombie invariant before mutating the entity store.
      ({ id, zombie }) => {
        if (
          !Number.isSafeInteger(id) ||
          id < 1 ||
          !validRngState(zombie.behaviorRng) ||
          !validRngState(zombie.soundRng) ||
          !validRngState(zombie.dismemberRng) ||
          !Number.isFinite(zombie.idleSoundTimer) ||
          zombie.idleSoundTimer < 0 ||
          !validZombieEventState(zombie) ||
          !validHordeMemberState(zombie) ||
          !Number.isSafeInteger(zombie.figureSeed) ||
          !(SHAMBLER_FIGURE_SEEDS as readonly number[]).includes(zombie.figureSeed) ||
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
        const { type: _type, behaviorRng, soundRng, dismemberRng, lastVocalNoiseId, ...fields } = zombie;
        const restored: Zombie = {
          ...fields,
          type,
          regions: { ...zombie.regions },
          behaviorRng: new Rng(behaviorRng),
          soundRng: new Rng(soundRng),
          dismemberRng: new Rng(dismemberRng),
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
        };
        return [id, restored] as const;
      },
    );
    this.store.restore(entries, state.nextEntityId);
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
        : SHAMBLER_FIGURE_SEEDS[
            Rng.stream(this.options.seed ?? 0, `zombie-figure:${this.store.nextId}`).int(
              0,
              SHAMBLER_FIGURE_SEEDS.length - 1,
            )
          ]!;
    const dimensions: { halfWidth: number; halfDepth?: number; height: number } =
      type.model === 'amalgam'
        ? amalgamCollisionEnvelope(amalgamFigureForType(type, figureSeed), this.options.blockSize)
        : { halfWidth: 0.28 / this.options.blockSize, height: 1.7 / this.options.blockSize };
    const zombie: Zombie = {
      type,
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
      gaitPhase: 0,
      footstepClock: initialShamblerFootstepClock(type.stepLength),
      wanderClock: 0,
      stepOffset: 0,
      severed: [],
    };
    const id = this.store.add(zombie);
    // EntityStore ids are stable within the world's entity lifetime.
    zombie.behaviorRng = Rng.stream(this.options.seed ?? 0, `zombie:${id}`);
    zombie.soundRng = Rng.stream(this.options.seed ?? 0, `zombie-sound:${id}`);
    zombie.dismemberRng = Rng.stream(this.options.seed ?? 0, `zombie-dismember:${id}`);
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
    for (let index = 0; index < count; index++) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radiusMetres = 0.35 + 0.38 * Math.sqrt(index);
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
    return horizontalDistance(position, player.pos) * this.options.blockSize <= ACTIVE_ZOMBIE_RADIUS_METRES
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
  private updateHordes(dt: number, time: number, player: PlayerSense): void {
    const { blockSize, isSolid } = this.options;
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
      const night = this.options.hour() >= 20 || this.options.hour() < 6;
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
      if (horde.mode === 'noise' && arrived) {
        horde.mode = night ? 'roam' : 'home';
        horde.stimulusAt = undefined;
        horde.roamTimer = 0;
      }
      if (!night && horde.mode !== 'noise') {
        horde.mode = 'home';
        horde.target = copy(horde.home);
        horde.roamTimer = 0;
      } else if (night && horde.mode !== 'noise') {
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
    if (sliceIndex === 0) {
      this.updateHordes(dt, time, player);
    }
    const { blockSize, isSolid } = this.options;
    const physics = { ...this.options.physics, obstacles: player.body ? [player.body] : [] };
    const scratch = this.tickScratch;
    scratch.dt = dt;
    scratch.time = time;
    scratch.player = player;
    scratch.hour = this.options.hour();
    scratch.blockSize = blockSize;
    scratch.isSolid = isSolid;
    scratch.isOpaque = this.options.isOpaque;
    for (const [id, zombie] of this.store.entries()) {
      if (zombie.tier !== 'background' || id % sliceCount !== sliceIndex) {
        continue;
      }
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
      let target = this.hordeTarget(zombie) ?? zombie.lastPerceived;
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
            ? Math.min(zombie.type.speed.chaseMetresPerSimSecond, BACKGROUND_STEP_CAP_METRES / dt, distance / dt)
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
      zombie.horizontalSpeed = speed;
      zombie.body.vel[0] = (direction[0] * speed) / blockSize;
      zombie.body.vel[2] = (direction[2] * speed) / blockSize;
      const before = copy(zombie.body.pos);
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
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
    stepBody(zombie.body, dt, this.options.isSolid, { ...this.options.physics, obstacles: [] });
  }

  private updateZombieTimers(): void {
    const { zombie, dt } = this.tickScratch;
    if (zombie.hitFlinchTime !== undefined) {
      const nextFlinchTime = zombie.hitFlinchTime + dt;
      zombie.hitFlinchTime = nextFlinchTime > HIT_FLINCH_DURATION ? undefined : nextFlinchTime;
    }
    zombie.attackWait = Math.max(0, zombie.attackWait - dt);
  }

  private updatePerception(): void {
    const scratch = this.tickScratch;
    const { zombie, type, pos, player, hour, blockSize, isOpaque, isSolid, time, rng, perception } = scratch;
    perception.zombie = type;
    perception.from = pos;
    perception.facing = zombie.facing;
    perception.player = player;
    perception.hour = hour;
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
      hour,
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
    hearing.isSolid = isSolid;
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
        isSolid,
        rng,
        tuning: this.options.tuning,
      });
    }
    scratch.tier = scratch.sees ? undefined : (scratch.vocal?.tier ?? hearingTier(hearing));
    scratch.wasAware = zombie.mode === 'chase' || zombie.mode === 'investigate';
    if ((scratch.sees || scratch.tier || scratch.lightTarget) && !scratch.wasAware) {
      this.options.onSound?.(type.sounds.alert, copy(pos), zombie);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Preserve precedence between sight, near/far noise, prior chase, and horde attention.
  private updateAttention(): void {
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
    } else if (tier === 'far' && (zombie.mode === 'idle' || zombie.mode === 'stroll' || zombie.mode === 'search')) {
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
    zombie.facing = turnToward(
      zombie.facing,
      scratch.direction,
      (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
    );
    scratch.direction = zombie.facing;
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
      zombie.facing = turnToward(
        zombie.facing,
        scratch.direction,
        (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
      );
      scratch.direction = zombie.facing;
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
        zombie.facing = turnToward(
          zombie.facing,
          scratch.direction,
          (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
        );
        scratch.direction = zombie.facing;
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
    const { zombie, type, player, blockSize, isSolid, pos, obstacleDirection, dt } = scratch;
    if (zombie.mode === 'chase') {
      scratch.target = player.pos;
    } else if (zombie.mode === 'investigate') {
      scratch.target = zombie.lastPerceived ?? zombie.home;
    }
    scratch.metresToTarget = horizontalDistance(scratch.target, pos) * blockSize;
    scratch.returnArrived = zombie.mode === 'return' && scratch.metresToTarget < 0.4;
    scratch.seeking = zombie.mode === 'chase' || zombie.mode === 'investigate';
    scratch.inReach =
      zombie.mode === 'chase' &&
      withinAttackReach({
        zombiePos: pos,
        playerPos: scratch.target,
        reachMetres: zombieAttackReachMetres(zombie),
        blockSize,
        isSolid,
      });
    scratch.direction = obstacleDirection ?? unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
    scratch.moving = scratch.seeking ? !scratch.inReach : scratch.returnArrived || scratch.metresToTarget > 0.25;
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
      zombie.facing = turnToward(zombie.facing, scratch.direction, turnRadians);
      scratch.direction = zombie.facing;
    } else {
      scratch.direction = [0, 0, 0];
    }
    zombie.headYaw = approachAngle(zombie.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private updateMovementSpeed(): void {
    const scratch = this.tickScratch;
    const { zombie, type, dt } = scratch;
    if (zombie.regions.leftLeg! <= 0 && zombie.regions.rightLeg! <= 0) {
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
    const outward = zombie.facing[0] * away[0] + zombie.facing[2] * away[2];
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
    const obstacles = player.body ? [player.body] : [];
    stepBody(zombie.body, dt, isSolid, {
      ...this.options.physics,
      stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2,
      obstacles,
    });
    scratch.travelled = horizontalDistance(scratch.beforeStep, zombie.body.pos) * blockSize;
    scratch.wallAhead =
      aimDirection !== undefined &&
      raycast(
        [scratch.beforeStep[0], scratch.beforeStep[1] + 0.1 / blockSize, scratch.beforeStep[2]],
        aimDirection,
        0.7 / blockSize,
        isSolid,
      ) !== undefined;
    scratch.dx = zombie.body.pos[0] - scratch.beforeStep[0];
    scratch.dz = zombie.body.pos[2] - scratch.beforeStep[2];
    scratch.forward = aimDirection ? (scratch.dx * aimDirection[0] + scratch.dz * aimDirection[2]) * blockSize : 0;
    scratch.obstacleContact =
      scratch.wallAhead &&
      !scratch.jumpAttempted &&
      zombie.horizontalSpeed > 0.01 &&
      scratch.forward < zombie.horizontalSpeed * dt * 0.1;
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
      zombie.obstacleSlideSide = rng.int(0, 1) === 0 ? -1 : 1;
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

  private resolveZombieAttack(): void {
    const scratch = this.tickScratch;
    const { zombie, dt, player, blockSize, type, pos, isSolid } = scratch;
    if (zombie.attackWindup > 0) {
      zombie.attackWindup = Math.max(0, zombie.attackWindup - dt);
      if (
        zombie.attackWindup <= 0 &&
        withinAttackReach({
          zombiePos: pos,
          playerPos: player.pos,
          reachMetres: zombieAttackReachMetres(zombie),
          blockSize,
          isSolid,
        })
      ) {
        this.options.hurtPlayer(type.attack.damage, type.attack.hitRegion ?? 'torso', scratch.id);
      }
    } else if (
      zombie.mode === 'chase' &&
      zombie.attackWait <= 0 &&
      (type.model === 'amalgam' ? activeAmalgamMembers(zombie).length > 0 : canStillAttack(zombie.severed)) &&
      withinAttackReach({
        zombiePos: pos,
        playerPos: player.pos,
        reachMetres: zombieAttackReachMetres(zombie),
        blockSize,
        isSolid,
      })
    ) {
      this.options.onSound?.(type.sounds.attack, copy(pos), zombie);
      zombie.attackWindup = type.attack.windupSimSeconds;
      zombie.attackWait = type.attack.cooldownSimSeconds;
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
    separateBodies({
      bodies: entries.filter(([, zombie]) => !zombie.incapacitated).map(([, zombie]) => zombie.body),
      dt,
      isSolid,
      blockSize,
      obstacles: player.body ? [player.body] : [],
    });
    if (!player.body) {
      return;
    }
    for (const [, zombie] of entries) {
      if (!zombie.incapacitated) {
        separateBodyPair({ first: player.body, second: zombie.body, dt, isSolid, blockSize });
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
        zombie.type.id !== 'shambler' ||
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
    const hour = this.options.hour();
    const { blockSize, isSolid } = this.options;
    const groundedAtTickStart = new Map<Zombie, boolean>();
    const scratch = this.tickScratch;
    scratch.dt = dt;
    scratch.time = time;
    scratch.player = player;
    scratch.hour = hour;
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

  tickActive(dt: number, time = 0, hands?: { right: number | null; left: number | null }): void {
    this.tick(dt, time, hands, 'active');
  }

  unsafeReason(playerPos = this.options.player().pos): string | undefined {
    const { blockSize } = this.options;
    for (const [, zombie] of this.store.entries()) {
      if (
        !zombie.incapacitated &&
        (zombie.mode === 'chase' || horizontalDistance(zombie.body.pos, playerPos) * blockSize <= 30)
      ) {
        return 'A shambler is close';
      }
    }
    return undefined;
  }

  private firstRegionHit({
    origin,
    direction,
    isBlocked,
    poseCache,
  }: {
    origin: Vec3;
    direction: Vec3;
    isBlocked: SolidAt;
    poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
  }): [EntityId, Zombie, ZombieHitRegion, number, readonly PosedBoneBox[]] | undefined {
    const { blockSize } = this.options;
    let nearest: [EntityId, Zombie, ZombieHitRegion, number, readonly PosedBoneBox[]] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [id, zombie] of this.store.entries()) {
      if (zombie.incapacitated || !rayMayHitZombie(zombie, origin, direction, blockSize)) {
        continue;
      }
      const posed = posedRegionsForZombie({ id, zombie, blockSize, poseCache });
      for (const regionId of Object.keys(zombie.regions)) {
        const region = regionId as ZombieHitRegion;
        if (!isActiveHitRegion(zombie, region)) {
          continue;
        }
        const boxes = posed[region] ?? [];
        const distance = posedRegionHitDistance(boxes, origin, direction, blockSize);
        if (distance === undefined || raycast(origin, direction, distance, isBlocked) || distance >= nearestDistance) {
          continue;
        }
        nearestDistance = distance;
        nearest = [id, zombie, region, distance, boxes];
      }
    }
    return nearest;
  }

  /** Purely queries the first visible posed region along the ray, including hits beyond melee reach. */
  aimAt(origin: Vec3, direction: Vec3, weapon: MeleeWeapon): ZombieAim | undefined {
    return this.targetAt({ origin, direction, weapon, isBlocked: this.options.isOpaque });
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
    weapon: MeleeWeapon;
    isBlocked: SolidAt;
    poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
  }): ZombieAim | undefined {
    const found = this.firstRegionHit({ origin, direction: unit(direction), isBlocked, poseCache });
    if (!found) {
      return undefined;
    }
    const [id, zombie, region, distance, boxes] = found;
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
    };
  }

  /** Hitscan pellets use the same posed regions, solid occlusion, HP/death and dismemberment path as melee.
   * They do not consume melee stamina, advance its cooldown or emit fist/swing sounds. */
  firePellets(shot: PelletShot): number {
    let hits = 0;
    const poseCache = new Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>>();
    const weapon: MeleeWeapon = {
      damage: shot.damage,
      reach: shot.rangeMetres,
      cooldown: 0,
      impulse: shot.impulse,
      type: 'pierce',
      ...(shot.headDamageMultiplier === undefined ? {} : { headDamageMultiplier: shot.headDamageMultiplier }),
    };
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
      this.applyMeleeHit({
        id: aim.id,
        zombie,
        region: aim.region,
        origin: shot.origin,
        direction,
        distanceMetres: aim.distanceMetres,
        weapon,
        damageType: 'pierce',
        isFist: false,
        projectile: true,
      });
      hits += 1;
    }
    return hits;
  }

  playPlayerMeleeSwing(origin: Vec3): void {
    this.options.onSound?.('melee_swing', copy(origin));
  }

  resolvePlayerMelee(origin: Vec3, direction: Vec3, weapon: MeleeWeapon, isFist: boolean): boolean {
    return this.resolveMeleeNow(origin, direction, weapon, isFist) !== undefined;
  }

  private resolveMeleeNow(
    origin: Vec3,
    direction: Vec3,
    weapon: MeleeWeapon,
    isFist = weapon === FISTS_MELEE,
  ): EntityId | undefined {
    const aim = this.targetAt({ origin, direction, weapon, isBlocked: this.options.isSolid });
    if (!aim?.inReach) {
      this.options.onMeleeResult?.({ damage: 0, outcome: 'nothing' });
      return undefined;
    }
    const zombie = this.store.get(aim.id);
    if (!zombie) {
      return undefined;
    }
    this.applyMeleeHit({
      id: aim.id,
      zombie,
      region: aim.region,
      origin,
      direction,
      distanceMetres: aim.distanceMetres,
      weapon,
      damageType: weapon.type ?? 'blunt',
      isFist,
    });
    return aim.id;
  }

  /** Immediate combat-query helper retained for deterministic geometry tests; play uses PlayerCombat. */
  swing(origin: Vec3, direction: Vec3, weapon: MeleeWeapon): EntityId | undefined {
    this.options.onSound?.('melee_swing', copy(origin));
    return this.resolveMeleeNow(origin, direction, weapon);
  }

  private applyMeleeHit({
    id,
    zombie,
    region,
    origin,
    direction,
    distanceMetres,
    weapon,
    damageType,
    isFist,
    projectile = false,
  }: MeleeHitContext & { projectile?: boolean }): void {
    const ray = unit(direction);
    const distance = distanceMetres / this.options.blockSize;
    const hit: HitImpulse = {
      point: [origin[0] + ray[0] * distance, origin[1] + ray[1] * distance, origin[2] + ray[2] * distance],
      direction: ray,
      impulse: weapon.impulse ?? 4,
    };
    if (!projectile) {
      this.options.onMeleeContact?.(hit.impulse);
    }
    const healthBefore = zombie.regions[region]!;
    const severedBefore = new Set(zombie.severed);
    if (!projectile) {
      this.options.onSound?.(isFist ? 'melee_hit_fist' : 'melee_hit', copy(zombie.body.pos), zombie);
    }
    this.options.onSound?.(zombie.type.sounds.hurt, copy(zombie.body.pos), zombie);
    const healthAfter = Math.max(0, healthBefore - meleeDamageForContact(zombie, region, weapon, damageType));
    zombie.regions[region] = healthAfter;
    if (healthAfter < healthBefore) {
      zombie.hitFlinchTime = 0;
    }
    const killed =
      healthAfter === 0 &&
      (region === 'core.trunk' || (zombie.type.model !== 'amalgam' && zombieRegionClass(region) === 'head'));
    const incapacitated = this.applyMeleeEffects({ id, zombie, region, healthAfter, killed, hit });
    const newParts = zombie.severed.filter((candidate) => !severedBefore.has(candidate));
    const part = newParts.includes('head') ? 'head' : newParts[0];
    const outcome = meleeOutcome(killed, incapacitated, part);
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
  }

  private applyMeleeEffects({ id, zombie, region, healthAfter, killed, hit }: MeleeEffectsContext): boolean {
    if (zombie.type.model === 'amalgam') {
      const member = AMALGAM_MEMBER_REGION.exec(region)?.[1];
      if (member && healthAfter === 0) {
        this.sever(id, zombie, member, hit);
      }
    } else {
      if (healthAfter === 0 && region in ARM_REGION_PART) {
        this.sever(id, zombie, ARM_REGION_PART[region as ArmRegion], hit);
      }
      this.rollDismember(id, zombie, killed, hit);
    }
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
    } else if (zombie.type.model !== 'amalgam' && region !== 'head' && region !== 'torso' && healthAfter === 0) {
      this.options.onSevered?.(zombie, region as Exclude<ZombieRegion, 'head'>);
    }
    return incapacitated;
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
      const available = availableArmParts(zombie.severed);
      if (available.length > 0) {
        const part = available[zombie.dismemberRng.int(0, available.length - 1)]!;
        this.sever(id, zombie, part, hit);
      }
    }
    if (killed && !zombie.severed.includes('head') && zombie.dismemberRng.chance(dismember.headOnKillChance)) {
      this.sever(id, zombie, 'head', hit);
    }
  }
}
