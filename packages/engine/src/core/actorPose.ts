import {
  applyHeadYaw,
  applyJointDelta,
  applyMotion,
  applyOverlay,
  decodeFrame,
  idleBase,
  sampleClip,
  stanceFit,
  stanceMotion,
  walkCursor,
  walkToIdle,
} from './actorClips.ts';
import { type ActorFigureFile, type ActorFigureFiles, actorFigure } from './actorFigureFiles.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';
import type { Actor } from './actorState.ts';
import { applyPoint, IDENTITY_M, type Mat3, mulMM, mulMV, rotX, rotY, rotZ } from './boneMath.ts';
import { type Bone, bodySkeleton } from './bones.ts';
import { severedBoneSet } from './boneTree.ts';
import type { Vec3 } from './coords.ts';
import { fusedMassSeveredBones } from './fusedMassFigure.ts';
import { crawlsAfterLegLoss, type LeaperGait, type LostLegs, leaperGaitOf, lostLegs } from './legLoss.ts';
import { blendPose, boneTransforms, type Pose } from './pose.ts';
import {
  type ActorBody,
  type ActorClips,
  actorFigureKey,
  type HumanoidIdle,
  type JointDeltaClip,
  type OverlayClip,
  type PoseClip,
} from './schema/actors.ts';

export interface ActorPoseInput {
  /**
   * The built body and clips the pose composes over. A fused mass takes its flinch from the body's `animation`,
   * since its built idle holds only the rest pose.
   */
  readonly figure: ActorFigureFile;
  readonly id?: number;
  readonly seed: number;
  readonly model?: string;
  readonly crawling?: boolean;
  /** Simulation position in block units. */
  readonly position: Vec3;
  readonly facing: Vec3;
  readonly headYaw: number;
  readonly gaitPhase: number;
  readonly speed: number;
  readonly chasing: boolean;
  readonly attackWindup: number;
  readonly attackWindupSeconds: number;
  /** Optional persisted cooldown phase; when supplied, it drives the attack clip even after windup cancellation. */
  readonly attackWait?: number;
  readonly attackCooldown?: number;
  /** Simulation-clock-backed idle motion. */
  readonly idleTime?: number;
  /** Fixed-step cross-fade from slack (0) to aggravated (1); omitted in older saves. */
  readonly stanceWeight?: number;
  /** Fixed-step hit reaction; omitted only for older snapshots/tests. */
  readonly hitFlinchTime?: number;
  /** Share of a spit wind-up elapsed, 0 to 1; draws the head back on a body with a wind-up pose. */
  readonly spitProgress?: number;
  /** Sim seconds into a pounce; omitted while not pouncing. */
  readonly pounceSimSeconds?: number;
  /** The legs it has lost; a leaper's gait reads them, and omitted means none. */
  readonly lostLegs?: LostLegs;
  readonly severed: readonly string[];
  readonly blockSize: number;
}

export interface PoseRootOverride {
  readonly position: Vec3;
  readonly facing: Vec3;
  readonly headYaw: number;
}

/** Share of the wind-up elapsed, 0 when not winding up; presentation reads it for the sac glow and head pull. */
export const acidSpitWindupProgress = (actor: Actor): number => {
  const spit = actor.type.acidSpit;
  return spit && actor.spitWindup > 0 ? 1 - actor.spitWindup / spit.windupSimSeconds : 0;
};

/** Whether an actor moves on its crawl set; `body` is its built figure's body. */
export const actorCrawls = (actor: Actor, body: Pick<ActorBody, 'bodyPlan' | 'legCut' | 'severableParts'>): boolean => {
  // Authored leg cuts already shape locomotion; they are not injuries requiring a speed cap.
  if (!crawlsAfterLegLoss(body)) {
    return false;
  }
  const { left, right } = lostLegs(actor, body);
  return left || right;
};

