import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { type AcidGlobState, advanceAcidGlob } from './acidGlob.ts';
import { type AcidPuddleState, feetInAcidPuddle } from './acidPuddle.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';
import {
  type ActorTickScratch,
  angleOf,
  approach,
  approachAngle,
  clearLine,
  createActorTickScratch,
  headingAt,
  horizontalDistance,
  inRange,
  pickByWeight,
  pushTurn,
  steer,
  stepChaseMotion,
  sub,
  turnToward,
  unit,
  withinAttackReach,
  wrapAngle,
} from './actorMotion.ts';
import {
  actorCrawls,
  actorHitFlinchDuration,
  actorPoseInputFor,
  advanceStanceWeight,
  posedMouth,
  targetStanceWeight,
} from './actorPose.ts';
import {
  type ActorHitRegion,
  type ActorRegions,
  type HumanoidHitRegion,
  type PosedBoneBox,
  posedFusedMassRegionBoxes,
  posedHumanoidRegionBoxes,
  posedRegionHit,
  rayBoxEntry,
} from './actorRegions.ts';
import {
  type Actor,
  type ActorState,
  type ActorTier,
  type AgentMode,
  activeFusedMassMembers,
  actorAttackReachMetres,
  actorBodyDimensions,
  copy,
  PLAYER_ARM_REACH_M,
  projectSnapshot,
  requiredFigureSeeds,
  snapshotActor,
  validActorEventState,
  validCarvedCells,
  validHitFlinchTime,
  validHordeMemberState,
  validObstacleWanderState,
  validRngState,
  validSpitTimers,
  validStaggerTime,
  validStanceWeight,
  validStepOffset,
  validVec3State,
} from './actorState.ts';
import type { BodyRegion, DamageKind } from './body.ts';
import type { MeleeBlocker } from './collision.ts';
import type { ActorDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ExposureContact } from './damageExposure.ts';
import type { DayPhase, DayPhaseState } from './dayPhase.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { advanceActorFootsteps, initialActorFootstepClock } from './footsteps.ts';
import { carveAround, centralCell, fleshHit, type MissingFlesh, missingFlesh } from './fusedMassCarving.ts';
import { FUSED_MASS_FIGURE_SEED, fusedMassCollisionEnvelope, fusedMassFigureForType } from './fusedMassFigure.ts';
import { FusedMassShape } from './fusedMassShape.ts';
import { HUMANOID_REGION_NAMES } from './humanoidRegionNames.ts';
import { lightSenseRangeScale } from './lights.ts';
import type { MeleeMotion } from './meleeMotion.ts';
import { modified } from './modifiers.ts';
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
import { updateStepOffset } from './stepOffset.ts';

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
export const BACKGROUND_ACTOR_RATE = 2;
export const BACKGROUND_ACTOR_SLICE_COUNT = 30;
export const BACKGROUND_ACTOR_SLICE_RATE = BACKGROUND_ACTOR_RATE * BACKGROUND_ACTOR_SLICE_COUNT;

import { blastShare, bodyCentre, type ExplosiveSpec, inSight } from './explosive.ts';
import type { PelletShot } from './pellets.ts';

/** A shot's or a blast's hit, dealt through the melee hit path without a swing to recover from. */
const projectileWeapon = (damage: number, reach: number, impulse: number, type: DamageKind): HitWeapon => ({
  damage,
  type,
  reach,
  cooldown: 0,
  impulse,
});

const actorRegionClass = (region: ActorHitRegion): string =>
  region === 'core.trunk' ? 'torso' : (region.split('.').at(-1) ?? region);

export const lethalRegion = (type: ActorDef, region: ActorHitRegion): boolean =>
  region === 'core.trunk' || (type.model !== 'fused-mass' && actorRegionClass(region) === 'head');

const maxActorRegionHealth = (type: ActorDef, region: ActorHitRegion): number | undefined => {
  if (type.model === 'fused-mass') {
    return type.regions[region === 'core.trunk' ? region : `member.${actorRegionClass(region)}`];
  }
  return type.regions[region];
};

const actorRegionsFor = (type: ActorDef, seed: number): ActorRegions => {
  if (type.model !== 'fused-mass') {
    return Object.fromEntries(HUMANOID_REGION_NAMES.map((region) => [region, type.regions[region]!])) as ActorRegions;
  }
  const figure = fusedMassFigureForType(type, seed);
  return Object.fromEntries(
    figure.manifest.regions.map((region) => {
      const health = maxActorRegionHealth(type, region.id as ActorHitRegion);
      if (health === undefined) {
        throw new Error(`Zombie type ${type.id} has no health for amalgam region ${region.id}`);
      }
      return [region.id, health];
    }),
  ) as ActorRegions;
};

type MeleeDamageType = DamageKind;
type ActorMove = ActorDef['attack']['moves'][number];
type ActorHitRegionChoice = ActorMove['hitRegions'][number];

/** The move of a landed hit, selected by its content weight. */
export const pickActorMove = <T extends { weight: number }>(moves: readonly T[], roll: number): T =>
  pickByWeight(moves, roll);

/** The body region a landed move strikes, selected by its content weight. */
export const pickActorHitRegion = (choices: readonly ActorHitRegionChoice[], roll: number): BodyRegion =>
  pickByWeight(choices, roll).region;

export interface MeleeWeapon extends HitWeapon {
  readonly contactFraction: number;
  readonly windupCapSimSeconds: number;
  readonly stamina: number;
  readonly motion: MeleeMotion;
  readonly charge?: MeleeCharge | undefined;
}

interface HitWeapon {
  readonly damage: number;
  readonly reach: number;
  readonly cooldown: number;
  readonly impulse: number;
  readonly damageVariance?: number | undefined;
  readonly headDamageMultiplier?: number | undefined;
  readonly limbDamageMultiplier?: number | undefined;
  readonly speedMultiplier?: number | undefined;
  readonly swingSound?: SoundId | undefined;
  readonly hitSound?: SoundId | undefined;
  readonly hitLayerSound?: SoundId | undefined;
  readonly type: MeleeDamageType;
}

export interface ActorAim {
  readonly id: EntityId;
  readonly region: ActorHitRegion;
  readonly distanceMetres: number;
  readonly reachMetres: number;
  readonly inReach: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly boxes: readonly PosedBoneBox[];
  /** The box the ray struck: entered first, or for an amalgam, the one whose flesh it met. */
  readonly hitBox: PosedBoneBox;
  /** The amalgam flesh cell the ray struck (core/fusedMassCarving.ts, `fleshHit`). */
  readonly cell?: number | undefined;
}

/** Where one hit struck an amalgam's flesh, before it is carved. */
interface FusedMassStrike {
  readonly cell: number;
  readonly damage: number;
  readonly hit: HitImpulse;
}

/** Where a hit struck a zombie's flesh, for its caller to carve, when the zombie carves. */
const strikeOf = (
  actor: Actor,
  cell: number | undefined,
  damage: number,
  hit: HitImpulse,
): FusedMassStrike | undefined => (cell === undefined || !actor.type.carving ? undefined : { cell, damage, hit });

interface MeleeHitContext {
  readonly id: EntityId;
  readonly actor: Actor;
  readonly region: ActorHitRegion;
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
  readonly actor: Actor;
  readonly region: ActorHitRegion;
  readonly healthAfter: number;
  readonly killed: boolean;
  readonly hit: HitImpulse;
}

const meleeDamageForContact = (
  actor: Actor,
  region: ActorHitRegion,
  weapon: HitWeapon,
  damageType: MeleeDamageType,
): number => {
  const spread = weapon.damageVariance;
  const rolled =
    spread === undefined ? weapon.damage : weapon.damage * actor.dismemberRng.range(1 - spread, 1 + spread);
  const regionClass = actorRegionClass(region) as BodyRegion;
  let multiplier = 1;
  if (regionClass === 'head') {
    multiplier = weapon.headDamageMultiplier ?? 1;
  } else if (regionClass !== 'torso') {
    multiplier = weapon.limbDamageMultiplier ?? 1;
  }
  return damageToActor(actor.type, rolled * multiplier, damageType, regionClass);
};

export const damageToActor = (
  type: Pick<ActorDef, 'damageResistance'>,
  amount: number,
  kind: DamageKind,
  region: BodyRegion,
): number => amount * (1 - (type.damageResistance?.[kind]?.[region] ?? 0));

export interface MeleeResult {
  readonly id?: EntityId | undefined;
  readonly region?: ActorHitRegion | undefined;
  readonly damage: number;
  readonly healthBefore?: number | undefined;
  readonly healthAfter?: number | undefined;
  readonly outcome: 'nothing' | 'severed' | 'incapacitated' | 'killed' | 'decapitated';
  readonly part?: string | undefined;
}

/** A shot's outcome: how many pellets struck a body, and per direction the distance in blocks at which a body
 * stopped that pellet, undefined when it struck none. The session clips its shot trace there (`DESIGN.md`,
 * "Shot impacts"). */
