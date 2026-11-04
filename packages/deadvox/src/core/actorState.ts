import type { ActorRegions } from './actorRegions.ts';
import type { ActorDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ActorFootstepClock } from './footsteps.ts';
import { protectedCoreCell } from './fusedMassCarving.ts';
import { FUSED_MASS_FIGURE_SEED, fusedMassFigureForType } from './fusedMassFigure.ts';
import type { Modifier } from './modifiers.ts';
import type { Body } from './physics.ts';
import type { Rng, RngState } from './random.ts';
import { actorBodyDimensions as measureActorBody } from './spawnClearance.ts';

export type ActorTier = 'active' | 'background' | 'unloaded';
export type AgentMode = 'idle' | 'stroll' | 'hesitate' | 'search' | 'chase' | 'investigate' | 'return';
export const actorBodyDimensions = measureActorBody;

export const requiredFigureSeeds = (type: ActorDef): readonly number[] => {
  if (type.figureSeeds === undefined) {
    throw new Error(`Zombie type ${type.id} is missing its authored figureSeeds`);
  }
  return type.figureSeeds;
};

export const requiredGrabBand = (type: ActorDef): number => {
  if (type.attack?.grabBandMetres === undefined) {
    throw new Error(`Zombie type ${type.id} is missing its authored attack.grabBandMetres`);
  }
  return type.attack.grabBandMetres;
};

export const actorAttackReachForDef = (type: ActorDef, figureSeed = FUSED_MASS_FIGURE_SEED): number => {
  if (!type.attack) {
    return 0;
  }
  return type.model === 'fused-mass'
    ? type.attack.reach * fusedMassFigureForType(type, figureSeed).scale
    : type.attack.reach;
};

/**
 * Effective eye-to-hand reach in metres, including leaning into a swing; weapon reach extends beyond it.
 * It applies to every melee weapon, not only the bare-handed attack, so it stays in code rather than on the fists class.
 */
export const PLAYER_ARM_REACH_M = 1.2;

export const validHitFlinchTime = (time: number | undefined): boolean =>
  time === undefined || (Number.isFinite(time) && time >= 0);
export const validStanceWeight = (weight: number | undefined): boolean =>
  weight === undefined || (Number.isFinite(weight) && weight >= 0 && weight <= 1);
export const validStepOffset = (offset: number | undefined): boolean =>
  offset === undefined || (Number.isFinite(offset) && Math.abs(offset) <= 0.5001);

export interface AgentState {
  hordeId?: string | undefined;
  hordeOffset?: Vec3 | undefined;
  home: Vec3;
  mode: AgentMode;
  investigationTier?: 'near' | 'far' | undefined;
  /** Per-body behavior stream; draws never perturb another body. */
  behaviorRng: Rng;
  /** Separate seeded stream keeps ambient sound timing from changing movement decisions. */
  soundRng: Rng;
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
  obstacleWanderHeading?: Vec3 | undefined;
  obstacleWanderRemaining: number;
  obstacleSlideSide: -1 | 0 | 1;
  bodyLookTarget: number;
  headYawTarget: number;
  lookTimer: number;
  lastPerceived?: Vec3 | undefined;
  stimulusAt?: number | undefined;
  lastAlertAt?: number | undefined;
}