/** Whether leg loss holds an actor to its crawl speed: a crawling humanoid, or a leaper on a limp or a drag. */
export const actorHobbled = (
  actor: Actor,
  body: Pick<ActorBody, 'bodyPlan' | 'legCut' | 'severableParts'>,
): boolean => {
  if (body.bodyPlan !== 'leaper') {
    return actorCrawls(actor, body);
  }
  return leaperGaitOf(lostLegs(actor, body)).set !== 'standing';
};

/**
 * The gait phase gained over a distance. An actor moving on its crawl set advances one cycle per its crawl walk's
 * stride (`packages/deadvox/DESIGN.md`, "Clocks and units"); a standing gait advances half a cycle per step length,
 * which footsteps also count.
 */
export const gaitPhaseGain = (actor: Actor, { body, clips }: ActorFigureFile, travelledMetres: number): number => {
  if (body.bodyPlan === 'leaper') {
    const walk = leaperWalkOf(clips, leaperGaitOf(lostLegs(actor, body)), actor.chaseStance);
    return (travelledMetres / walk.strideMetres!) * 2 * Math.PI;
  }
  if (clips.standing !== undefined && !actorCrawls(actor, body)) {
    return (travelledMetres / actor.type.stepLength) * Math.PI;
  }
  const walk = clips.crawling?.walk;
  if (!(walk && 'kind' in walk && walk.kind === 'pose' && walk.strideMetres !== undefined)) {
    throw new Error(`Actor figure ${actorFigureKey(actor.type.id, actor.figureSeed)} crawls without a crawl walk`);
  }
  return (travelledMetres / walk.strideMetres) * 2 * Math.PI;
};

/** What every actor of one world poses against: its block scale and the built figures it loaded. */
export interface ActorPoseScene {
  readonly blockSize: number;
  readonly actorFigureFiles: ActorFigureFiles;
}

export const actorPoseInputFor = (
  actor: Actor,
  id: number,
  { blockSize, actorFigureFiles }: ActorPoseScene,
  root?: PoseRootOverride,
): ActorPoseInput => {
  const position = root?.position ?? actor.body.pos;
  const figure = actorFigure(actorFigureFiles, actor.type, actor.figureSeed);
  return {
    figure,
    id,
    seed: actor.figureSeed,
    model: figureVariantOf(actor.type),
    crawling: actorCrawls(actor, figure.body),
    position: [position[0], position[1] + (actor.stepOffset ?? 0) / blockSize, position[2]],
    facing: root?.facing ?? actor.facing,
    headYaw: root?.headYaw ?? actor.headYaw,
    gaitPhase: actor.gaitPhase,
    speed: actor.horizontalSpeed,
    chasing: actor.chaseStance,
    attackWindup: actor.attackWindup,
    attackWindupSeconds: actor.type.attack?.windupSimSeconds ?? 0,
    attackWait: actor.attackWait,
    attackCooldown: actor.type.attack?.cooldownSimSeconds ?? 0,
    idleTime: actor.wanderClock,
    ...(actor.stanceWeight === undefined ? {} : { stanceWeight: actor.stanceWeight }),
    ...(actor.hitFlinchTime === undefined ? {} : { hitFlinchTime: actor.hitFlinchTime }),
    ...(actor.spitWindup > 0 ? { spitProgress: acidSpitWindupProgress(actor) } : {}),
    ...(actor.pounceSimSeconds === undefined ? {} : { pounceSimSeconds: actor.pounceSimSeconds }),
    lostLegs: lostLegs(actor, figure.body),
    severed: actor.severed,
    blockSize,
  };
};

export interface PosedActor {
  readonly pose: Pose;
  readonly transforms: ReturnType<typeof boneTransforms>;
  readonly bones: readonly Bone[];
  readonly hidden: ReadonlySet<string>;
  readonly yaw: Mat3;
  readonly position: Vec3;
  readonly blockSize: number;
}

// ---- built clip lookup ----

type ClipSet = NonNullable<ActorClips['standing']>;
type Locomotion = 'standing' | 'crawling';
type ClipSetName = keyof ActorClips;

const figureKeyOf = ({ body }: ActorFigureFile): string => actorFigureKey(body.type, body.seed);

