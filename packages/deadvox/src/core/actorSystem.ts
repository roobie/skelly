import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { type AcidGlobState, advanceAcidGlob } from './acidGlob.ts';
import { type AcidPuddleState, feetInAcidPuddle } from './acidPuddle.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';
import {
  angleOf,
  approach,
  clearLine,
  headingAt,
  horizontalDistance,
  inRange,
  pickByWeight,
  pushTurn,
  steer,
  sub,
  type TerrainFloorAt,
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
import { type ActorTickScratch, createActorTickScratch } from './actorTickScratch.ts';
import type { BodyRegion, DamageKind } from './body.ts';
import type { MeleeBlocker } from './collision.ts';
import type { ActorDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ExposureContact } from './damageExposure.ts';
import type { DayPhaseState } from './dayPhase.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { advanceActorFootsteps, initialActorFootstepClock } from './footsteps.ts';
import { carveAround, centralCell, fleshHit, type MissingFlesh, missingFlesh } from './fusedMassCarving.ts';
import { FUSED_MASS_FIGURE_SEED, fusedMassCollisionEnvelope, fusedMassFigureForType } from './fusedMassFigure.ts';
import { FusedMassShape } from './fusedMassShape.ts';
import { HUMANOID_REGION_NAMES } from './humanoidRegionNames.ts';
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
import { Rng } from './random.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { MeleeCharge, SenseDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { type SolidBricks, testedBricks } from './solidBricks.ts';
import type { SoundId } from './soundEvents.ts';
import { updateStepOffset } from './stepOffset.ts';

export const BACKGROUND_ACTOR_RATE = 2;
export const BACKGROUND_ACTOR_SLICE_COUNT = 30;
export const BACKGROUND_ACTOR_SLICE_RATE = BACKGROUND_ACTOR_RATE * BACKGROUND_ACTOR_SLICE_COUNT;

import type { PlayerSense } from './actorSense.ts';
import { AgentController } from './agent.ts';
import { AgentHorde, type HordeState, snapshotHorde, validHordeSnapshotState } from './agentHorde.ts';
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

export interface ActorSystemState {
  nextEntityId: number;
  nextPuddleId: number;
  actors: { id: number; actor: ActorState }[];
  hordes: HordeState[];
  acidGlobs: AcidGlobState[];
  acidPuddles: AcidPuddleState[];
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
const OBSTACLE_LOOKAHEAD_METRES = 0.7;
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
  private readonly agentHorde: AgentHorde;

  private readonly agent: AgentController;

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
  private frozen = false;
  private readonly solidBricks: SolidBricks;
  /** Per body: its amalgam's shape and the last facing it turned to without meeting terrain; null otherwise. */
  private readonly shapes = new WeakMap<Body, FusedMassCollider | null>();
  private readonly missing = new WeakMap<
    Actor,
    { carved: readonly number[]; severed: number; missing: MissingFlesh }
  >();

  constructor(options: ActorSystemOptions) {
    this.options = options;
    this.store = options.store ?? new MapEntityStore<Actor>();
    this.solidBricks = options.solidBricks ?? testedBricks(options.isSolid);

    this.agentHorde = new AgentHorde(this.options, this.store);
    this.agent = new AgentController({
      options: this.options,
      tickScratch: this.tickScratch,
      store: this.store,
      agentHorde: this.agentHorde,
      holdSpitGround,
      reachableActorMoves: (actor, actorPos, playerPos) => this.reachableActorMoves(actor, actorPos, playerPos),
    });
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
      hordes: [...this.agentHorde.hordes.values()].map(({ state: horde, rng }) => snapshotHorde(horde, rng)),
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
    this.agentHorde.hordes.clear();
    for (const horde of state.hordes ?? []) {
      if (!validHordeSnapshotState(horde, this.agentHorde.hordes.has(horde.id), resolveType)) {
        throw new Error(`Invalid horde state ${horde.id}`);
      }
      this.agentHorde.hordes.set(horde.id, {
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
        const horde = this.agentHorde.hordes.get(actor.hordeId)?.state;
        if (!horde || horde.type !== actor.type.id) {
          throw new Error(`Missing or mismatched horde ${actor.hordeId} for zombie`);
        }
      }
    }
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
    this.agent.beginIdle(actor);
    return id;
  }

  addHorde(id: string, type: ActorDef, center: Vec3, count: number): void {
    if (
      !id ||
      this.agentHorde.hordes.has(id) ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      !center.every(Number.isFinite)
    ) {
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
    this.agentHorde.hordes.set(id, { state, rng });
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
    const horde = this.agentHorde.hordes.get(id)!.state;
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

  /** Advances one deterministic slice of distant actors; scheduler ticks every slice, each actor every half-second. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep per-actor perception, target selection, and bounded collision step together.
  tickBackground(dt: number, time: number, sliceIndex = 0, sliceCount = 1): void {
    if (dt <= 0 || this.frozen) {
      return;
    }
    const player = this.options.player();
    const dayState = this.options.dayPhase();
    if (sliceIndex === 0) {
      this.agentHorde.updateHordes(dt, time, player, dayState.phase);
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
    this.agent.indexIdleSoundDensity();
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
      this.agent.updatePerception();
      this.agent.updateAttention();
      this.agent.forgetIndividualStimulus(actor, time);
    }
    this.agent.processChainStimuli(time);
    for (const [id, actor] of entries) {
      if (actor.incapacitated) {
        continue;
      }
      scratch.id = id;
      scratch.actor = actor;
      scratch.pos = actor.body.pos;
      scratch.type = actor.type;
      scratch.rng = actor.behaviorRng;
      let target = actor.mode === 'hesitate' ? undefined : (this.agentHorde.hordeTarget(actor) ?? actor.lastPerceived);
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
        this.agent.selectMovementIntent();
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
        this.agent.beginIdle(actor);
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
    this.agent.limitSearchStroll(scratch, actor, type, dt);
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
        this.agent.beginIdle(actor);
      }
    }
    if (stroll && actor.mode === 'stroll' && actor.modeTimer <= 0 && actor.horizontalSpeed <= 0.01) {
      this.agent.beginIdle(actor);
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
      this.agent.beginIdle(actor);
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
    this.agent.indexIdleSoundDensity();
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
      this.agent.updatePerception();
      this.agent.updateAttention();
      this.agent.forgetIndividualStimulus(actor, time);
    }
    this.agent.processChainStimuli(time);
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
      this.agent.checkInvestigationArrival();

      this.agent.selectMovementIntent();

      this.updateMovementSpeed();
      this.agent.applyObstacleSlide();
      this.stepActorBody();
      this.agent.updateObstacleContact(
        (aim) => this.openSide(aim),
        (aim) => this.bodyAhead(aim),
      );
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