export interface Actor {
  agent?: AgentState;
  type: ActorDef;
  modifiers: Modifier[];
  /** Derived tier; a single entity moves between update schedules without duplicating ownership. */
  tier?: ActorTier | undefined;
  body: Body;
  facing: Vec3;
  /** Separate seeded stream keeps melee damage variation and dismemberment rolls (both external hit
   * events) from shifting behaviorRng-driven AI. Each class weapon consumes one damage draw before its
   * dismemberment rolls, including zero-spread weapons, so contact draw order is stable. */
  dismemberRng: Rng;
  horizontalSpeed: number;
  obstacleContact: boolean;
  headYaw: number;
  chaseStance: boolean;
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
  regions: ActorRegions;
  /** Exact mobgen shambler seed shared with the renderer and persisted as simulation state. */
  figureSeed: number;
  /** A destroyed torso leaves an inert, gravity-bound entity that may be revived by a later system. */
  incapacitated: boolean;
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
  footstepClock: ActorFootstepClock;
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

export interface FusedMassMemberContribution {
  readonly partId: string;
  readonly rootBone: string;
  readonly regionIds: readonly string[];
}

/** Active member ownership is the seam for per-member attacks and reach; core is never a severable member. */
export const activeFusedMassMembers = (
  actor: Pick<Actor, 'type' | 'figureSeed' | 'severed'>,
): readonly FusedMassMemberContribution[] => {
  if (actor.type.model !== 'fused-mass') {
    return [];
  }
  const severed = new Set(actor.severed);
  return fusedMassFigureForType(actor.type, actor.figureSeed)
    .manifest.parts.filter((part) => part.severable && !severed.has(part.id))
    .map((part) => ({ partId: part.id, rootBone: part.rootBone, regionIds: part.regionIds }));
};

/** Remaining manifest members share the authored attack reach; with none, the unseverable core cannot attack. */
export const actorAttackReachMetres = (actor: Pick<Actor, 'type' | 'figureSeed' | 'severed'>): number => {
  if (actor.type.model !== 'fused-mass' || activeFusedMassMembers(actor).length === 0) {
    return actor.type.model === 'fused-mass' ? 0 : (actor.type.attack?.reach ?? 0);
  }
  return actorAttackReachForDef(actor.type, actor.figureSeed);
};

export type SavedAgentState = Omit<AgentState, 'behaviorRng' | 'soundRng' | 'lastVocalNoiseId'> & {
  behaviorRng: RngState;
  soundRng: RngState;
  lastVocalNoiseId: number | null;
};
export type ActorState = Omit<
  Actor,
  'agent' | 'type' | 'tier' | 'dismemberRng' | 'spitRng' | 'renderPrevious' | 'modifiers'
> & { agent?: SavedAgentState; type: string; dismemberRng: RngState; spitRng: RngState };

export const validRngState = (state: unknown): state is RngState =>
  Array.isArray(state) && state.length === 4 && state.every((word) => Number.isSafeInteger(word));
export const validSpitTimers = (actor: ActorState): boolean =>
  Number.isFinite(actor.spitWindup) && actor.spitWindup >= 0 && Number.isFinite(actor.spitWait) && actor.spitWait >= 0;
export const validStaggerTime = (actor: ActorState): boolean =>
  Number.isFinite(actor.staggerSimSeconds) && actor.staggerSimSeconds >= 0;
export const validObstacleWanderState = (actor: ActorState): boolean =>
  typeof actor.obstacleContact === 'boolean' &&
  (actor.agent === undefined ||
    (Number.isFinite(actor.agent.obstacleWanderRemaining) &&
      actor.agent.obstacleWanderRemaining >= 0 &&
      actor.agent.obstacleWanderRemaining > 0 === (actor.agent.obstacleWanderHeading !== undefined) &&
      (actor.agent.obstacleWanderHeading === undefined ||
        (Array.isArray(actor.agent.obstacleWanderHeading) &&
          actor.agent.obstacleWanderHeading.length === 3 &&
          actor.agent.obstacleWanderHeading.every(Number.isFinite))) &&
      (actor.agent.obstacleSlideSide === -1 ||
        actor.agent.obstacleSlideSide === 0 ||
        actor.agent.obstacleSlideSide === 1)));
const validActorFootstepClock = (clock: ActorFootstepClock): boolean =>
  Boolean(clock) &&
  Number.isFinite(clock.distanceUntilStep) &&
  clock.distanceUntilStep > 0 &&
  typeof clock.nextLongStep === 'boolean';
export const validActorEventState = (actor: ActorState): boolean =>
  (actor.agent === undefined ||
    ((actor.agent.hesitationFrom === undefined ||
      actor.agent.hesitationFrom === 'idle' ||
      actor.agent.hesitationFrom === 'stroll') &&
      (actor.agent.mode !== 'hesitate' ||
        (actor.agent.hesitationFrom !== undefined &&
          Number.isFinite(actor.agent.modeTimer) &&
          actor.agent.modeTimer >= 0 &&
          validVec3State(actor.agent.lastPerceived!))) &&
      (actor.agent.refusedAt === undefined || (Number.isFinite(actor.agent.refusedAt) && actor.agent.refusedAt >= 0)) &&
      (actor.agent.leanTarget === undefined || validVec3State(actor.agent.leanTarget)) &&
      (actor.agent.lastVocalNoiseId === null ||
        (Number.isSafeInteger(actor.agent.lastVocalNoiseId) && actor.agent.lastVocalNoiseId >= 0)) &&
      (actor.agent.stimulusAt === undefined ||
        (Number.isFinite(actor.agent.stimulusAt) && actor.agent.stimulusAt >= 0)) &&
      (actor.agent.lastAlertAt === undefined ||
        (Number.isFinite(actor.agent.lastAlertAt) && actor.agent.lastAlertAt >= 0)))) &&
  Array.isArray(actor.severed) &&
  actor.severed.every((part) => typeof part === 'string') &&
  Array.isArray(actor.carved) &&
  actor.carved.every(
    (cell, index) => Number.isSafeInteger(cell) && cell >= 0 && (index === 0 || cell > actor.carved[index - 1]!),
  ) &&
  validActorFootstepClock(actor.footstepClock);
/** Holes play could make: only a type that carves has any, each on flesh in its grid, never the core cell. */
export const validCarvedCells = (type: ActorDef, figureSeed: number, carved: readonly number[]): boolean => {
  if (!type.carving) {
    return carved.length === 0;
  }
  const figure = fusedMassFigureForType(type, figureSeed);
  const { owner } = figure.realized.voxels;
  const keep = protectedCoreCell(figure);
  return carved.every((cell) => cell < owner.length && owner[cell]! > 0 && cell !== keep);
};
export const validHordeMemberState = (actor: ActorState): boolean =>
  actor.agent === undefined ||
  (actor.agent.hordeId === undefined && actor.agent.hordeOffset === undefined) ||
  (typeof actor.agent.hordeId === 'string' &&
    actor.agent.hordeId.length > 0 &&
    Array.isArray(actor.agent.hordeOffset) &&
    actor.agent.hordeOffset.length === 3 &&
    actor.agent.hordeOffset.every(Number.isFinite));

export const validVec3State = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

const actorSnapshotFields = [
  'type',
  'body',
  'facing',
  'dismemberRng',
  'spitRng',
  'horizontalSpeed',
  'obstacleContact',
  'headYaw',
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
  'agent',
  'chaseStance',
] as const satisfies readonly (keyof ActorState)[];
type ActorSnapshotField = (typeof actorSnapshotFields)[number];
type ActorSnapshot = Pick<ActorState, ActorSnapshotField> &
  Record<Exclude<keyof ActorState, ActorSnapshotField>, never>;

type ActorSnapshotProjectors = {
  [K in ActorSnapshotField]-?: (actor: Actor) => ActorSnapshot[K];
} & Record<Exclude<keyof ActorState, ActorSnapshotField>, never>;

export const projectSnapshot = <Source extends object>(
  source: Source,
  projectors: Record<string, (source: Source) => unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(projectors).flatMap(([key, project]) => {
      const value = project(source);
      return value === undefined ? [] : [[key, value]];
    }),
  );

const agentSnapshotProjectors = {
  hordeId: (actor) => actor.hordeId,
  hordeOffset: (actor) => (actor.hordeOffset === undefined ? undefined : ([...actor.hordeOffset] as Vec3)),
  home: (actor) => [...actor.home],
  mode: (actor) => actor.mode,
  investigationTier: (actor) => actor.investigationTier,
  behaviorRng: (actor) => [...actor.behaviorRng.state()] as RngState,
  soundRng: (actor) => [...actor.soundRng.state()] as RngState,
  idleSoundTimer: (actor) => actor.idleSoundTimer,
  lastVocalNoiseId: (actor) => actor.lastVocalNoiseId ?? null,
  modeTimer: (actor) => actor.modeTimer,
  hesitationFrom: (actor) => actor.hesitationFrom,
  refusedAt: (actor) => actor.refusedAt,
  leanTarget: (actor) => (actor.leanTarget === undefined ? undefined : copy(actor.leanTarget)),
  searchAnchor: (actor) => (actor.searchAnchor === undefined ? undefined : [...actor.searchAnchor]),
  searchTimer: (actor) => actor.searchTimer,
  searchStrolling: (actor) => actor.searchStrolling,
  searchHeading: (actor) => [...actor.searchHeading],
  strollHeading: (actor) => [...actor.strollHeading],
  obstacleWanderHeading: (actor) =>
    actor.obstacleWanderHeading === undefined ? undefined : ([...actor.obstacleWanderHeading] as Vec3),
  obstacleWanderRemaining: (actor) => actor.obstacleWanderRemaining,
  obstacleSlideSide: (actor) => actor.obstacleSlideSide,
  bodyLookTarget: (actor) => actor.bodyLookTarget,
  headYawTarget: (actor) => actor.headYawTarget,
  lookTimer: (actor) => actor.lookTimer,
  lastPerceived: (actor) => (actor.lastPerceived === undefined ? undefined : [...actor.lastPerceived]),
  stimulusAt: (actor) => actor.stimulusAt,
  lastAlertAt: (actor) => actor.lastAlertAt,
} satisfies { [K in keyof SavedAgentState]-?: (actor: AgentState) => SavedAgentState[K] };
const actorSnapshotProjectors = {
  agent: (actor) =>
    actor.agent === undefined ? undefined : (projectSnapshot(actor.agent, agentSnapshotProjectors) as SavedAgentState),
  type: (actor) => actor.type.id,
  body: (actor) => ({ ...actor.body, pos: [...actor.body.pos], vel: [...actor.body.vel] }),
  facing: (actor) => [...actor.facing],
  dismemberRng: (actor) => [...actor.dismemberRng.state()] as RngState,
  spitRng: (actor) => [...actor.spitRng.state()] as RngState,
  horizontalSpeed: (actor) => actor.horizontalSpeed,
  obstacleContact: (actor) => actor.obstacleContact,
  headYaw: (actor) => actor.headYaw,
  swayValue: (actor) => actor.swayValue,
  swayStart: (actor) => actor.swayStart,
  swayTarget: (actor) => actor.swayTarget,
  swayElapsed: (actor) => actor.swayElapsed,
  swayDuration: (actor) => actor.swayDuration,
  lurchValue: (actor) => actor.lurchValue,
  lurchStart: (actor) => actor.lurchStart,
  lurchTarget: (actor) => actor.lurchTarget,
  lurchElapsed: (actor) => actor.lurchElapsed,
  lurchDuration: (actor) => actor.lurchDuration,
  stumbleFactor: (actor) => actor.stumbleFactor,
  stumbleElapsed: (actor) => actor.stumbleElapsed,
  stumbleDuration: (actor) => actor.stumbleDuration,
  regions: (actor) => ({ ...actor.regions }),
  figureSeed: (actor) => actor.figureSeed,
  incapacitated: (actor) => actor.incapacitated,
  attackWait: (actor) => actor.attackWait,
  attackWindup: (actor) => actor.attackWindup,
  spitWindup: (actor) => actor.spitWindup,
  staggerSimSeconds: (actor) => actor.staggerSimSeconds,
  spitWait: (actor) => actor.spitWait,
  gaitPhase: (actor) => actor.gaitPhase,
  footstepClock: (actor) => ({ ...actor.footstepClock }),
  wanderClock: (actor) => actor.wanderClock,
  stanceWeight: (actor) => actor.stanceWeight,
  stepOffset: (actor) => actor.stepOffset,
  hitFlinchTime: (actor) => actor.hitFlinchTime,
  severed: (actor) => [...actor.severed],
  carved: (actor) => [...actor.carved],
  chaseStance: (actor) => actor.chaseStance,
} satisfies ActorSnapshotProjectors;

export const snapshotActor = (id: number, actor: Actor): { id: number; actor: ActorSnapshot } => ({
  id,
  actor: projectSnapshot(actor, actorSnapshotProjectors) as ActorSnapshot,
});