/** The clip set the pose reads: a legless body and an injured standing one move on their crawl set. */
const locomotionOf = (input: ActorPoseInput): Locomotion =>
  input.crawling || input.figure.clips.standing === undefined ? 'crawling' : 'standing';

const clipSetOf = (input: ActorPoseInput, locomotion: ClipSetName): ClipSet => {
  const set = input.figure.clips[locomotion];
  if (!set) {
    throw new Error(`Actor figure ${figureKeyOf(input.figure)} has no ${locomotion} clips`);
  }
  return set;
};

/** A leaper's locomotion loop: walk or run on its standing set, else its injury set's walk. */
const leaperWalkOf = (clips: ActorClips, gait: LeaperGait, chasing: boolean): PoseClip => {
  const set = clips[gait.set];
  if (!set) {
    throw new Error(`A leaper figure has no ${gait.set} clips`);
  }
  if (gait.set !== 'limping') {
    return clipOf(set, gait.set === 'standing' && chasing ? 'run' : 'walk', 'pose');
  }
  const sided = set.walk;
  if (!(sided && 'left' in sided)) {
    throw new Error('A limping walk needs a clip per side');
  }
  return sided[gait.side];
};

const clipOf = <K extends 'pose' | 'overlay' | 'jointDelta'>(
  set: ClipSet,
  name: string,
  kind: K,
): Extract<PoseClip | OverlayClip | JointDeltaClip, { kind: K }> => {
  const entry = set[name];
  if (!(entry && 'kind' in entry && entry.kind === kind)) {
    throw new Error(`Clip ${name} is not a ${kind} clip`);
  }
  return entry as Extract<PoseClip | OverlayClip | JointDeltaClip, { kind: K }>;
};

const stanceIdleOf = (set: ClipSet): HumanoidIdle => {
  const entry = set.idle;
  if (!(entry && 'slack' in entry)) {
    throw new Error('Clip idle is not a stance idle');
  }
  return entry;
};

/** A finite clip's timing; the producer writes both fields on every clip this module times. */
const timingOf = ({
  durationSimSeconds,
  hitAtSimSeconds,
}: {
  readonly durationSimSeconds?: number | undefined;
  readonly hitAtSimSeconds?: number | undefined;
}): { readonly durationSimSeconds: number; readonly hitAtSimSeconds: number } => {
  if (durationSimSeconds === undefined || hitAtSimSeconds === undefined) {
    throw new Error('An attack clip needs durationSimSeconds and hitAtSimSeconds');
  }
  return { durationSimSeconds, hitAtSimSeconds };
};

/** Stable per-entity hit-flinch side; shared by render and simulation pose generation. */
export const flinchSideForId = (id: number): number => {
  let h = (id ^ 0x5b_ad_c0_de) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return (h % 2000) / 1000 - 1;
};

type FusedMassFlinch = Extract<ActorBody['animation'], { flinch: unknown }>['flinch'];

/** The fused-mass body's own flinch timing and peak tilt; a body of another plan has none. */
const fusedMassFlinchOf = ({ body }: ActorFigureFile): FusedMassFlinch => {
  if (!('flinch' in body.animation)) {
    throw new Error(`Actor figure ${actorFigureKey(body.type, body.seed)} has no fused-mass flinch`);
  }
  return body.animation.flinch;
};

const fusedMassHitFlinchPose = (pose: Pose, time: number, id: number, flinch: FusedMassFlinch): Pose => {
  const { peakAtSimSeconds: peak, durationSimSeconds: duration } = flinch;
  const recovery = (duration - time) / (duration - peak);
  const snap = time <= peak ? time / peak : recovery;
  const weight = Math.max(0, Math.min(1, snap));
  const eased = weight * weight * (3 - 2 * weight);
  const side = flinchSideForId(id);
  return {
    ...pose,
    rotations: {
      ...pose.rotations,
      core: mulMM(
        mulMM(pose.rotations.core ?? IDENTITY_M, rotX(flinch.pitch * eased)),
        rotZ(flinch.roll * side * eased),
      ),
    },
  };
};