export interface PelletHits {
  readonly hits: number;
  readonly stops: readonly (number | undefined)[];
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
const ACTOR_FOOTSTEP_VOICE_CAP = 3;

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

const validHordeSnapshotState = (
  horde: HordeState,
  hasHorde: boolean,
  resolveType: (id: string) => ActorDef | undefined,
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

export interface ActorSystemState {
  nextEntityId: number;
  nextPuddleId: number;
  actors: { id: number; actor: ActorState }[];
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
  lightSources?: readonly SensedLightSource[] | undefined;
  vocalNoise?: VocalNoise | undefined;
}

interface SensedLightSource {
  pos: Vec3;
  seenFrom: number;
  heightMetres: number;
  /** Direct sunlight at the source; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  /** Player-carried light uses the darkness gate; independent sources use lure tuning. */
  carried: boolean;
}

export interface ActorSystemOptions {
  activeActorRadiusMetres: number;
  store?: EntityStore<Actor>;
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
  tuning: SenseDef;
  player: () => PlayerSense;
  dayPhase: () => DayPhaseState;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  hurtPlayer: (
    amount: number,
    hitRegions: readonly ActorHitRegionChoice[],
    attacker: EntityId,
    kind: DamageKind,
  ) => void;
  /** The id is what a renderer keys its corpse on; the zombie is already out of the store. */
  onDeath?: (id: EntityId, actor: Actor) => void;
  /** Called once when torso health reaches zero while the head remains intact. */
  onIncapacitated?: (id: EntityId, actor: Actor) => void;
  /** A whole region came off, and the game leaves it behind as an item: a limb whose health ran out, or
   * each arm and the head of a dismembered downed body (see finishDowned). */
  onSevered?: (actor: Actor, region: HumanoidHitRegion) => void;
  /** Sound-source position is in block coordinates; body is present when the shambler made the sound or was hit.
   * The player's own swing and hit set `playerMelee`, since content picks their events. */
  onSound?: (event: SoundId, position: Vec3, body?: Actor, playerMelee?: boolean) => void;
  /** A spit left the mouth. No damage is applied here; the owner of the in-flight glob takes it from this. */
  onAcidSpit?: (release: AcidSpitRelease) => void;
  onAcidPlayerHit?: (hit: ActorPlayerHit) => void;
  onPlayerExposure?: (contact: ExposureContact) => void;
  onPlayerLeaveExposure?: (source: string) => void;
  onAcidImpact?: (position: Vec3, type: ActorDef) => void;
  onAcidGroundImpact?: (impact: AcidGroundImpact) => void;
  /** Called for actual ground-travel footfalls of the nearest three moving shamblers. */
  onFootstep?: (position: Vec3, id: EntityId, mode: AgentMode, body: Actor) => void;
  /** Presentation only: a hit that did damage, melee or pellet, after its damage is applied. Gore draws from
   * it; the system reads nothing back. */
  onWound?: (id: EntityId, actor: Actor, hit: HitImpulse, damage: number) => void;
  /** Called once for every part severed (src/core/actorSystem.ts's swing — the melee hit path), *after*
   * `actor.severed` already includes `part`, so a renderer reading actor.severed at this point sees the
   * new cut too. Fires before onDeath on a killing blow that also severs the head. */
  onSever?: (id: EntityId, actor: Actor, part: string, hit: HitImpulse) => void;
  /** Called when a hit knocks flesh out of an amalgam, *after* `actor.carved` includes `cells`. `hit` is
   * the strike the hole centres on. */
  onCarve?: (id: EntityId, actor: Actor, cells: readonly number[], hit: HitImpulse) => void;
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

const FUSED_MASS_MEMBER_REGION = /^(member\.\d+)\./;

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
const posedRegionsForActor = ({
  id,
  actor,
  blockSize,
  poseCache,
}: {
  id: EntityId;
  actor: Actor;
  blockSize: number;
  poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
}): Readonly<Record<string, readonly PosedBoneBox[]>> => {
  const cached = poseCache?.get(id);
  if (cached) {
    return cached;
  }
  const poseInput = actorPoseInputFor(actor, id, blockSize);
  const posed =
    actor.type.model === 'fused-mass' ? posedFusedMassRegionBoxes(poseInput) : posedHumanoidRegionBoxes(poseInput);
  poseCache?.set(id, posed);
  return posed;
};
const rayMayHitActor = (actor: Actor, origin: Vec3, direction: Vec3, blockSize: number): boolean => {
  const centerY = actor.body.pos[1] + actor.body.height * 0.5;
  const nearestT = Math.max(
    0,
    (actor.body.pos[0] - origin[0]) * direction[0] +
      (centerY - origin[1]) * direction[1] +
      (actor.body.pos[2] - origin[2]) * direction[2],
  );
  const perpendicular =
    Math.hypot(
      origin[0] + direction[0] * nearestT - actor.body.pos[0],
      origin[1] + direction[1] * nearestT - centerY,
      origin[2] + direction[2] * nearestT - actor.body.pos[2],
    ) * blockSize;
  return (
    perpendicular <=
    Math.max(1, Math.hypot(actor.body.halfWidth, actor.body.halfDepth ?? actor.body.halfWidth) * blockSize)
  );
};
const isActiveHitRegion = (actor: Actor, region: ActorHitRegion): boolean => {
  const memberPart = actor.type.model === 'fused-mass' ? FUSED_MASS_MEMBER_REGION.exec(region)?.[1] : undefined;
  return actor.regions[region]! > 0 && !(memberPart !== undefined && actor.severed.includes(memberPart));
};
/** A body's regions with the one whose loss kills last, so a blast severs limbs before it kills. */
const blastOrder = (actor: Actor): ActorHitRegion[] => {
  const regions = Object.keys(actor.regions) as ActorHitRegion[];
  return [
    ...regions.filter((region) => !lethalRegion(actor.type, region)),
    ...regions.filter((region) => lethalRegion(actor.type, region)),
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
/** Where a spit leaves a zombie: its posed mouth, held at the end of the wind-up, so the line follows the
 * drawn-back head and its gaze. */
const spitOrigin = (actor: Actor, id: EntityId, blockSize: number): Vec3 =>
  posedMouth({ ...actorPoseInputFor(actor, id, blockSize), spitProgress: 1 });

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
  moves: NonNullable<ActorDef['acidSpit']>['moves'];
}

export interface ActorPlayerHit {
  damage: number;
  kind: DamageKind;
  hitRegions: readonly ActorHitRegionChoice[];
  regionRoll: number;
  cause: string;
}

export interface AcidGroundImpact {
  position: Vec3;
  source: EntityId;
  type: string;
  puddle: NonNullable<ActorDef['acidSpit']>['puddle'];
}

type GlobContact =
  | { kind: 'solid'; distance: number; normal: Vec3 }
  | { kind: 'player'; distance: number }
  | { kind: 'actor'; distance: number; hit: RegionHit };

/** A spitter that sees the player inside its range band stands and faces; outside the band it closes in. */
const holdSpitGround = (scratch: ActorTickScratch, toward: Vec3): void => {
  const { actor, type, sees, metresToTarget, dt } = scratch;
  const band = type.acidSpit?.rangeBand;
  if (band && actor.mode === 'chase' && sees && metresToTarget >= band.nearMetres && metresToTarget <= band.farMetres) {
    scratch.moving = false;
    steer(actor, toward, (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }
};

// ---- dismemberment: which part a hit can sever, and the gameplay effect of already-severed parts ----
// The body's bone dispositions say what each hit region may lose, so no skeleton's bone names are listed
// here; see packages/mobgen/src/mob/humanoidFigure.ts, `HumanoidFigure`. The random roll picks among arm
// parts; a destroyed region cuts at its top part; the head has its own headOnKillChance roll.

const cutsFor = (actor: Actor) => {
  const figure = templateFigure(bodyPlanModel(figureVariantOf(actor.type)), actor.figureSeed);
  return { parts: figure.severableParts, bones: figure.realized.body.bones };
};

/** The part a destroyed region cuts at, parents first, so the whole region goes; undefined where it can't be cut. */
const regionCut = (actor: Actor, region: HumanoidHitRegion): string | undefined => cutsFor(actor).parts[region][0];

/** Arm parts still worth severing: neither severed nor below a severed part. Deepest first and left before
 * right, so the dismember roll draws the same parts in the same order on every humanoid-like arm. */
const availableArmParts = (actor: Actor): string[] => {
  const { parts, bones } = cutsFor(actor);
  const hidden = severedBoneSet(bones, actor.severed);
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
const canStillAttack = (actor: Actor): boolean => {
  if (actor.severed.length === 0) {
    return true;
  }
  const { parts, bones } = cutsFor(actor);
  const hidden = severedBoneSet(bones, actor.severed);
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

const meleeHitSounds = (weapon: HitWeapon): SoundId[] =>
  [weapon.hitSound, weapon.hitLayerSound].filter((sound): sound is SoundId => sound !== undefined);

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
  def: ActorDef;
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
  def: ActorDef;
  from: Vec3;
  player: PlayerSense;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
  tuning: SenseDef;
}
export interface HeardNoise {
  tier: HearingTier;
  target: Vec3;
}

const hearingRange = (actor: ActorDef, movement: PlayerMovement): number => {
  if (movement === 'sprinting') {
    return actor.hearingRange.sprint * actor.hearing;
  }
  if (movement === 'jogging') {
    return actor.hearingRange.jog * actor.hearing;
  }
  if (movement === 'walking') {
    return actor.hearingRange.walk * actor.hearing;
  }
  return 0;
};

const hearingTier = ({
  def: actor,
  from,
  player,
  blockSize,
  isSolid,
  tuning,
}: Omit<HearingInput, 'rng'>): HearingTier | undefined => {
  const range =
    hearingRange(actor, player.movement) * (loweredStanceTuning(tuning, player.stance)?.hearingRangeScale ?? 1);
  if (range <= 0) {
    return undefined;
  }
  const distance = Math.hypot(...sub(player.pos, from)) * blockSize;
  if (distance > range * actor.hearingModel.farMultiplier) {
    return undefined;
  }
  const earOffset = actor.earHeightMetres / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [player.pos[0], player.pos[1] + earOffset, player.pos[2]];
  const wallScale = soundOcclusion({ listener: origin, source, isSolid, globalWall: tuning.wall }).occluded
    ? tuning.wall.hearingRangeScale
    : 1;
  const effectiveRange = range * wallScale;
  if (distance <= effectiveRange) {
    return 'near';
  }
  if (distance <= effectiveRange * actor.hearingModel.farMultiplier) {
    return 'far';
  }
  return undefined;
};

const farBearingTarget = ({
  def: actor,
  from,
  source,
  blockSize,
  rng,
}: {
  def: ActorDef;
  from: Vec3;
  source: Vec3;
  blockSize: number;
  rng: Rng;
}): Vec3 => {
  const angle = Math.atan2(source[0] - from[0], source[2] - from[2]);
  const error = rng.range(-actor.hearingModel.bearingErrorRadians, actor.hearingModel.bearingErrorRadians);
  const bearing = headingAt(angle + error);
  const distance = actor.hearingModel.investigationDistanceMetres / blockSize;
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
  def: ActorDef;
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
  def: actor,
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
  if (distance > noise.radiusMetres * actor.hearing * actor.hearingModel.farMultiplier) {
    return undefined;
  }
  const earOffset = actor.earHeightMetres / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [noise.pos[0], noise.pos[1] + earOffset, noise.pos[2]];
  const wallScale = soundOcclusion({ listener: origin, source, isSolid, globalWall: tuning.wall }).occluded
    ? tuning.wall.hearingRangeScale
    : 1;
  const hearingRadius = noise.radiusMetres * actor.hearing * wallScale;
  if (distance <= hearingRadius) {
    return { tier: 'near', target: copy(noise.pos) };
  }
  if (distance <= hearingRadius * actor.hearingModel.farMultiplier) {
    return {
      tier: 'far',
      target: farBearingTarget({ def: actor, from, source: noise.pos, blockSize, rng }),
    };
  }
  return undefined;
};

const seesPlayer = ({
  def: actor,
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
  const inCone = dot >= Math.cos((actor.sightCone * Math.PI) / 180);
  if (!inCone || metres <= 0) {
    return false;
  }
  let sightRange = actor.nightSight + (actor.sight - actor.nightSight) * sightBlend;
  const playerSunlit = player.sunlit ?? isSunExposedAt?.(player.pos) ?? dayPhase === 'day';
  const playerLightScale = lightSenseRangeScale('carried', playerSunlit, tuning.light);
  const lightSpotScale = actor.lightSightScale ?? 1;
  const maximumRange = Math.max(sightRange, player.lit ? player.lightSeenFrom * playerLightScale * lightSpotScale : 0);
  if (metres > maximumRange) {
    return false;
  }
  const rayOrigin: Vec3 = [from[0], from[1] + actor.eyeHeightMetres / blockSize, from[2]];
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
  def: actor,
  from,
  look,
  source,
  dayPhase,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  def: ActorDef;
  from: Vec3;
  look: Vec3;
  source: SensedLightSource;
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
    distance > source.seenFrom * lightSenseRangeScale(exposure, sunlit, tuning.light) * (actor.lightSightScale ?? 1)
  ) {
    return undefined;
  }
  const direction = unit(delta);
  const dot = Math.max(-1, Math.min(1, look[0] * direction[0] + look[2] * direction[2]));
  if (dot < Math.cos((actor.sightCone * Math.PI) / 180)) {
    return undefined;
  }
  const origin: Vec3 = [from[0], from[1] + actor.eyeHeightMetres / blockSize, from[2]];
  const target: Vec3 = [source.pos[0], source.pos[1] + source.heightMetres / blockSize, source.pos[2]];
  const ray = sub(target, origin);
  return raycast(origin, unit(ray), Math.hypot(...ray), isOpaque) === undefined ? distance : undefined;
};

const visibleLightTarget = ({
  def: actor,
  from,
  facing,
  player,
  dayPhase,
  blockSize,
  isOpaque,
  isSunExposedAt,
  tuning,
}: {
  def: ActorDef;
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
  let nearest: SensedLightSource | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const source of player.lightSources ?? []) {
    const distance = canSeeLight({
      def: actor,
      from,
      look,
      source,
      dayPhase,
      blockSize,
      isOpaque,
      isSunExposedAt,
      tuning,
    });
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

interface HordeSnapshotInput {
  readonly horde: Omit<HordeState, 'rng'>;
  readonly rng: Rng;
}

type HordeSnapshotProjectors = {
  [K in HordeSnapshotField]-?: (input: HordeSnapshotInput) => HordeSnapshot[K];
} & Record<Exclude<keyof HordeState, HordeSnapshotField>, never>;

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

const snapshotHorde = (horde: Omit<HordeState, 'rng'>, rng: Rng): HordeSnapshot =>
  projectSnapshot({ horde, rng }, hordeSnapshotProjectors) as HordeSnapshot;

/** The nearest region a ray strikes, and for an amalgam the flesh cell. */
interface RegionHit {
  readonly id: EntityId;
  readonly actor: Actor;
  readonly region: ActorHitRegion;
  /** In blocks along the ray. */
  readonly distance: number;
  readonly boxes: readonly PosedBoneBox[];
  readonly box: PosedBoneBox;
  readonly cell: number | undefined;
}

/** An amalgam body's exact shape, and the last facing it turned to clear of terrain. */
interface FusedMassCollider {
  readonly actor: Actor;
  readonly shape: FusedMassShape;
  facing: Vec3;
  /** Where it last came to rest on the ground, so a step that could change nothing is skipped. */
  rest?: { readonly pos: Vec3; readonly facing: Vec3; readonly version: number } | undefined;
}

export class ActorSystem {
  readonly store: EntityStore<Actor>;
  private readonly options: ActorSystemOptions;
  private globs: { state: AcidGlobState; type: ActorDef }[] = [];
  private puddles: { state: AcidPuddleState; type: ActorDef }[] = [];
  private nextPuddleId = 0;

  get acidPuddles(): readonly Readonly<AcidPuddleState>[] {
    return this.puddles.map(({ state }) => state);
  }

  get acidGlobs(): readonly Readonly<AcidGlobState>[] {
    return this.globs.map(({ state }) => state);
  }
  private readonly tickScratch = createActorTickScratch();
  private readonly chainStimuli: { caller: Actor; origin: Vec3; target: Vec3 }[] = [];
  private readonly hordes = new Map<string, { state: Omit<HordeState, 'rng'>; rng: Rng }>();
  private frozen = false;
  private readonly solidBricks: SolidBricks;
  /** Per body: its amalgam's shape and the last facing it turned to without meeting terrain; null otherwise. */
  private readonly shapes = new WeakMap<Body, FusedMassCollider | null>();
  private readonly missing = new WeakMap<
    Actor,
    { carved: readonly number[]; severed: number; missing: MissingFlesh }
  >();
  private idleSoundGrid = new Map<string, Actor[]>();
  private idleSoundGridCellBlocks = 1;

  constructor(options: ActorSystemOptions) {
    this.options = options;
    this.store = options.store ?? new MapEntityStore<Actor>();
    this.solidBricks = options.solidBricks ?? testedBricks(options.isSolid);
  }

  /** The amalgam's flesh as its body's shape, turned to its facing; every other body moves as its box. */
  readonly shapeOf: ShapeOf = (body) => this.colliderOf(body)?.shape;

  private colliderOf(body: Body): FusedMassCollider | undefined {
    let collider = this.shapes.get(body);
    if (collider === undefined) {
      const actor = [...this.store.entries()].find(([, candidate]) => candidate.body === body)?.[1];
      collider =
        actor?.type.model === 'fused-mass'
          ? {
              actor,
              shape: new FusedMassShape(
                fusedMassFigureForType(actor.type, actor.figureSeed),
                this.options.blockSize,
                this.solidBricks,
              ),
              facing: copy(actor.facing),
            }
          : null;
      this.shapes.set(body, collider);
    }
    if (!collider) {
      return undefined;
    }
    const { actor, shape } = collider;
    shape.keep(actor.carved, actor.severed.length, () => this.missingFor(actor));
    shape.face(actor.facing);
    return collider;
  }

  /** The flesh an amalgam has lost, rebuilt only when its holes or severed members change. */
  private missingFor(actor: Actor): MissingFlesh {
    const cached = this.missing.get(actor);
    if (cached && cached.carved === actor.carved && cached.severed === actor.severed.length) {
      return cached.missing;
    }
    const missing = missingFlesh(fusedMassFigureForType(actor.type, actor.figureSeed), actor);
    this.missing.set(actor, { carved: actor.carved, severed: actor.severed.length, missing });
    return missing;
  }

  /**
   * Turns an amalgam clear of terrain. A turn that swings its flesh into terrain shoves the body off it by the
   * shortest push that frees the turned flesh, as a body against a wall pivots off it to turn, and that tick
   * it doesn't also move back into what it was pushed off. When no push as far as the turn moved its flesh
   * frees it, it keeps the last facing that was clear. If both overlap (it started in terrain), the turn stands.
   */
  private settleTurn(actor: Actor): void {
    const collider = this.colliderOf(actor.body);
    if (!collider) {
      return;
    }
    const { facing, shape } = collider;
    if (actor.facing[0] === facing[0] && actor.facing[1] === facing[1] && actor.facing[2] === facing[2]) {
      return;
    }
    const { pos } = actor.body;
    if (shape.overlapsTerrain(pos)) {
      shape.face(facing);
      const wasClear = !shape.overlapsTerrain(pos);
      shape.face(actor.facing);
      const turn = Math.abs(wrapAngle(angleOf(actor.facing) - angleOf(facing)));
      if (wasClear && !pushTurn(actor.body, shape, turn)) {
        shape.face(facing);
        actor.facing = copy(facing);
        return;
      }
    }
    collider.facing = copy(actor.facing);
  }
  /**
   * Whether an amalgam's step this tick could change nothing, so its shape tests are skipped: it rests on
   * the ground where it last came to rest, neither moving nor turning, and no solid block has changed.
   */
  private restsStill(actor: Actor): boolean {
    const rest = this.colliderOf(actor.body)?.rest;
    const { body, facing } = actor;
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

  private noteRest(actor: Actor): void {
    const collider = this.colliderOf(actor.body);
    if (collider) {
      collider.rest = actor.body.onGround
        ? { pos: copy(actor.body.pos), facing: copy(actor.facing), version: this.solidBricks.version }
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
      for (const [, actor] of this.store.entries()) {
        this.captureRenderPrevious(actor);
        if (!actor.incapacitated) {
          actor.attackWindup = 0;
          actor.spitWindup = 0;
        }
      }
    }
  }

  private captureRenderPrevious(actor: Actor, time?: number): void {
    actor.renderPrevious = {
      pos: copy(actor.body.pos),
      facing: copy(actor.facing),
      headYaw: actor.headYaw,
      gaitPhase: actor.gaitPhase,
      ...(time === undefined ? {} : { time }),
    };
  }

  snapshotState(): Readonly<ActorSystemState> {
    return freezeSnapshot({
      nextEntityId: this.store.nextId,
      nextPuddleId: this.nextPuddleId,
      actors: [...this.store.entries()].map(([id, actor]) => snapshotActor(id, actor)),
      hordes: [...this.hordes.values()].map(({ state: horde, rng }) => snapshotHorde(horde, rng)),
      acidGlobs: this.globs.map(({ state }) => ({ ...state, pos: [...state.pos], velocity: [...state.velocity] })),
      acidPuddles: this.puddles.map(({ state }) => ({ ...state, pos: [...state.pos] })),
    });
  }

  private restorePuddles(state: ActorSystemState, resolveType: (id: string) => ActorDef | undefined) {
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

  restoreState(state: ActorSystemState, resolveType: (id: string) => ActorDef | undefined): void {
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
    const entries = state.actors.map(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validate every persisted zombie invariant before mutating the entity store.
      ({ id, actor }) => {
        if (
          !Number.isSafeInteger(id) ||
          id < 1 ||
          !validRngState(actor.behaviorRng) ||
          !validRngState(actor.soundRng) ||
          !validRngState(actor.dismemberRng) ||
          !validRngState(actor.spitRng) ||
          !validSpitTimers(actor) ||
          !validStaggerTime(actor) ||
          !Number.isFinite(actor.idleSoundTimer) ||
          actor.idleSoundTimer < 0 ||
          !validActorEventState(actor) ||
          !validHordeMemberState(actor) ||
          !Number.isSafeInteger(actor.figureSeed) ||
          !validHitFlinchTime(actor.hitFlinchTime) ||
          !validStanceWeight(actor.stanceWeight) ||
          !validStepOffset(actor.stepOffset) ||
          !validObstacleWanderState(actor) ||
          typeof actor.incapacitated !== 'boolean'
        ) {
          throw new Error(`Invalid zombie state for entity ${id}`);
        }
        const type = resolveType(actor.type);
        if (!type) {
          throw new Error(`Missing zombie type ${actor.type}`);
        }
        if (type.model === 'fused-mass' && actor.figureSeed !== FUSED_MASS_FIGURE_SEED) {
          throw new Error(`Invalid amalgam figure seed for entity ${id}`);
        }
        if (type.model !== 'fused-mass' && !requiredFigureSeeds(type).includes(actor.figureSeed)) {
          throw new Error(`Invalid zombie state for entity ${id}`);
        }
        const expectedRegions = actorRegionsFor(type, actor.figureSeed);
        const expectedRegionIds = Object.keys(expectedRegions);
        if (
          !actor.regions ||
          Object.keys(actor.regions).length !== expectedRegionIds.length ||
          expectedRegionIds.some((region) => {
            const health = actor.regions[region];
            return !Number.isFinite(health) || health! < 0 || health! > expectedRegions[region]!;
          })
        ) {
          throw new Error(`Invalid zombie regions for entity ${id}`);
        }
        if (type.model === 'fused-mass') {
          const envelope = fusedMassCollisionEnvelope(
            fusedMassFigureForType(type, actor.figureSeed),
            this.options.blockSize,
          );
          if (
            actor.body.halfWidth !== envelope.halfWidth ||
            actor.body.halfDepth !== envelope.halfDepth ||
            actor.body.height !== envelope.height
          ) {
            throw new Error(`Invalid amalgam collision envelope for entity ${id}`);
          }
          const validParts = new Set(
            fusedMassFigureForType(type, actor.figureSeed)
              .manifest.parts.filter((part) => part.severable)
              .map((part) => part.id),
          );
          if (
            new Set(actor.severed).size !== actor.severed.length ||
            actor.severed.some((part) => !validParts.has(part))
          ) {
            throw new Error(`Invalid amalgam severed parts for entity ${id}`);
          }
        }
        if (!validCarvedCells(type, actor.figureSeed, actor.carved)) {
          throw new Error(`Invalid carved cells for entity ${id}`);
        }
        if (actor.spitWindup > 0 && type.acidSpit === undefined) {
          throw new Error(`Invalid acid spit state for entity ${id}`);
        }
        const { type: _type, behaviorRng, soundRng, dismemberRng, spitRng, lastVocalNoiseId, ...fields } = actor;
        const restored: Actor = {
          ...fields,
          type,
          modifiers: [],
          regions: { ...actor.regions },
          behaviorRng: new Rng(behaviorRng),
          soundRng: new Rng(soundRng),
          dismemberRng: new Rng(dismemberRng),
          spitRng: new Rng(spitRng),
          lastVocalNoiseId: lastVocalNoiseId ?? undefined,
          footstepClock: { ...actor.footstepClock },
          body: { ...actor.body, pos: [...actor.body.pos], vel: [...actor.body.vel] },
          facing: [...actor.facing],
          home: [...actor.home],
          ...(actor.searchAnchor === undefined ? {} : { searchAnchor: [...actor.searchAnchor] }),
          searchHeading: [...actor.searchHeading],
          strollHeading: [...actor.strollHeading],
          ...(actor.obstacleWanderHeading === undefined
            ? {}
            : { obstacleWanderHeading: [...actor.obstacleWanderHeading] as Vec3 }),
          ...(actor.hordeOffset === undefined ? {} : { hordeOffset: [...actor.hordeOffset] as Vec3 }),
          ...(actor.lastPerceived === undefined ? {} : { lastPerceived: [...actor.lastPerceived] }),
          tier: this.tierAt(actor.body.pos, this.options.player()),
          renderPrevious: {
            pos: [...actor.body.pos],
            facing: [...actor.facing],
            headYaw: actor.headYaw,
            gaitPhase: actor.gaitPhase,
          },
          severed: [...actor.severed],
          carved: [...actor.carved],
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
    for (const [, actor] of this.store.entries()) {
      if (actor.hordeId !== undefined) {
        const horde = this.hordes.get(actor.hordeId)?.state;
        if (!horde || horde.type !== actor.type.id) {
          throw new Error(`Missing or mismatched horde ${actor.hordeId} for zombie`);
        }
      }
    }
  }

  private tickLookAround(actor: Actor, dt: number): void {
    const { type, behaviorRng: rng } = actor;
    actor.lookTimer -= dt;
    if (actor.lookTimer <= 0) {
      actor.bodyLookTarget =
        angleOf(actor.facing) +
        rng.range(-type.wander.bodyLookArcDegrees, type.wander.bodyLookArcDegrees) * 0.5 * (Math.PI / 180);
      actor.headYawTarget =
        rng.range(-type.wander.headLookArcDegrees, type.wander.headLookArcDegrees) * 0.5 * (Math.PI / 180);
      actor.lookTimer = inRange(rng, type.wander.lookIntervalSimSeconds);
    }
    actor.facing = turnToward(
      actor.facing,
      headingAt(actor.bodyLookTarget),
      (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
    );
    actor.headYaw = approachAngle(
      actor.headYaw,
      actor.headYawTarget,
      (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180,
    );
  }

  private beginIdle(actor: Actor): void {
    actor.mode = 'idle';
    actor.investigationTier = undefined;
    actor.searchAnchor = undefined;
    actor.searchTimer = 0;
    actor.searchStrolling = false;
    actor.modeTimer = inRange(actor.behaviorRng, actor.type.wander.idleSimSeconds);
    actor.lookTimer = 0;
    actor.bodyLookTarget = angleOf(actor.facing);
    actor.headYawTarget = 0;
    actor.horizontalSpeed = 0;
    actor.body.vel[0] = 0;
    actor.body.vel[2] = 0;
  }

  private beginStroll(actor: Actor): void {
    const { type, body, home, behaviorRng } = actor;
    const duration = inRange(behaviorRng, type.wander.strollSimSeconds);
    let heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    if (actor.leanTarget) {
      const toward = unit(sub(actor.leanTarget, body.pos));
      const weight = type.hearingModel.refusalLean;
      heading = unit([
        heading[0] * (1 - weight) + toward[0] * weight,
        0,
        heading[2] * (1 - weight) + toward[2] * weight,
      ]);
      actor.leanTarget = undefined;
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
    actor.mode = 'stroll';
    actor.investigationTier = undefined;
    actor.searchAnchor = undefined;
    actor.searchTimer = 0;
    actor.searchStrolling = false;
    actor.modeTimer = duration;
    actor.strollHeading = heading;
    actor.bodyLookTarget = angleOf(heading);
    actor.headYawTarget = 0;
  }

  private beginSearch(actor: Actor): void {
    const { type, behaviorRng: rng } = actor;
    actor.mode = 'search';
    actor.investigationTier = undefined;
    actor.searchAnchor = copy(actor.lastPerceived ?? actor.body.pos);
    actor.searchTimer = inRange(rng, type.hearingModel.searchSimSeconds);
    actor.searchStrolling = false;
    actor.searchHeading = copy(actor.facing);
    actor.modeTimer = inRange(rng, type.wander.idleSimSeconds);
    actor.lookTimer = 0;
    actor.bodyLookTarget = angleOf(actor.facing);
    actor.headYawTarget = 0;
    actor.horizontalSpeed = 0;
    actor.body.vel[0] = 0;
    actor.body.vel[2] = 0;
  }

  private beginSearchStroll(actor: Actor): void {
    const { type, body, searchAnchor, behaviorRng: rng } = actor;
    if (!searchAnchor) {
      return;
    }
    const duration = Math.min(inRange(rng, type.hearingModel.searchStrollSimSeconds), actor.searchTimer);
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
    actor.searchStrolling = true;
    actor.searchHeading = heading;
    actor.modeTimer = duration;
    actor.bodyLookTarget = angleOf(heading);
    actor.headYawTarget = 0;
  }

  add(type: ActorDef, position: Vec3, facing: Vec3 = [0, 0, -1]): EntityId {
    const direction = unit(facing);
    const figureSeed =
      type.model === 'fused-mass'
        ? FUSED_MASS_FIGURE_SEED
        : requiredFigureSeeds(type)[
            Rng.stream(this.options.seed ?? 0, `actor-figure:${this.store.nextId}`).int(
              0,
              requiredFigureSeeds(type).length - 1,
            )
          ]!;
    const dimensions = actorBodyDimensions(type, this.options.blockSize);
    const actor: Actor = {
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
      behaviorRng: Rng.stream(this.options.seed ?? 0, `actor:${this.store.size + 1}`),
      soundRng: Rng.stream(this.options.seed ?? 0, `actor-sound:${this.store.size + 1}`),
      dismemberRng: Rng.stream(this.options.seed ?? 0, `actor-dismember:${this.store.size + 1}`),
      spitRng: Rng.stream(this.options.seed ?? 0, `actor-spit:${this.store.size + 1}`),
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
      regions: actorRegionsFor(type, figureSeed),
      figureSeed,
      incapacitated: false,
      attackWait: 0,
      attackWindup: 0,
      spitWindup: 0,
      staggerSimSeconds: 0,
      spitWait: 0,
      gaitPhase: 0,
      footstepClock: initialActorFootstepClock(type.stepLength),
      wanderClock: 0,
      stepOffset: 0,
      severed: [],
      carved: [],
    };
    const id = this.store.add(actor);
    // EntityStore ids are stable within the world's entity lifetime.
    actor.behaviorRng = Rng.stream(this.options.seed ?? 0, `actor:${id}`);
    actor.soundRng = Rng.stream(this.options.seed ?? 0, `actor-sound:${id}`);
    actor.dismemberRng = Rng.stream(this.options.seed ?? 0, `actor-dismember:${id}`);
    actor.spitRng = Rng.stream(this.options.seed ?? 0, `actor-spit:${id}`);
    actor.idleSoundTimer = inRange(actor.soundRng, actor.type.idleSound.intervalSimSeconds);
    this.beginIdle(actor);
    return id;
  }

  addHorde(id: string, type: ActorDef, center: Vec3, count: number): void {
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
  releaseHorde(id: string, type: ActorDef, { center, count, target }: { center: Vec3; count: number; target: Vec3 }) {
    this.addHorde(id, type, center, count);
    const horde = this.hordes.get(id)!.state;
    horde.home = copy(target);
    horde.target = copy(target);
    horde.mode = 'release';
  }

  private tickFrozen(dt: number, entries: readonly (readonly [EntityId, Actor])[] = [...this.store.entries()]): void {
    for (const [, actor] of entries) {
      this.captureRenderPrevious(actor);
      if (!actor.incapacitated) {
        continue;
      }
      this.tickIncapacitated(actor, dt);
    }
  }

  private tierAt(position: Vec3, player: PlayerSense): ActorTier {
    const loaded = this.options.isLoaded?.(position[0], position[2]) ?? true;
    if (!loaded) {
      return 'unloaded';
    }
    return horizontalDistance(position, player.pos) * this.options.blockSize <= this.options.activeActorRadiusMetres
      ? 'active'
      : 'background';
  }

  private classifyTiers(player: PlayerSense): readonly (readonly [EntityId, Actor])[] {
    const entries = [...this.store.entries()];
    for (const [, actor] of entries) {
      actor.tier = this.tierAt(actor.body.pos, player);
    }
    return entries;
  }

  private hordeCenter(id: string): Vec3 | undefined {
    const members = [...this.store.entries()].flatMap(([, actor]) => (actor.hordeId === id ? [actor] : []));
    if (members.length === 0) {
      return undefined;
    }
    return members.reduce<Vec3>(
      (sum, actor) => [
        sum[0] + actor.body.pos[0] / members.length,
        sum[1] + actor.body.pos[1] / members.length,
        sum[2] + actor.body.pos[2] / members.length,
      ],
      [0, 0, 0],
    );
  }

  private hordeTarget(actor: Actor): Vec3 | undefined {
    if (actor.hordeId === undefined || actor.hordeOffset === undefined) {
      return undefined;
    }
    const horde = this.hordes.get(actor.hordeId)?.state;
    return horde
      ? [
          horde.target[0] + actor.hordeOffset[0],
          horde.target[1] + actor.hordeOffset[1],
          horde.target[2] + actor.hordeOffset[2],
        ]
      : undefined;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep ordered noise, arrival, and night-roam transitions together as one horde state machine.
  private updateHordes(dt: number, time: number, player: PlayerSense, dayPhase: DayPhase): void {
    const { blockSize } = this.options;
    const isSolid = this.options.isSoundBlocking ?? this.options.isSolid;
    for (const { state: horde, rng } of this.hordes.values()) {
      const center = this.hordeCenter(horde.id);
      const member = [...this.store.entries()].find(([, actor]) => actor.hordeId === horde.id)?.[1];
      if (!(center && member)) {
        continue;
      }
      const noise = player.vocalNoise;
      if (noise && noise.id !== horde.lastNoiseId) {
        horde.lastNoiseId = noise.id;
        const heard = hearVocalNoise({
          def: member.type,
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
      ([id, actor]) => actor.tier === 'background' && id % sliceCount === sliceIndex,
    );
    this.indexIdleSoundDensity();
    for (const [id, actor] of entries) {
      this.captureRenderPrevious(actor, time);
      if (actor.incapacitated) {
        this.tickIncapacitated(actor, dt);
        continue;
      }
      scratch.id = id;
      scratch.actor = actor;
      scratch.pos = actor.body.pos;
      scratch.type = actor.type;
      scratch.rng = actor.behaviorRng;
      this.updateActorTimers();
      this.updatePerception();
      this.updateAttention();
      this.forgetIndividualStimulus(actor, time);
    }
    this.processChainStimuli(time);
    for (const [id, actor] of entries) {
      if (actor.incapacitated) {
        continue;
      }
      scratch.id = id;
      scratch.actor = actor;
      scratch.pos = actor.body.pos;
      scratch.type = actor.type;
      scratch.rng = actor.behaviorRng;
      let target = actor.mode === 'hesitate' ? undefined : (this.hordeTarget(actor) ?? actor.lastPerceived);
      scratch.sees = actor.mode === 'chase';
      if (scratch.sees) {
        target = player.pos;
      }
      let direction: Vec3;
      let speed: number;
      if (target) {
        const offset = sub(target, actor.body.pos);
        const distance = Math.hypot(offset[0], offset[2]) * blockSize;
        direction = distance > 0.5 ? unit([offset[0], 0, offset[2]]) : [0, 0, 0];
        speed =
          distance > 0.5
            ? Math.min(
                actor.type.speed.chaseMetresPerSimSecond,
                actor.type.speed.backgroundStepMetres / dt,
                distance / dt,
              )
            : 0;
        if (direction[0] !== 0 || direction[2] !== 0) {
          actor.facing = copy(direction);
        }
      } else {
        this.selectMovementIntent();
        const { direction: movementDirection, desiredSpeed } = scratch;
        direction = movementDirection;
        speed = desiredSpeed;
      }
      if (actorCrawls(actor)) {
        speed = Math.min(speed, actor.type.speed.crawlMetresPerSimSecond);
      }
      if (actor.staggerSimSeconds > 0 || this.options.restrained?.(id) === true) {
        speed = 0;
      }
      actor.horizontalSpeed = speed;
      actor.body.vel[0] = (direction[0] * speed) / blockSize;
      actor.body.vel[2] = (direction[2] * speed) / blockSize;
      const before = copy(actor.body.pos);
      this.settleTurn(actor);
      if (actor.body.onGround) {
        stepBodyHorizontal(actor.body, {
          dx: actor.body.vel[0] * dt,
          dz: actor.body.vel[2] * dt,
          isSolid,
          params: physics,
        });
      } else {
        stepBody(actor.body, dt, isSolid, physics);
      }
      const travelled = horizontalDistance(before, actor.body.pos) * blockSize;
      actor.gaitPhase += (travelled / actor.type.stepLength) * Math.PI;
      if (actor.mode === 'stroll' && actor.modeTimer <= 0 && actor.horizontalSpeed <= 0.01) {
        this.beginIdle(actor);
      }
    }
  }

  private tickIncapacitated(actor: Actor, dt: number): void {
    actor.horizontalSpeed = 0;
    actor.attackWait = 0;
    actor.attackWindup = 0;
    actor.spitWindup = 0;
    actor.body.vel[0] = 0;
    actor.body.vel[2] = 0;
    stepBody(actor.body, dt, this.options.isSolid, { ...this.options.physics, obstacles: [], shapeOf: this.shapeOf });
  }

  private updateActorTimers(): void {
    const { actor, dt } = this.tickScratch;
    if (actor.hitFlinchTime !== undefined) {
      const nextFlinchTime = actor.hitFlinchTime + dt;
      actor.hitFlinchTime =
        nextFlinchTime > actorHitFlinchDuration(actorCrawls(actor) ? 'legless-humanoid' : figureVariantOf(actor.type))
          ? undefined
          : nextFlinchTime;
    }
    actor.attackWait = Math.max(0, actor.attackWait - dt);
    actor.spitWait = Math.max(0, actor.spitWait - dt);
    actor.staggerSimSeconds = Math.max(0, actor.staggerSimSeconds - dt);
  }

  private updatePerception(): void {
    const scratch = this.tickScratch;
    const { actor, type, pos, player, dayState, blockSize, isOpaque, time, rng, perception } = scratch;
    const soundBlocking = this.options.isSoundBlocking ?? scratch.isSolid;
    perception.def = type;
    perception.from = pos;
    perception.facing = actor.facing;
    perception.player = player;
    perception.dayPhase = dayState.phase;
    perception.sightBlend = dayState.sightBlend;
    perception.blockSize = blockSize;
    perception.isSolid = isOpaque;
    perception.isSunExposedAt = this.options.isSunExposedAt;
    perception.tuning = this.options.tuning;
    scratch.sees = seesPlayer(perception);
    scratch.lightTarget = visibleLightTarget({
      def: type,
      from: pos,
      facing: actor.facing,
      player,
      dayPhase: dayState.phase,
      blockSize,
      isOpaque,
      isSunExposedAt: this.options.isSunExposedAt,
      tuning: this.options.tuning,
    });
    if (
      scratch.lightTarget &&
      actor.lastPerceived?.every((coordinate, axis) => coordinate === scratch.lightTarget![axis])
    ) {
      scratch.lightTarget = undefined;
    }
    if (scratch.sees && actor.obstacleWanderRemaining > 0) {
      actor.obstacleWanderRemaining = 0;
      actor.obstacleWanderHeading = undefined;
    }
    const hearing = scratch.hearingInput;
    hearing.def = type;
    hearing.from = pos;
    hearing.player = player;
    hearing.blockSize = blockSize;
    hearing.isSolid = soundBlocking;
    hearing.rng = rng;
    hearing.tuning = this.options.tuning;
    scratch.vocal = undefined;
    if (player.vocalNoise && actor.lastVocalNoiseId !== player.vocalNoise.id) {
      actor.lastVocalNoiseId = player.vocalNoise.id;
      scratch.vocal = hearVocalNoise({
        def: type,
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
    const { actor, time, sees, player, lightTarget, dt, vocal } = this.tickScratch;
    const loud = vocal && player.vocalNoise!.radiusMetres >= actor.type.hearingModel.loudNoiseRadiusMetres;
    if (sees || loud || lightTarget || actor.hordeId !== undefined) {
      return false;
    }
    actor.modeTimer = Math.max(0, actor.modeTimer - dt);
    if (actor.modeTimer > 0) {
      return true;
    }
    if (actor.hesitationFrom === 'stroll') {
      actor.mode = 'investigate';
      actor.stimulusAt = time;
    } else {
      actor.leanTarget = copy(actor.lastPerceived!);
      actor.refusedAt = time;
      actor.lastPerceived = undefined;
      actor.stimulusAt = undefined;
      this.beginIdle(actor);
    }
    actor.hesitationFrom = undefined;
    this.announcePursuit('hesitate');
    return true;
  }

  private updateAttention(): void {
    const { actor, time, sees, tier, player, lightTarget } = this.tickScratch;
    const previous = actor.mode;
    if (previous === 'hesitate' && this.tickHesitation()) {
      return;
    }
    this.resolveAttention();
    const suspicious =
      actor.refusedAt !== undefined && time - actor.refusedAt < actor.type.hearingModel.refusalSuspicionSimSeconds;
    if (
      (previous === 'idle' || previous === 'stroll') &&
      actor.mode === 'investigate' &&
      tier &&
      this.tickScratch.vocal &&
      !sees &&
      !lightTarget &&
      actor.hordeId === undefined &&
      !suspicious &&
      player.vocalNoise!.radiusMetres < actor.type.hearingModel.loudNoiseRadiusMetres
    ) {
      actor.hesitationFrom = previous;
      actor.mode = 'hesitate';
      actor.modeTimer = inRange(actor.behaviorRng, actor.type.hearingModel.hesitationSimSeconds);
    }
    if (actor.mode !== 'hesitate') {
      actor.hesitationFrom = undefined;
    }
    this.announcePursuit(previous);
  }

  private announcePursuit(previous: AgentMode): void {
    const { actor, time } = this.tickScratch;
    if (
      (actor.mode === 'chase' || actor.mode === 'investigate') &&
      previous !== 'chase' &&
      previous !== 'investigate'
    ) {
      actor.leanTarget = undefined;
      this.cryAlert(actor, time);
    }
  }

  private cryAlert(actor: Actor, time: number): void {
    if (actor.lastAlertAt !== undefined && time - actor.lastAlertAt < actor.type.hearingModel.alertCooldownSimSeconds) {
      return;
    }
    actor.lastAlertAt = time;
    this.options.onSound?.(actor.type.sounds.alert, copy(actor.body.pos), actor);
    this.chainStimuli.push({ caller: actor, origin: copy(actor.body.pos), target: copy(actor.lastPerceived!) });
  }

  private processChainStimuli(time: number): void {
    // Drain to closure before movement so entity iteration cannot delay a later caller's listeners.
    for (const stimulus of this.chainStimuli) {
      const { chainRadiusMetres, chainChance } = stimulus.caller.type.hearingModel;
      for (const [, actor] of this.store.entries()) {
        if (
          actor.incapacitated ||
          (actor.mode !== 'idle' && actor.mode !== 'stroll' && actor.mode !== 'hesitate') ||
          horizontalDistance(actor.body.pos, stimulus.origin) * this.options.blockSize > chainRadiusMetres ||
          actor.soundRng.next() >= chainChance
        ) {
          continue;
        }
        actor.mode = 'investigate';
        actor.hesitationFrom = undefined;
        actor.investigationTier = 'far';
        actor.searchAnchor = undefined;
        actor.searchTimer = 0;
        actor.searchStrolling = false;
        actor.leanTarget = undefined;
        actor.lastPerceived = copy(stimulus.target);
        actor.stimulusAt = time;
        this.cryAlert(actor, time);
      }
    }
    this.chainStimuli.length = 0;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Preserve precedence between sight, near/far noise, prior chase, and horde attention.
  private resolveAttention(): void {
    const scratch = this.tickScratch;
    const { actor, player, pos, tier, sees, vocal, blockSize, lightTarget } = scratch;
    if (sees) {
      actor.mode = 'chase';
      actor.investigationTier = undefined;
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = copy(player.pos);
    } else if (tier === 'near') {
      actor.mode = 'investigate';
      actor.investigationTier = 'near';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = copy(vocal?.tier === 'near' ? vocal.target : player.pos);
    } else if (lightTarget) {
      actor.mode = 'investigate';
      actor.investigationTier = 'near';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = copy(lightTarget);
    } else if (
      tier === 'far' &&
      (actor.mode === 'idle' || actor.mode === 'stroll' || actor.mode === 'search' || actor.mode === 'hesitate')
    ) {
      actor.mode = 'investigate';
      actor.investigationTier = 'far';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived =
        vocal?.tier === 'far'
          ? vocal.target
          : farBearingTarget({ def: actor.type, from: pos, source: player.pos, rng: scratch.rng, blockSize });
      const { terrainFloor } = this.options;
      const footprint = {
        halfWidth: actor.body.halfWidth,
        halfDepth: actor.body.halfDepth ?? actor.body.halfWidth,
      };
      if (terrainFloor && onTerrainFloor(pos, terrainFloor, footprint)) {
        actor.lastPerceived[1] = terrainStance(actor.lastPerceived[0], actor.lastPerceived[2], terrainFloor, footprint);
      }
    } else if (actor.mode === 'chase') {
      actor.mode = 'investigate';
      actor.investigationTier = 'near';
    }
    if (sees || tier || lightTarget) {
      actor.stimulusAt = scratch.time;
    }
    const groupTarget = sees || tier ? undefined : this.hordeTarget(actor);
    if (groupTarget) {
      actor.mode = 'investigate';
      actor.investigationTier = 'far';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = groupTarget;
    }
  }

  private forgetIndividualStimulus(actor: Actor, time: number): void {
    if (
      actor.hordeId !== undefined ||
      actor.mode !== 'investigate' ||
      actor.stimulusAt === undefined ||
      time - actor.stimulusAt < actor.type.stimulusMemorySimSeconds
    ) {
      return;
    }
    actor.stimulusAt = undefined;
    actor.lastPerceived = undefined;
    actor.investigationTier = undefined;
    actor.searchAnchor = undefined;
    actor.searchTimer = 0;
    actor.searchStrolling = false;
    actor.mode = 'return';
  }

  private checkInvestigationArrival(): void {
    const scratch = this.tickScratch;
    const { actor, pos } = scratch;
    if (actor.mode !== 'investigate') {
      return;
    }
    const target = actor.lastPerceived ?? actor.home;
    if (
      Math.hypot(...sub(target, pos)) * scratch.blockSize <= 1 &&
      sameInvestigationFloor(pos, target, this.options.terrainFloor, {
        halfWidth: actor.body.halfWidth,
        halfDepth: actor.body.halfDepth ?? actor.body.halfWidth,
      })
    ) {
      this.beginSearch(actor);
    }
  }

  private indexIdleSoundDensity(): void {
    let widestRadiusBlocks = 0;
    for (const [, actor] of this.store.entries()) {
      if (!actor.incapacitated) {
        widestRadiusBlocks = Math.max(
          widestRadiusBlocks,
          actor.type.idleSound.density.radiusMetres / this.options.blockSize,
        );
      }
    }
    this.idleSoundGridCellBlocks = Math.max(1, widestRadiusBlocks);
    this.idleSoundGrid = new Map();
    for (const [, actor] of this.store.entries()) {
      if (actor.incapacitated) {
        continue;
      }
      const key = this.idleSoundGridKey(actor.body.pos);
      const cell = this.idleSoundGrid.get(key);
      if (cell) {
        cell.push(actor);
      } else {
        this.idleSoundGrid.set(key, [actor]);
      }
    }
  }

  private idleSoundGridKey(position: Vec3): string {
    return `${Math.floor(position[0] / this.idleSoundGridCellBlocks)},${Math.floor(position[2] / this.idleSoundGridCellBlocks)}`;
  }

  private nextIdleSoundInterval(actor: Actor): number {
    const { intervalSimSeconds, density } = actor.type.idleSound;
    return (
      inRange(actor.soundRng, intervalSimSeconds) *
      (1 + (this.idleSoundDensity(actor) - 1) * density.penaltyPerNeighbour)
    );
  }

  private idleSoundDensity(actor: Actor): number {
    const radiusBlocks = actor.type.idleSound.density.radiusMetres / this.options.blockSize;
    const cellRadius = Math.ceil(radiusBlocks / this.idleSoundGridCellBlocks);
    const cellX = Math.floor(actor.body.pos[0] / this.idleSoundGridCellBlocks);
    const cellZ = Math.floor(actor.body.pos[2] / this.idleSoundGridCellBlocks);
    let density = 0;
    for (let x = cellX - cellRadius; x <= cellX + cellRadius; x++) {
      for (let z = cellZ - cellRadius; z <= cellZ + cellRadius; z++) {
        for (const nearby of this.idleSoundGrid.get(`${x},${z}`) ?? []) {
          if (horizontalDistance(actor.body.pos, nearby.body.pos) <= radiusBlocks) {
            density += 1;
          }
        }
      }
    }
    return density;
  }

  private updateIdleSound(): void {
    const scratch = this.tickScratch;
    const { actor, dt, pos } = scratch;
    if (actor.mode !== 'idle' && actor.mode !== 'stroll') {
      return;
    }
    actor.idleSoundTimer -= dt;
    if (actor.idleSoundTimer <= 0) {
      this.options.onSound?.(actor.type.sounds.idle, copy(pos), actor);
      actor.idleSoundTimer = this.nextIdleSoundInterval(actor);
    }
  }

  private selectMovementIntent(): void {
    const scratch = this.tickScratch;
    const { actor } = scratch;
    scratch.target = actor.home;
    scratch.direction = [0, 0, 0];
    scratch.aimDirection = undefined;
    scratch.desiredSpeed = 0;
    scratch.returnArrived = false;
    scratch.obstacleDirection = actor.obstacleWanderRemaining > 0 ? actor.obstacleWanderHeading : undefined;
    scratch.stroll = actor.mode === 'stroll';
    scratch.wanderingAtTickStart = actor.obstacleWanderRemaining > 0;
    this.updateIdleSound();
    switch (actor.mode) {
      case 'hesitate': {
        const bearing = angleOf(sub(actor.lastPerceived!, actor.body.pos));
        actor.headYawTarget = bearing - angleOf(actor.facing);
        actor.headYaw = approachAngle(
          actor.headYaw,
          actor.headYawTarget,
          (actor.type.wander.headTurnDegreesPerSimSecond * Math.PI * scratch.dt) / 180,
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
    const { actor, dt } = this.tickScratch;
    actor.modeTimer -= dt;
    this.tickLookAround(actor, dt);
    if (actor.modeTimer <= 0) {
      this.beginStroll(actor);
    }
  }

  private selectStrollIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt, obstacleDirection } = scratch;
    actor.modeTimer -= dt;
    scratch.direction = obstacleDirection ?? actor.strollHeading;
    scratch.aimDirection = scratch.direction;
    scratch.desiredSpeed = obstacleDirection || actor.modeTimer > 0 ? type.speed.wanderMetresPerSimSecond : 0;
    scratch.direction = steer(actor, scratch.direction, (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180);
    actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private selectSearchIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt, obstacleDirection, pos } = scratch;
    actor.searchTimer -= dt;
    if (actor.searchTimer <= 0) {
      actor.mode = 'return';
      actor.searchAnchor = undefined;
      actor.searchStrolling = false;
      scratch.target = actor.home;
      scratch.direction = obstacleDirection ?? unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
      scratch.aimDirection = scratch.direction;
      scratch.direction = steer(
        actor,
        scratch.direction,
        (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
      );
      scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
    } else if (actor.searchStrolling) {
      actor.modeTimer -= dt;
      if (actor.modeTimer <= 0) {
        actor.searchStrolling = false;
        actor.modeTimer = inRange(scratch.rng, type.wander.idleSimSeconds);
        this.tickLookAround(actor, dt);
      } else {
        scratch.direction = obstacleDirection ?? actor.searchHeading;
        scratch.aimDirection = scratch.direction;
        scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
        scratch.direction = steer(
          actor,
          scratch.direction,
          (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
        );
        actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
      }
    } else {
      actor.modeTimer -= dt;
      this.tickLookAround(actor, dt);
      if (actor.modeTimer <= 0) {
        this.beginSearchStroll(actor);
      }
    }
  }

  private selectTravelIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, player, blockSize, pos, obstacleDirection, dt } = scratch;
    if (actor.mode === 'chase') {
      scratch.target = player.pos;
    } else if (actor.mode === 'investigate') {
      scratch.target = actor.lastPerceived ?? actor.home;
    }
    scratch.metresToTarget = horizontalDistance(scratch.target, pos) * blockSize;
    scratch.returnArrived = actor.mode === 'return' && scratch.metresToTarget < 0.4;
    scratch.seeking = actor.mode === 'chase' || actor.mode === 'investigate';
    scratch.inReach = actor.mode === 'chase' && this.reachableActorMoves(actor, pos, scratch.target).length > 0;
    const toward = unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
    scratch.direction = obstacleDirection ?? toward;
    scratch.moving = scratch.seeking ? !scratch.inReach : scratch.returnArrived || scratch.metresToTarget > 0.25;
    holdSpitGround(scratch, toward);
    if (scratch.moving) {
      scratch.aimDirection = scratch.direction;
      if (scratch.seeking) {
        const motion = stepChaseMotion(actor, dt);
        scratch.direction = headingAt(angleOf(scratch.direction) + motion.sway);
        scratch.desiredSpeed = type.speed.chaseMetresPerSimSecond * motion.speedFactor;
      } else if (!scratch.returnArrived) {
        scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
      }
      const turnRadians = (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180;
      scratch.direction = steer(actor, scratch.direction, turnRadians, toward);
    } else {
      scratch.direction = [0, 0, 0];
    }
    actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private updateMovementSpeed(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt } = scratch;
    if (actorCrawls(actor)) {
      scratch.desiredSpeed = Math.min(scratch.desiredSpeed, type.speed.crawlMetresPerSimSecond);
      actor.horizontalSpeed = Math.min(actor.horizontalSpeed, type.speed.crawlMetresPerSimSecond);
    }
    if (
      (!actorCrawls(actor) && actor.regions.leftLeg! <= 0 && actor.regions.rightLeg! <= 0) ||
      actor.staggerSimSeconds > 0 ||
      this.options.restrained?.(scratch.id) === true
    ) {
      scratch.desiredSpeed = 0;
      scratch.direction = [0, 0, 0];
      scratch.aimDirection = undefined;
      actor.horizontalSpeed = 0;
    }
    const acceleration =
      actor.stumbleFactor < 1 && actor.horizontalSpeed > scratch.desiredSpeed
        ? type.chaseMotion.stumbleDecelerationMetresPerSimSecondSquared
        : type.wander.movementAccelerationMetresPerSimSecondSquared;
    actor.horizontalSpeed = approach(actor.horizontalSpeed, scratch.desiredSpeed, acceleration * dt);
    if (actor.mode !== 'search' || !actor.searchStrolling || !actor.searchAnchor) {
      return;
    }
    const radius = horizontalDistance(scratch.pos, actor.searchAnchor) * scratch.blockSize;
    const away = unit([scratch.pos[0] - actor.searchAnchor[0], 0, scratch.pos[2] - actor.searchAnchor[2]]);
    const outward = scratch.direction[0] * away[0] + scratch.direction[2] * away[2];
    if (outward > 0) {
      const remaining = Math.max(0, type.hearingModel.searchRadiusMetres - radius);
      actor.horizontalSpeed = Math.min(actor.horizontalSpeed, remaining / (dt * outward));
    }
  }

  private applyObstacleSlide(): void {
    const scratch = this.tickScratch;
    const { actor, aimDirection, wanderingAtTickStart } = scratch;
    if (!wanderingAtTickStart && actor.obstacleContact && actor.obstacleSlideSide !== 0 && aimDirection) {
      scratch.direction = headingAt(angleOf(aimDirection) + (actor.obstacleSlideSide * Math.PI) / 2);
    }
  }

  private stepActorBody(): void {
    const scratch = this.tickScratch;
    const { actor, direction, blockSize, dt, isSolid, player, aimDirection } = scratch;
    actor.body.vel[0] = (direction[0] * actor.horizontalSpeed) / blockSize;
    actor.body.vel[2] = (direction[2] * actor.horizontalSpeed) / blockSize;
    scratch.jumpAttempted =
      actor.type.canJumpObstacles &&
      !actorCrawls(actor) &&
      actor.horizontalSpeed > 0.01 &&
      actor.body.onGround &&
      canJumpObstacle({
        body: actor.body,
        direction,
        isSolid,
        physics: this.options.physics,
        jumpSpeed: actor.type.jumpMetresPerSimSecond,
        blockSize,
      });
    if (scratch.jumpAttempted) {
      actor.body.vel[1] = actor.type.jumpMetresPerSimSecond / blockSize;
    }
    scratch.beforeStep = copy(scratch.pos);
    this.settleTurn(actor);
    if (!this.restsStill(actor)) {
      const obstacles = player.body ? [player.body] : [];
      stepBody(actor.body, dt, isSolid, {
        ...this.options.physics,
        stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2,
        obstacles,
        shapeOf: this.shapeOf,
      });
      this.noteRest(actor);
    }
    scratch.travelled = horizontalDistance(scratch.beforeStep, actor.body.pos) * blockSize;
    scratch.wallAhead = aimDirection !== undefined && this.wallAhead(aimDirection);
    scratch.dx = actor.body.pos[0] - scratch.beforeStep[0];
    scratch.dz = actor.body.pos[2] - scratch.beforeStep[2];
    scratch.forward = aimDirection ? (scratch.dx * aimDirection[0] + scratch.dz * aimDirection[2]) * blockSize : 0;
    scratch.obstacleContact =
      scratch.wallAhead &&
      !scratch.jumpAttempted &&
      actor.horizontalSpeed > 0.01 &&
      scratch.forward < actor.horizontalSpeed * dt * 0.1;
  }

  /**
   * Whether a wall stands just ahead along `aim`. A box-sized body moves its box as far ahead and tests
   * whether it meets terrain: a ray from its centre misses the block corner its body catches, so it would
   * grind against that corner without ever registering the contact. An amalgam's flesh reaches metres past
   * its centre, so its shape is moved as far ahead instead.
   */
  private wallAhead(aim: Vec3): boolean {
    const { actor, isSolid } = this.tickScratch;
    const shape = this.shapeOf(actor.body);
    if (shape) {
      return this.fleshMeets(shape, aim);
    }
    return bodyOverlapsTerrain(this.bodyAhead(aim), isSolid);
  }

  /** The zombie's box at its tick start, moved the obstacle lookahead along `aim`. */
  private bodyAhead(aim: Vec3): Body {
    const { actor, beforeStep, blockSize } = this.tickScratch;
    const reach = OBSTACLE_LOOKAHEAD_METRES / blockSize;
    return { ...actor.body, pos: [beforeStep[0] + aim[0] * reach, beforeStep[1], beforeStep[2] + aim[2] * reach] };
  }

  /** Whether an amalgam's flesh, moved the obstacle lookahead along `heading` and lifted over a step, meets terrain. */
  private fleshMeets(shape: BodyShape, heading: Vec3): boolean {
    const { actor, blockSize } = this.tickScratch;
    const { pos } = actor.body;
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
    const shape = this.shapeOf(this.tickScratch.actor.body);
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
    const { actor, sees, wanderingAtTickStart, obstacleContact, wasObstacleContact, aimDirection, rng } = scratch;
    if (
      !(sees || wanderingAtTickStart) &&
      obstacleContact &&
      !wasObstacleContact &&
      aimDirection &&
      rng.chance(actor.type.wander.obstacleWanderChance)
    ) {
      const physics = { ...this.options.physics, stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2 };
      const headings = openWanderHeadings({
        body: actor.body,
        intent: aimDirection,
        isSolid: scratch.isSolid,
        physics,
        blockSize: scratch.blockSize,
      });
      if (headings.length > 0) {
        actor.obstacleWanderHeading = headings[rng.int(0, headings.length - 1)]!;
        actor.obstacleWanderRemaining = actor.type.wander.obstacleWanderDistanceMetres;
      }
    }
  }

  private updateObstacleSlideSide(): void {
    const scratch = this.tickScratch;
    const { actor, obstacleContact, wasObstacleContact, aimDirection, jumpAttempted, travelled, rng } = scratch;
    if (!obstacleContact) {
      actor.obstacleSlideSide = 0;
    } else if (!wasObstacleContact && aimDirection && !jumpAttempted) {
      const side = rng.int(0, 1) === 0 ? -1 : 1;
      actor.obstacleSlideSide = this.openSide(aimDirection) ?? side;
    } else if (actor.obstacleSlideSide !== 0 && !jumpAttempted && travelled < 0.0001) {
      actor.obstacleSlideSide = actor.obstacleSlideSide === -1 ? 1 : -1;
    }
  }

  private updateObstacleContact(): void {
    const scratch = this.tickScratch;
    const { actor, obstacleContact, travelled, wanderingAtTickStart } = scratch;
    scratch.wasObstacleContact = actor.obstacleContact;
    if (wanderingAtTickStart) {
      if (obstacleContact) {
        actor.obstacleWanderRemaining = 0;
        actor.obstacleWanderHeading = undefined;
      } else {
        actor.obstacleWanderRemaining = Math.max(0, actor.obstacleWanderRemaining - travelled);
        if (actor.obstacleWanderRemaining === 0) {
          actor.obstacleWanderHeading = undefined;
        }
      }
    }
    this.updateObstacleSlideSide();
    this.startObstacleWander();
    actor.obstacleContact = obstacleContact;
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
    const { actor, type, obstacleContact, aimDirection } = scratch;
    const { bashObstacle } = this.options;
    if (
      !(bashObstacle && obstacleContact && aimDirection) ||
      type.strength <= 0 ||
      (actor.mode !== 'chase' && actor.mode !== 'investigate') ||
      actor.attackWait > 0 ||
      actor.attackWindup > 0
    ) {
      return;
    }
    const around = {
      body: actor.body,
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
    actor.attackWait = type.attack.cooldownSimSeconds;
    actor.obstacleSlideSide = 0;
    actor.obstacleWanderHeading = undefined;
    actor.obstacleWanderRemaining = 0;
  }

  private updateMovementAfterStep(): void {
    const scratch = this.tickScratch;
    const { actor, blockSize, dt, travelled, beforeStep, groundedAtTickStart, stroll } = scratch;
    scratch.stepHeightMetres = this.options.physics.stepHeight * blockSize;
    const stepOffsetState = updateStepOffset(
      {
        offset: actor.stepOffset ?? 0,
        previous: {
          position: beforeStep.map((coordinate) => coordinate * blockSize) as Vec3,
          grounded: groundedAtTickStart.get(actor) ?? false,
        },
      },
      {
        position: actor.body.pos.map((coordinate) => coordinate * blockSize) as Vec3,
        grounded: actor.body.onGround,
        dt,
        stepHeightMetres: scratch.stepHeightMetres,
      },
    );
    actor.stepOffset = stepOffsetState.offset;
    actor.gaitPhase += (travelled / actor.type.stepLength) * Math.PI;
    if (actor.mode === 'idle' || actor.mode === 'stroll') {
      actor.wanderClock += dt;
    }
    if (stroll && actor.mode === 'stroll' && actor.horizontalSpeed > 0.01) {
      const requested = actor.horizontalSpeed * dt;
      if (travelled + 1e-4 < requested * 0.1) {
        this.beginIdle(actor);
      }
    }
    if (stroll && actor.mode === 'stroll' && actor.modeTimer <= 0 && actor.horizontalSpeed <= 0.01) {
      this.beginIdle(actor);
    }
    if (actor.mode === 'search' && actor.searchStrolling && actor.horizontalSpeed > 0.01) {
      const requested = actor.horizontalSpeed * dt;
      if (travelled + 1e-4 < requested * 0.1) {
        actor.searchStrolling = false;
        actor.modeTimer = inRange(scratch.rng, actor.type.wander.idleSimSeconds);
      }
    }
  }

  private reachableActorMoves(actor: Actor, actorPos: Vec3, playerPos: Vec3): ActorMove[] {
    return actor.type.attack.moves.filter((move) =>
      withinAttackReach({
        actor,
        actorPos,
        playerPos,
        blockSize: this.options.blockSize,
        isSolid:
          this.options.meleeBlocker?.({
            kind: 'actor',
            motion: move.motion,
            reachMetres: actorAttackReachMetres(actor),
          }) ?? this.options.isSolid,
      }),
    );
  }

  private resolveActorAttack(): void {
    const scratch = this.tickScratch;
    const { actor, dt, player, type, pos } = scratch;
    if (actor.attackWindup > 0) {
      actor.attackWindup = Math.max(0, actor.attackWindup - dt);
      if (actor.attackWindup <= 0) {
        const moves = this.reachableActorMoves(actor, pos, player.pos);
        if (moves.length > 0) {
          const move = pickActorMove(moves, scratch.rng.next());
          this.options.hurtPlayer(move.damage, move.hitRegions, scratch.id, move.damageKind);
        }
      }
    } else if (
      actor.mode === 'chase' &&
      actor.staggerSimSeconds <= 0 &&
      actor.attackWait <= 0 &&
      actor.spitWindup <= 0 &&
      (type.model === 'fused-mass' ? activeFusedMassMembers(actor).length > 0 : canStillAttack(actor)) &&
      this.reachableActorMoves(actor, pos, player.pos).length > 0
    ) {
      this.options.onSound?.(type.sounds.attack, copy(pos), actor);
      actor.attackWindup = type.attack.windupSimSeconds;
      actor.attackWait = type.attack.cooldownSimSeconds;
    }
    this.resolveAcidSpit();
  }

  /** Doc: `docs/acid-zombie.md`, "The spit". Sight starts it, release re-checks the line, a hit cancels it. */
  private resolveAcidSpit(): void {
    const scratch = this.tickScratch;
    const { actor, dt, player, blockSize, type, pos, isSolid } = scratch;
    const spit = type.acidSpit;
    if (!spit) {
      return;
    }
    if (actor.spitWindup > 0) {
      actor.spitWindup = Math.max(0, actor.spitWindup - dt);
      if (actor.spitWindup > 0) {
        return;
      }
      const chest = spitChest(player, this.options.tuning, blockSize);
      const origin = spitOrigin(actor, scratch.id, blockSize);
      if (!spitLineClear(origin, chest, isSolid)) {
        return;
      }
      actor.spitWait = spit.cooldownSimSeconds;
      const spread = (actor.spitRng.range(-1, 1) * spit.spreadDegrees * Math.PI) / 180;
      const toPlayer = sub(chest, origin);
      const heading = headingAt(angleOf(toPlayer) + spread);
      const reach = Math.hypot(toPlayer[0], toPlayer[2]);
      const aim = unit([heading[0] * reach, toPlayer[1], heading[2] * reach]);
      const release = { source: scratch.id, origin, aim, moves: spit.moves };
      const move = pickActorMove(spit.moves, actor.spitRng.next());
      const speed = spit.globMetresPerSimSecond / blockSize;
      const { gravity } = this.options.physics;
      const flightSeconds = Math.hypot(...toPlayer) / speed;
      this.globs.push({
        type,
        state: {
          source: scratch.id,
          type: type.id,
          move: move.id,
          pos: copy(origin),
          velocity: [aim[0] * speed, aim[1] * speed + 0.5 * gravity * flightSeconds, aim[2] * speed],
          damage: modified('attack.damage', move.damage, actor),
          puddleDamagePerSimSecond: modified('attack.damage', spit.puddle.damagePerSimSecond, actor),
          regionRoll: actor.spitRng.next(),
        },
      });
      this.options.onAcidSpit?.(release);
      return;
    }
    const metres = horizontalDistance(player.pos, pos) * blockSize;
    if (
      actor.mode === 'chase' &&
      scratch.sees &&
      actor.staggerSimSeconds <= 0 &&
      actor.spitWait <= 0 &&
      actor.attackWindup <= 0 &&
      metres >= spit.rangeBand.nearMetres &&
      metres <= spit.rangeBand.farMetres
    ) {
      this.options.onSound?.(type.sounds.attack, copy(pos), actor);
      actor.spitWindup = spit.windupSimSeconds;
    }
  }

  private finishActorTick(): void {
    const scratch = this.tickScratch;
    const { actor, returnArrived, blockSize, dt, id } = scratch;
    if (actor.mode === 'return' && returnArrived && actor.horizontalSpeed <= 0.01) {
      this.beginIdle(actor);
    }
    const poseInput = actorPoseInputFor(actor, id, blockSize);
    const stanceTarget = targetStanceWeight(poseInput);
    actor.stanceWeight = advanceStanceWeight(actor.stanceWeight ?? stanceTarget, stanceTarget, dt);
  }

  private separateActorBodies(entries: readonly (readonly [EntityId, Actor])[], dt: number, player: PlayerSense): void {
    const { blockSize, isSolid } = this.tickScratch;
    const { shapeOf } = this;
    separateBodies({
      bodies: entries.filter(([, actor]) => !actor.incapacitated).map(([, actor]) => actor.body),
      dt,
      isSolid,
      blockSize,
      obstacles: player.body ? [player.body] : [],
      shapeOf,
    });
    if (!player.body) {
      return;
    }
    for (const [, actor] of entries) {
      if (!actor.incapacitated) {
        separateBodyPair({ first: player.body, second: actor.body, dt, isSolid, blockSize, shapeOf });
      }
    }
  }

  private emitFootsteps(
    entries: readonly (readonly [EntityId, Actor])[],
    groundedAtTickStart: Map<Actor, boolean>,
    player: PlayerSense,
    blockSize: number,
  ): void {
    const footfallCandidates = entries.flatMap(([id, actor]) => {
      if (
        actor.type.footstepSound === undefined ||
        !groundedAtTickStart.get(actor) ||
        !actor.body.onGround ||
        actor.horizontalSpeed <= 0.01
      ) {
        return [];
      }
      const travelledMetres = horizontalDistance(actor.renderPrevious.pos, actor.body.pos) * blockSize;
      const advance = advanceActorFootsteps(actor.footstepClock, travelledMetres, actor.type.stepLength);
      actor.footstepClock = advance.clock;
      return travelledMetres > 0 ? [{ id, actor, steps: advance.steps }] : [];
    });
    const footstepVoices = new Set(
      [...footfallCandidates]
        .sort(
          (a, b) =>
            horizontalDistance(a.actor.body.pos, player.pos) - horizontalDistance(b.actor.body.pos, player.pos) ||
            a.id - b.id,
        )
        .slice(0, ACTOR_FOOTSTEP_VOICE_CAP)
        .map(({ actor }) => actor),
    );
    for (const { id, actor, steps } of footfallCandidates) {
      if (!footstepVoices.has(actor)) {
        continue;
      }
      for (let step = 0; step < steps; step++) {
        this.options.onFootstep?.(copy(actor.body.pos), id, actor.mode, actor);
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
    const entries = selection === 'active' ? classified.filter(([, actor]) => actor.tier === 'active') : classified;
    if (this.frozen) {
      this.tickFrozen(dt, entries);
      return;
    }
    this.tickAcidPuddles(dt, player);
    this.tickAcidGlobs(dt, player);
    const dayState = this.options.dayPhase();
    const { blockSize, isSolid } = this.options;
    const groundedAtTickStart = new Map<Actor, boolean>();
    const scratch = this.tickScratch;
    scratch.dt = dt;
    scratch.time = time;
    scratch.player = player;
    scratch.dayState = dayState;
    scratch.blockSize = blockSize;
    scratch.isSolid = isSolid;
    scratch.isOpaque = this.options.isOpaque;
    scratch.groundedAtTickStart = groundedAtTickStart;
    this.indexIdleSoundDensity();
    for (const [id, actor] of entries) {
      groundedAtTickStart.set(actor, actor.body.onGround);
      this.captureRenderPrevious(actor, time);
      if (actor.incapacitated) {
        this.tickIncapacitated(actor, dt);
        continue;
      }
      scratch.id = id;
      scratch.actor = actor;
      scratch.pos = actor.body.pos;
      scratch.type = actor.type;
      scratch.rng = actor.behaviorRng;
      this.updateActorTimers();
      this.updatePerception();
      this.updateAttention();
      this.forgetIndividualStimulus(actor, time);
    }
    this.processChainStimuli(time);
    for (const [id, actor] of entries) {
      if (actor.incapacitated) {
        continue;
      }
      scratch.id = id;
      scratch.actor = actor;
      scratch.pos = actor.body.pos;
      scratch.type = actor.type;
      scratch.rng = actor.behaviorRng;
      scratch.sees = actor.mode === 'chase';
      this.checkInvestigationArrival();

      this.selectMovementIntent();

      this.updateMovementSpeed();
      this.applyObstacleSlide();
      this.stepActorBody();
      this.updateObstacleContact();
      this.updateMovementAfterStep();
      this.resolveActorAttack();
      this.finishActorTick();
    }
    this.separateActorBodies(entries, dt, player);
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
            cause: type.cause,
            region,
            kind: type.acidSpit!.puddle.damageKind,
            touch: 'ground',
          });
        } else {
          this.options.onPlayerLeaveExposure?.(id);
        }
      }
      this.burnActorFeet(puddle, radius, damage, type.acidSpit!.puddle.damageKind);
      puddle.remainingSimSeconds = Math.max(0, puddle.remainingSimSeconds - dt);
      if (puddle.remainingSimSeconds === 0) {
        for (const region of ['leftLeg', 'rightLeg'] as const) {
          this.options.onPlayerLeaveExposure?.(`acid-puddle:${puddle.id}:${region}`);
        }
      }
    }
    this.puddles = this.puddles.filter(({ state }) => state.remainingSimSeconds > 0);
  }

  private burnActorFeet(puddle: Readonly<AcidPuddleState>, radius: number, damage: number, kind: DamageKind): void {
    for (const [id, actor] of this.store.entries()) {
      if (damage <= 0 || !feetInAcidPuddle(actor.body, puddle, radius)) {
        continue;
      }
      const legs = (Object.keys(actor.regions) as ActorHitRegion[]).filter((region) =>
        ['leftLeg', 'rightLeg'].includes(actorRegionClass(region)),
      );
      for (const region of legs) {
        if (actor.regions[region]! <= 0) {
          continue;
        }
        const burn = damageToActor(actor.type, damage / legs.length, kind, actorRegionClass(region) as BodyRegion);
        if (burn <= 0) {
          continue;
        }
        const healthAfter = this.damageRegion(actor, region, burn);
        this.resolveRegionDamage(id, actor, region, healthAfter);
      }
    }
  }

  private tickAcidGlobs(dt: number, player: PlayerSense): void {
    const poseCache = new Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>>();
    this.globs = this.globs.filter(({ state, type }) => {
      const impact = advanceAcidGlob<GlobContact>(
        state,
        dt,
        this.options.physics.gravity,
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
    type: ActorDef,
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
        cause: type.cause,
      });
    } else if (contact.kind === 'actor') {
      const { id, actor, region, cell } = contact.hit;
      const damage = damageToActor(actor.type, state.damage, move.damageKind, actorRegionClass(region) as BodyRegion);
      if (damage > 0) {
        const strike = this.applyMeleeHit({
          id,
          actor,
          region,
          cell,
          origin: position,
          direction: unit(state.velocity),
          distanceMetres: 0,
          weapon: projectileWeapon(damage, 0, 0, move.damageKind),
          damageType: move.damageKind,
          damageOverride: damage,
          isFist: false,
          projectile: true,
        });
        if (strike) {
          this.carve(id, actor, [strike]);
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
    const actor = this.firstRegionHit({
      origin,
      direction,
      isBlocked: this.options.isSolid,
      exclude: source,
      poseCache,
    });
    if (actor) {
      contacts.push({ kind: 'actor', distance: actor.distance, hit: actor });
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
    for (const [id, actor] of this.store.entries()) {
      if (id !== exclude && !actor.incapacitated && rayMayHitActor(actor, origin, direction, this.options.blockSize)) {
        nearest = this.nearerRegionHit({ id, actor, origin, direction, isBlocked, poseCache }, nearest);
      }
    }
    return nearest;
  }

  /** The ray's first unblocked hit on one zombie's regions when it is nearer than `nearest`, else `nearest`. */
  private nearerRegionHit(
    {
      id,
      actor,
      origin,
      direction,
      isBlocked,
      poseCache,
    }: {
      id: EntityId;
      actor: Actor;
      origin: Vec3;
      direction: Vec3;
      isBlocked: SolidAt;
      poseCache?: Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>> | undefined;
    },
    nearest: RegionHit | undefined,
  ): RegionHit | undefined {
    const { blockSize } = this.options;
    const posed = posedRegionsForActor({ id, actor, blockSize, poseCache });
    const figure = actor.type.model === 'fused-mass' ? fusedMassFigureForType(actor.type, actor.figureSeed) : undefined;
    let found = nearest;
    for (const regionId of Object.keys(actor.regions)) {
      const region = regionId as ActorHitRegion;
      if (!isActiveHitRegion(actor, region)) {
        continue;
      }
      const boxes = posed[region] ?? [];
      // An amalgam is struck only on its flesh: its boxes are loose around rounded lobes (#563).
      const hit: { readonly distance: number; readonly box: PosedBoneBox; readonly cell?: number } | undefined = figure
        ? fleshHit({ figure, missing: this.missingFor(actor), boxes, origin, direction, blockSize })
        : posedRegionHit(boxes, origin, direction, blockSize);
      if (
        hit !== undefined &&
        hit.distance < (found?.distance ?? Number.POSITIVE_INFINITY) &&
        !raycast(origin, direction, hit.distance, isBlocked)
      ) {
        found = { id, actor, region, distance: hit.distance, boxes, box: hit.box, cell: hit.cell };
      }
    }
    return found;
  }

  /** Purely queries the first visible posed region along the ray, including hits beyond melee reach. */
  aimAt(origin: Vec3, direction: Vec3, weapon: HitWeapon): ActorAim | undefined {
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
  }): ActorAim | undefined {
    const found = this.firstRegionHit({ origin, direction: unit(direction), isBlocked, poseCache });
    if (!found) {
      return undefined;
    }
    const { id, actor, region, distance, boxes, box, cell } = found;
    const distanceMetres = distance * this.options.blockSize;
    const reachMetres = PLAYER_ARM_REACH_M + weapon.reach;
    return {
      id,
      region,
      distanceMetres,
      reachMetres,
      inReach: distanceMetres <= reachMetres,
      health: actor.regions[region]!,
      maxHealth: maxActorRegionHealth(actor.type, region) ?? actor.regions[region]!,
      boxes,
      hitBox: box,
      cell,
    };
  }

  /** Hitscan pellets use the same posed regions, solid occlusion, HP/death and dismemberment path as melee.
   * They do not consume melee stamina, advance its cooldown or emit fist/swing sounds. */
  firePellets(shot: Omit<PelletShot, 'diameterMm'>): PelletHits {
    let hits = 0;
    const stops: (number | undefined)[] = [];
    const poseCache = new Map<EntityId, Readonly<Record<string, readonly PosedBoneBox[]>>>();
    const weapon: HitWeapon = {
      ...projectileWeapon(shot.damage, shot.rangeMetres, shot.impulse, shot.damageKind),
      ...(shot.headDamageMultiplier === undefined ? {} : { headDamageMultiplier: shot.headDamageMultiplier }),
    };
    // One shot's pellets carve one hole per amalgam, struck against the flesh as it was before the shot's
    // holes, so pellets on one line can't tunnel through the body.
    const strikes = new Map<EntityId, { actor: Actor; strikes: FusedMassStrike[] }>();
    for (const direction of shot.directions) {
      const aim = this.targetAt({
        origin: shot.origin,
        direction,
        weapon,
        isBlocked: this.options.isSolid,
        poseCache,
      });
      const actor = aim && aim.distanceMetres <= shot.rangeMetres ? this.store.get(aim.id) : undefined;
      if (!(aim && actor)) {
        stops.push(undefined);
        continue;
      }
      stops.push(aim.distanceMetres / this.options.blockSize);
      const strike = this.applyMeleeHit({
        id: aim.id,
        actor,
        region: aim.region,
        cell: aim.cell,
        origin: shot.origin,
        direction,
        distanceMetres: aim.distanceMetres,
        weapon,
        damageType: shot.damageKind,
        isFist: false,
        projectile: true,
      });
      if (strike) {
        const entry = strikes.get(aim.id) ?? { actor, strikes: [] };
        entry.strikes.push(strike);
        strikes.set(aim.id, entry);
      }
      hits += 1;
    }
    for (const [id, entry] of strikes) {
      this.carve(id, entry.actor, entry.strikes);
    }
    return { hits, stops };
  }

  /**
   * A detonation at the fragments' origin (`DESIGN.md`, "Hand grenade"). The blast takes its falloff damage from
   * every region of each standing body whose centre it sees, the lethal region last so limbs come off before the
   * kill; then the fragments fly as a shot does. Returns the bodies the blast reached.
   */
  detonate({ blast, fragments }: Detonation): number {
    const { origin } = fragments;
    let reached = 0;
    for (const [id, actor] of [...this.store.entries()]) {
      const centre = bodyCentre(actor.body);
      const distance = Math.hypot(centre[0] - origin[0], centre[1] - origin[1], centre[2] - origin[2]);
      const distanceMetres = distance * this.options.blockSize;
      const share = blastShare(blast, distanceMetres);
      if (actor.incapacitated || share <= 0 || !inSight(origin, centre, this.options.isSolid)) {
        continue;
      }
      reached += 1;
      const toward: Vec3 =
        distance > 0 ? [centre[0] - origin[0], centre[1] - origin[1], centre[2] - origin[2]] : [0, 1, 0];
      const weapon = projectileWeapon(
        blast.damage * share,
        blast.radiusMetres,
        blast.impulse * share,
        blast.damageKind,
      );
      for (const region of blastOrder(actor)) {
        if (this.store.get(id) !== actor) {
          break;
        }
        if (isActiveHitRegion(actor, region)) {
          this.applyMeleeHit({
            id,
            actor,
            region,
            cell: undefined,
            origin,
            direction: toward,
            distanceMetres,
            weapon,
            damageType: blast.damageKind,
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
    if (weapon.swingSound !== undefined) {
      this.options.onSound?.(weapon.swingSound, copy(origin), undefined, true);
    }
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
    const actor = this.store.get(aim.id);
    if (!actor) {
      return undefined;
    }
    const strike = this.applyMeleeHit({
      id: aim.id,
      actor,
      region: aim.region,
      cell: aim.cell,
      origin,
      direction,
      distanceMetres: aim.distanceMetres,
      weapon,
      damageType: weapon.type,
      isFist,
    });
    if (strike) {
      this.carve(aim.id, actor, [strike]);
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
    actor,
    region,
    cell,
    origin,
    direction,
    distanceMetres,
    weapon,
    damageType,
    projectile = false,
    damageOverride,
  }: MeleeHitContext & { projectile?: boolean; damageOverride?: number }): FusedMassStrike | undefined {
    const ray = unit(direction);
    const distance = distanceMetres / this.options.blockSize;
    const hit: HitImpulse = {
      point: [origin[0] + ray[0] * distance, origin[1] + ray[1] * distance, origin[2] + ray[2] * distance],
      direction: ray,
      impulse: weapon.impulse,
    };
    const damage = damageOverride ?? meleeDamageForContact(actor, region, weapon, damageType);
    if (!projectile) {
      this.options.onMeleeContact?.(hit.impulse);
      for (const event of meleeHitSounds(weapon)) {
        this.options.onSound?.(event, copy(actor.body.pos), actor, true);
      }
    }
    const healthBefore = actor.regions[region]!;
    const severedBefore = new Set(actor.severed);
    this.options.onSound?.(actor.type.sounds.hurt, copy(actor.body.pos), actor);
    const healthAfter = this.damageRegion(actor, region, damage);
    if (healthAfter < healthBefore) {
      actor.hitFlinchTime = 0;
      this.cancelAcidSpit(actor);
    }
    if (!projectile) {
      this.stagger(actor, hit.impulse);
    }
    if (damage > 0) {
      this.options.onWound?.(id, actor, hit, damage);
    }
    const killed = healthAfter === 0 && lethalRegion(actor.type, region);
    const incapacitated = this.applyMeleeEffects({ id, actor, region, healthAfter, killed, hit });
    const newParts = actor.severed.filter((candidate) => !severedBefore.has(candidate));
    const headPart = actor.type.model === 'fused-mass' ? undefined : regionCut(actor, 'head');
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
    return strikeOf(actor, cell, damage, hit);
  }

  /** Knocks out the flesh around one hole: the strikes' central cell, sized by their summed damage. */
  private carve(id: EntityId, actor: Actor, strikes: readonly FusedMassStrike[]): void {
    const { carving } = actor.type;
    if (!carving || strikes.length === 0) {
      return;
    }
    const figure = fusedMassFigureForType(actor.type, actor.figureSeed);
    const struck = centralCell(
      figure,
      strikes.map((strike) => strike.cell),
    );
    const cells = carveAround({
      figure,
      carving,
      missing: missingFlesh(figure, actor),
      struck,
      damage: strikes.reduce((total, strike) => total + strike.damage, 0),
    });
    if (cells.length === 0) {
      return;
    }
    actor.carved = [...actor.carved, ...cells].sort((a, b) => a - b);
    this.options.onCarve?.(id, actor, cells, strikes.find((strike) => strike.cell === struck)!.hit);
  }

  /** Doc: `docs/stagger.md`. A heavy enough hit spoils the attack in progress; position is never touched. */
  private stagger(actor: Actor, impulse: number): void {
    const { stagger } = actor.type;
    if (!stagger || impulse < stagger.impulseThreshold) {
      return;
    }
    actor.staggerSimSeconds = Math.max(actor.staggerSimSeconds, stagger.durationSimSeconds);
    actor.attackWindup = 0;
    this.cancelAcidSpit(actor);
  }

  /** A hit during the wind-up spoils the spit and spends the content fraction of the cooldown. */
  private cancelAcidSpit(actor: Actor): void {
    const spit = actor.type.acidSpit;
    if (spit && actor.spitWindup > 0) {
      actor.spitWindup = 0;
      actor.spitWait = spit.cancelPenaltyFraction * spit.cooldownSimSeconds;
    }
  }

  private applyMeleeEffects({ id, actor, region, healthAfter, killed, hit }: MeleeEffectsContext): boolean {
    if (actor.type.model === 'fused-mass') {
      const member = FUSED_MASS_MEMBER_REGION.exec(region)?.[1];
      if (member && healthAfter === 0) {
        this.sever(id, actor, member, hit);
      }
    } else {
      const cut =
        healthAfter === 0 && region !== 'head' && region !== 'torso'
          ? regionCut(actor, region as HumanoidHitRegion)
          : undefined;
      if (cut !== undefined) {
        this.sever(id, actor, cut, hit);
      }
      this.rollDismember(id, actor, killed, hit);
    }
    const incapacitated = this.resolveRegionDamage(id, actor, region, healthAfter);
    if (!killed && actor.type.model !== 'fused-mass' && region !== 'head' && region !== 'torso' && healthAfter === 0) {
      this.options.onSevered?.(actor, region as HumanoidHitRegion);
    }
    return incapacitated;
  }

  /** Takes health from a zombie's legs not yet destroyed, shared between them, as a hit there would. */
  injureLegs(id: EntityId, damage: number): void {
    const actor = this.store.get(id);
    if (!actor || damage <= 0) {
      return;
    }
    const legs = (Object.keys(actor.regions) as ActorHitRegion[]).filter(
      (region) => ['leftLeg', 'rightLeg'].includes(actorRegionClass(region)) && actor.regions[region]! > 0,
    );
    for (const region of legs) {
      if (this.store.get(id) === actor) {
        this.resolveRegionDamage(id, actor, region, this.damageRegion(actor, region, damage / legs.length));
      }
    }
  }

  private damageRegion(actor: Actor, region: ActorHitRegion, damage: number): number {
    const healthAfter = Math.max(0, actor.regions[region]! - damage);
    actor.regions[region] = healthAfter;
    return healthAfter;
  }

  private resolveRegionDamage(id: EntityId, actor: Actor, region: ActorHitRegion, healthAfter: number): boolean {
    const killed = healthAfter === 0 && lethalRegion(actor.type, region);
    const incapacitated =
      actor.type.model !== 'fused-mass' && region === 'torso' && healthAfter === 0 && actor.regions.head! > 0;
    if (incapacitated && !actor.incapacitated) {
      actor.incapacitated = true;
      actor.horizontalSpeed = 0;
      actor.attackWait = 0;
      actor.attackWindup = 0;
      actor.body.vel[0] = 0;
      actor.body.vel[2] = 0;
      this.options.onIncapacitated?.(id, actor);
    }
    if (killed) {
      this.store.remove(id);
      this.options.onDeath?.(id, actor);
    }
    return incapacitated;
  }

  /**
   * Ends a downed zombie as a kill does: its head is destroyed, it leaves the store and onDeath fires, so its
   * body sinks as a corpse. Dismembering first cuts off whichever arms are still on, and the head, each left
   * behind through onSevered. Returns why not for a zombie that isn't lying downed.
   */
  finishDowned(id: EntityId, dismember: boolean): string | undefined {
    const actor = this.store.get(id);
    if (!actor?.incapacitated) {
      return "It isn't lying there any more";
    }
    if (dismember) {
      const hit: HitImpulse = { point: copy(actor.body.pos), direction: [0, -1, 0], impulse: 0 };
      for (const region of ['leftArm', 'rightArm', 'head'] as const) {
        const part = regionCut(actor, region);
        if (part !== undefined && !actor.severed.includes(part)) {
          this.sever(id, actor, part, hit);
          this.options.onSevered?.(actor, region);
        }
      }
    }
    actor.regions.head = 0;
    this.store.remove(id);
    this.options.onDeath?.(id, actor);
    return undefined;
  }

  /** Records `part` as severed (cumulative, saved) and tells the renderer; a part already cut is a no-op. */
  private sever(id: EntityId, actor: Actor, part: string, hit: HitImpulse): void {
    if (actor.severed.includes(part)) {
      return;
    }
    actor.severed.push(part);
    this.options.onSever?.(id, actor, part, { ...hit, impulse: hit.impulse * actor.type.severedImpulseScale });
  }

  /** Independent rolls for this hit: type.dismember.chance for a random not-yet-severed arm part (skipping
   * one already implied by a containing part — see availableArmParts), and, only on a killing blow,
   * type.dismember.headOnKillChance for the head too. Uses actor.dismemberRng, not behaviorRng — see
   * Actor.dismemberRng's own doc comment. */
  private rollDismember(id: EntityId, actor: Actor, killed: boolean, hit: HitImpulse): void {
    const { dismember } = actor.type;
    if (actor.dismemberRng.chance(dismember.chance)) {
      const available = availableArmParts(actor);
      if (available.length > 0) {
        const part = available[actor.dismemberRng.int(0, available.length - 1)]!;
        this.sever(id, actor, part, hit);
      }
    }
    const head = regionCut(actor, 'head');
    if (
      killed &&
      head !== undefined &&
      !actor.severed.includes(head) &&
      actor.dismemberRng.chance(dismember.headOnKillChance)
    ) {
      this.sever(id, actor, head, hit);
    }
  }
}