/** Seconds since the attack began, from the persisted cooldown when supplied, else from the wind-up. */
const attackElapsed = ({
  attackWait,
  attackCooldown,
  attackWindup,
  attackWindupSeconds,
}: ActorPoseInput): number | undefined => {
  if (attackWait !== undefined && attackCooldown !== undefined) {
    return attackWait > 0 ? Math.max(0, attackCooldown - attackWait) : undefined;
  }
  return attackWindup > 0 ? attackWindupSeconds - attackWindup : undefined;
};

/**
 * Humanoid and leaper clip time: the wind-up ends on the hit, so a short wind-up starts the clip part way through.
 */
const humanoidAttackTimeFor = (input: ActorPoseInput, clip: OverlayClip | PoseClip): number | undefined => {
  const elapsed = attackElapsed(input);
  if (elapsed === undefined) {
    return undefined;
  }
  const { durationSimSeconds, hitAtSimSeconds } = timingOf(clip);
  const time = Math.max(0, hitAtSimSeconds - input.attackWindupSeconds) + elapsed;
  return time <= durationSimSeconds ? time : undefined;
};

/** Acid clip time: the wind-up covers the clip up to its peak, then the clip runs on at the attack's Sim pace. */
const acidAttackTimeFor = (input: ActorPoseInput, clip: JointDeltaClip): number | undefined => {
  const elapsed = attackElapsed(input);
  if (elapsed === undefined) {
    return undefined;
  }
  const { durationSimSeconds, hitAtSimSeconds: peak } = timingOf(clip);
  const windup = input.attackWindupSeconds;
  const time = elapsed < windup ? (peak * elapsed) / windup : peak + elapsed - windup;
  return time <= durationSimSeconds ? time : undefined;
};

const STANCE_CROSSFADE_SECONDS = 0.5;

export const targetStanceWeight = (input: ActorPoseInput): number => {
  if (input.chasing || input.attackWindup > 0) {
    return 1;
  }
  const model = bodyPlanModel(input.model ?? 'humanoid');
  // Neither body has a stance idle to cross-fade.
  if (model === 'fused-mass' || model === 'leaper') {
    return 0;
  }
  const set = clipSetOf(input, locomotionOf(input));
  const attackTime =
    model === 'acid'
      ? acidAttackTimeFor(input, clipOf(set, 'attack', 'jointDelta'))
      : humanoidAttackTimeFor(input, clipOf(set, 'attack', 'overlay'));
  return attackTime === undefined ? 0 : 1;
};

export const advanceStanceWeight = (current: number, target: number, dt: number): number => {
  if (dt <= 0) {
    return current;
  }
  const delta = target - current;
  const maxDelta = dt / STANCE_CROSSFADE_SECONDS;
  return Math.abs(delta) <= maxDelta + 1e-12 ? target : current + Math.sign(delta) * maxDelta;
};

// ---- composition ----

/** Actor files face +z, so the yaw turns +z onto `facing`. */
const yawOf = (facing: Vec3): Mat3 => rotY((Math.atan2(facing[0], facing[2]) * 180) / Math.PI);

/** A standing body's walk cross-faded into its stance-blended idle, which it holds exactly at rest. */
const standingLocomotion = (set: ClipSet, input: ActorPoseInput): Pose => {
  const idle = stanceIdleOf(set);
  const stanceWeight = input.stanceWeight ?? targetStanceWeight(input);
  const idlePose = applyMotion(
    idleBase(idle, stanceWeight),
    stanceMotion(idle, stanceWeight),
    input.idleTime ?? 0,
    input.id ?? input.seed,
  );
  if (input.speed <= 0) {
    return idlePose;
  }
  const walk = clipOf(set, 'walk', 'pose');
  if (walk.idleBlendSpeed === undefined) {
    throw new Error('A standing walk needs idleBlendSpeed');
  }
  return walkToIdle(walkFrame(input, walk, 'standing'), idlePose, input.speed, walk.idleBlendSpeed);
};

/**
 * A walk clip's pose at the input's gait phase; the producer states the cycles every walk spans. Between stored
 * frames the root is refitted to the slerped rotations, so an overlay's own fit leaves an unchanged walk where it is.
 */
const walkFrame = ({ figure: { body }, gaitPhase }: ActorPoseInput, walk: PoseClip, stance: Locomotion): Pose => {
  if (walk.cycles === undefined) {
    throw new Error('A walk clip needs cycles');
  }
  const { root, rotations } = decodeFrame(sampleClip(walk, walkCursor(gaitPhase, walk.cycles)));
  return { root: [root[0], stanceFit(body, root, rotations, stance), root[2]], rotations };
};

const crawlingLocomotion = (set: ClipSet, input: ActorPoseInput): Pose =>
  input.speed <= 0
    ? decodeFrame(sampleClip(clipOf(set, 'idle', 'pose'), 0))
    : walkFrame(input, clipOf(set, 'walk', 'pose'), 'crawling');

const humanoidPose = (input: ActorPoseInput): Pose => {
  const { body } = input.figure;
  const locomotion = locomotionOf(input);
  const set = clipSetOf(input, locomotion);
  const walked = locomotion === 'standing' ? standingLocomotion(set, input) : crawlingLocomotion(set, input);
  const attackClip = clipOf(set, 'attack', 'overlay');
  const attackTime = humanoidAttackTimeFor(input, attackClip);
  const attacked =
    attackTime === undefined ? walked : applyOverlay(body, walked, attackClip, attackTime, 0, locomotion);
  const gazed = applyHeadYaw(body, attacked, input.headYaw);
  return input.hitFlinchTime === undefined
    ? gazed
    : applyOverlay(
        body,
        gazed,
        clipOf(set, 'flinch', 'overlay'),
        input.hitFlinchTime,
        flinchSideForId(input.id ?? 0),
        locomotion,
      );
};

/** Sim seconds over which a leaper's finite clip fades in from its locomotion and back out to it. */
const LEAPER_ACTION_BLEND_SECONDS = 0.12;

const leaperLocomotion = (input: ActorPoseInput): Pose => {
  const { clips } = input.figure;
  const gait = leaperGaitOf(input.lostLegs ?? { left: false, right: false });
  if (gait.set === 'standing' && input.speed <= 0) {
    const idle = clipOf(clipSetOf(input, 'standing'), 'idle', 'pose');
    return decodeFrame(sampleClip(idle, (input.idleTime ?? 0) / idle.periodSimSeconds!));
  }
  const walk = leaperWalkOf(clips, gait, input.chasing);
  return decodeFrame(sampleClip(walk, walkCursor(input.gaitPhase, walk.cycles!)));
};

interface LeaperAction {
  readonly clip: PoseClip;
  /** Seconds into the clip. */
  readonly clipSimSeconds: number;
  /** Seconds since the action began, which can be less than `clipSimSeconds` when a short wind-up starts the clip late. */
  readonly elapsedSimSeconds: number;
}

/** The finite clip a leaper plays over its locomotion: a pounce, else a rake, else a flinch. */
const leaperActionOf = (input: ActorPoseInput): LeaperAction | undefined => {
  const set = clipSetOf(input, 'standing');
  if (input.pounceSimSeconds !== undefined) {
    return {
      clip: clipOf(set, 'pounce', 'pose'),
      clipSimSeconds: input.pounceSimSeconds,
      elapsedSimSeconds: input.pounceSimSeconds,
    };
  }
  const attack = clipOf(set, 'attack', 'pose');
  const attackTime = humanoidAttackTimeFor(input, attack);
  if (attackTime !== undefined) {
    return { clip: attack, clipSimSeconds: attackTime, elapsedSimSeconds: attackElapsed(input)! };
  }
  if (input.hitFlinchTime !== undefined) {
    return {
      clip: clipOf(set, 'flinch', 'pose'),
      clipSimSeconds: input.hitFlinchTime,
      elapsedSimSeconds: input.hitFlinchTime,
    };
  }
  return undefined;
};

/** A pouncing figure's pounce clip; admission holds it to a leaper's standing set. */
export const pounceClipOf = (figure: ActorFigureFile): PoseClip => {
  const set = figure.clips.standing;
  if (!set) {
    throw new Error(`Actor figure ${figureKeyOf(figure)} has no standing clips`);
  }
  return clipOf(set, 'pounce', 'pose');
};

/** Metres the pounce clip carries its body forward between two clip times; it never carries the body back. */
export const pounceTravelMetres = (figure: ActorFigureFile, from: number, to: number): number => {
  const clip = pounceClipOf(figure);
  const depth = (clipSimSeconds: number): number => sampleClip(clip, clipSimSeconds).root[2];
  return Math.max(0, depth(to) - depth(from)) * figure.body.scale;
};

/** The emission multiplier on a pouncing figure's charged materials: its pounce frame's charge, between frames. */
export const pounceCharge = (figure: ActorFigureFile, pounceSimSeconds: number): number => {
  const { frames, durationSimSeconds } = pounceClipOf(figure);
  const u = (Math.min(Math.max(pounceSimSeconds, 0), durationSimSeconds!) / durationSimSeconds!) * (frames.length - 1);
  const i = Math.min(Math.floor(u), frames.length - 2);
  const a = frames[i]!.charge ?? 1;
  const b = frames[i + 1]!.charge ?? 1;
  return a + (b - a) * (u - i);
};

/**
 * A finite clip keeps its baked travel, but the simulation moves the body, so the pose holds the clip's starting
 * depth (`packages/deadvox/docs/leaper.md`, "Travel").
 */
const leaperActionPose = ({ clip, clipSimSeconds }: LeaperAction): Pose => {
  const { root, rotations } = decodeFrame(sampleClip(clip, clipSimSeconds));
  return { root: [root[0], root[1], clip.frames[0]!.root[2]], rotations };
};

const leaperPose = (input: ActorPoseInput): Pose => {
  const walked = leaperLocomotion(input);
  const action = leaperActionOf(input);
  const acted =
    action === undefined
      ? walked
      : blendPose(
          walked,
          leaperActionPose(action),
          Math.min(
            1,
            Math.max(0, Math.min(action.elapsedSimSeconds, action.clip.durationSimSeconds! - action.clipSimSeconds)) /
              LEAPER_ACTION_BLEND_SECONDS,
          ),
        );
  return applyHeadYaw(input.figure.body, acted, input.headYaw);
};

const acidPose = (input: ActorPoseInput): Pose => {
  const { body } = input.figure;
  const set = clipSetOf(input, 'standing');
  const idle = clipOf(set, 'idle', 'pose');
  if (idle.periodSimSeconds === undefined) {
    throw new Error('An acid idle needs periodSimSeconds');
  }
  const base = decodeFrame(sampleClip(idle, (input.idleTime ?? 0) / idle.periodSimSeconds));
  const motion = { speed: input.speed, side: flinchSideForId(input.id ?? 0) };
  const walked = applyJointDelta(body, base, clipOf(set, 'walk', 'jointDelta'), input.gaitPhase, motion);
  const attackClip = clipOf(set, 'attack', 'jointDelta');
  const attackTime = acidAttackTimeFor(input, attackClip);
  const attacked = attackTime === undefined ? walked : applyJointDelta(body, walked, attackClip, attackTime, motion);
  const progress = input.spitProgress ?? 0;
  const drawn =
    progress > 0 ? applyJointDelta(body, attacked, clipOf(set, 'spitDraw', 'jointDelta'), progress, motion) : attacked;
  const gazed = applyHeadYaw(body, drawn, input.headYaw);
  return input.hitFlinchTime === undefined
    ? gazed
    : applyJointDelta(body, gazed, clipOf(set, 'hit', 'jointDelta'), input.hitFlinchTime, motion);
};

// The built fused-mass clips hold only its rest pose, so it composes rest and its body's flinch.
const posedFusedMass = (input: ActorPoseInput): PosedActor => {
  const figure = input.figure.fusedMass;
  if (!figure) {
    throw new Error(`Actor figure ${figureKeyOf(input.figure)} has no fused-mass figure`);
  }
  const { bones } = figure;
  const basePose: Pose = {
    root: figure.originOffset.map((coordinate) => coordinate / figure.scale) as Vec3,
    rotations: {},
  };
  const pose =
    input.hitFlinchTime === undefined
      ? basePose
      : fusedMassHitFlinchPose(basePose, input.hitFlinchTime, input.id ?? input.seed, fusedMassFlinchOf(input.figure));
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    hidden: fusedMassSeveredBones(figure, input.severed),
    yaw: yawOf(input.facing),
    position: input.position,
    blockSize: input.blockSize,
  };
};

/**
 * The posed mouth anchor in block units: where a spit leaves. A body without one spits from the top of its
 * highest bone, so any body given the ability still has a mouth line.
 */
export const posedMouth = (input: ActorPoseInput): Vec3 => {
  const posed = posedActor(input);
  const highest = posed.bones.reduce((top, bone) => (bone.tail[1] > top.tail[1] ? bone : top));
  const { anchors, scale } = input.figure.body;
  const anchor = anchors.mouth ?? { bone: highest.id, position: highest.tail };
  const local = applyPoint(posed.transforms.get(anchor.bone)!, anchor.position);
  const world = mulMV(posed.yaw, [local[0] * scale, local[1] * scale, local[2] * scale]);
  return [
    posed.position[0] + world[0] / posed.blockSize,
    posed.position[1] + world[1] / posed.blockSize,
    posed.position[2] + world[2] / posed.blockSize,
  ];
};

/** An acid posed over its built body's skeleton; nothing generated. */
const posedAcid = (input: ActorPoseInput): PosedActor => {
  const bones = bodySkeleton(input.figure.body);
  const pose = acidPose(input);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    hidden: severedBoneSet(bones, input.severed),
    yaw: yawOf(input.facing),
    position: input.position,
    blockSize: input.blockSize,
  };
};

/**
 * The shared living-actor pose source. Rendering and hit-region FK consume the same simulation-driven pose,
 * composed from the built clips over the built body's skeleton.
 */
export const posedActor = (input: ActorPoseInput): PosedActor => {
  const model = bodyPlanModel(input.model ?? 'humanoid');
  if (model === 'fused-mass') {
    return posedFusedMass(input);
  }
  if (model === 'acid') {
    return posedAcid(input);
  }
  const bones = bodySkeleton(input.figure.body);
  const pose = model === 'leaper' ? leaperPose(input) : humanoidPose(input);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    hidden: severedBoneSet(bones, input.severed),
    yaw: yawOf(input.facing),
    position: input.position,
    blockSize: input.blockSize,
  };
};

/**
 * How long a hit flinch lasts in Sim seconds, so the flinch clock ends where the pose's recovery does: a fused mass's
 * is its body's flinch, an acid's its built hit clip's span, a leaper's its standing flinch clip's whatever its gait, and a
 * humanoid's its flinch clip's, from the crawl set when it crawls (`legless-humanoid`) or its body is cut at the legs.
 */
export const actorHitFlinchDuration = (model: string, figure: ActorFigureFile): number => {
  if (model === 'fused-mass') {
    return fusedMassFlinchOf(figure).durationSimSeconds;
  }
  if (model === 'leaper') {
    return clipOf(figure.clips.standing!, 'flinch', 'pose').durationSimSeconds!;
  }
  const crawls = model === 'legless-humanoid' || figure.body.legCut !== undefined;
  const set = figure.clips[model === 'acid' || !crawls ? 'standing' : 'crawling'];
  const clip = set && (model === 'acid' ? clipOf(set, 'hit', 'jointDelta') : clipOf(set, 'flinch', 'overlay'));
  const duration = clip?.durationSimSeconds;
  if (duration === undefined) {
    throw new Error(`Actor figure ${figureKeyOf(figure)} has no timed flinch clip`);
  }
  return duration;
};
