import { templateByName } from '@mobgen/core/template.ts';
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { flinchClipFor, HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import {
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
import type { ActorFigure } from './actorFigure.ts';
import { type ActorFigureFile, type ActorFigureFiles, actorFigure } from './actorFigureFiles.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';
import type { Actor } from './actorState.ts';
import { applyPoint, IDENTITY_M, type Mat3, mulMM, mulMV, rotX, rotY, rotZ } from './boneMath.ts';
import type { Bone } from './bones.ts';
import { severedBoneSet } from './boneTree.ts';
import type { Vec3 } from './coords.ts';
import { fusedMassFigure, fusedMassSeveredBones } from './fusedMassFigure.ts';
import { clampJointAngles, jointAngles, jointRotation } from './joints.ts';
import { boneTransforms, type Pose } from './pose.ts';
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
   * The built body and clips the pose composes over. A fused mass still generates its pose and figure, since
   * its built idle holds only the rest pose and none of its flinch.
   */
  readonly figure: ActorFigureFile;
  readonly id?: number;
  readonly seed: number;
  readonly model?: string;
  readonly crawling?: boolean;
  /** Authored scale for the fused-mass generated body. */
  readonly bodyScale?: number;
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

export const actorCrawls = (actor: Actor): boolean => {
  const template = templateByName(bodyPlanModel(figureVariantOf(actor.type)));
  // Authored leg cuts already shape locomotion; they are not injuries requiring a speed cap.
  if (template.bodyPlan !== 'humanoid' || template.legCut !== undefined) {
    return false;
  }
  if (actor.regions.leftLeg! <= 0 || actor.regions.rightLeg! <= 0) {
    return true;
  }
  if (actor.severed.length === 0) {
    return false;
  }
  const { severableParts } = templateFigure(bodyPlanModel(figureVariantOf(actor.type)), actor.figureSeed);
  return [...severableParts.leftLeg, ...severableParts.rightLeg].some((part) => actor.severed.includes(part));
};

/**
 * The gait phase gained over a distance. An actor moving on its crawl set advances one cycle per its crawl walk's
 * stride (`packages/deadvox/DESIGN.md`, "Clocks and units"); a standing gait advances half a cycle per step length,
 * which footsteps also count.
 */
export const gaitPhaseGain = (actor: Actor, { clips }: ActorFigureFile, travelledMetres: number): number => {
  if (clips.standing !== undefined && !actorCrawls(actor)) {
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
  return {
    figure: actorFigure(actorFigureFiles, actor.type, actor.figureSeed),
    id,
    seed: actor.figureSeed,
    model: figureVariantOf(actor.type),
    crawling: actorCrawls(actor),
    ...(actor.type.bodyScale === undefined ? {} : { bodyScale: actor.type.bodyScale }),
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
    severed: actor.severed,
    blockSize,
  };
};

export interface PosedActor {
  readonly pose: Pose;
  readonly transforms: ReturnType<typeof boneTransforms>;
  readonly bones: readonly Bone[];
  readonly figure: ActorFigure;
  readonly hidden: ReadonlySet<string>;
  readonly yaw: Mat3;
  readonly position: Vec3;
  readonly blockSize: number;
}

// ---- built clip lookup ----

type ClipSet = NonNullable<ActorClips['standing']>;
type Locomotion = 'standing' | 'crawling';

const figureKeyOf = ({ body }: ActorFigureFile): string => actorFigureKey(body.type, body.seed);

/** The clip set the pose reads: a legless body and an injured standing one move on their crawl set. */
const locomotionOf = (input: ActorPoseInput): Locomotion =>
  input.crawling || input.figure.clips.standing === undefined ? 'crawling' : 'standing';

const clipSetOf = (input: ActorPoseInput, locomotion: Locomotion): ClipSet => {
  const set = input.figure.clips[locomotion];
  if (!set) {
    throw new Error(`Actor figure ${figureKeyOf(input.figure)} has no ${locomotion} clips`);
  }
  return set;
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
}): { readonly duration: number; readonly hitTime: number } => {
  if (durationSimSeconds === undefined || hitAtSimSeconds === undefined) {
    throw new Error('An attack clip needs durationSimSeconds and hitAtSimSeconds');
  }
  return { duration: durationSimSeconds, hitTime: hitAtSimSeconds };
};

/** Stable per-entity hit-flinch side; shared by render and simulation pose generation. */
export const flinchSideForId = (id: number): number => {
  let h = (id ^ 0x5b_ad_c0_de) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return (h % 2000) / 1000 - 1;
};

const fusedMassHitFlinchPose = (pose: Pose, time: number, id: number): Pose => {
  const peak = HIT_FLINCH.keys[1]!;
  const chest = peak.rotations.chest!;
  const recovery = (HIT_FLINCH.duration - time) / (HIT_FLINCH.duration - peak.t);
  const snap = time <= peak.t ? time / peak.t : recovery;
  const weight = Math.max(0, Math.min(1, snap));
  const eased = weight * weight * (3 - 2 * weight);
  const side = flinchSideForId(id);
  return {
    ...pose,
    rotations: {
      ...pose.rotations,
      core: mulMM(mulMM(pose.rotations.core ?? IDENTITY_M, rotX(chest[0] * eased)), rotZ(chest[2] * side * eased)),
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

/** Humanoid clip time: the wind-up ends on the hit, so a short wind-up starts the clip part way through. */
const humanoidAttackTimeFor = (input: ActorPoseInput, clip: OverlayClip): number | undefined => {
  const elapsed = attackElapsed(input);
  if (elapsed === undefined) {
    return undefined;
  }
  const { duration, hitTime } = timingOf(clip);
  const time = Math.max(0, hitTime - input.attackWindupSeconds) + elapsed;
  return time <= duration ? time : undefined;
};

/** Acid clip time: the wind-up covers the clip up to its peak, then the clip runs out in real time. */
const acidAttackTimeFor = (input: ActorPoseInput, clip: JointDeltaClip): number | undefined => {
  const elapsed = attackElapsed(input);
  if (elapsed === undefined) {
    return undefined;
  }
  const { duration, hitTime: peak } = timingOf(clip);
  const windup = input.attackWindupSeconds;
  const time = elapsed < windup ? (peak * elapsed) / windup : peak + elapsed - windup;
  return time <= duration ? time : undefined;
};

const STANCE_CROSSFADE_SECONDS = 0.5;

export const targetStanceWeight = (input: ActorPoseInput): number => {
  if (input.chasing || input.attackWindup > 0) {
    return 1;
  }
  const model = bodyPlanModel(input.model ?? 'humanoid');
  if (model === 'fused-mass') {
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

const yawOf = (facing: Vec3): Mat3 => rotY((Math.atan2(-facing[0], -facing[2]) * 180) / Math.PI);

const withHeadYaw = (
  pose: Pose,
  headId: string,
  headYaw: number,
  clamp: (rotation: Mat3) => Mat3 = (rotation) => rotation,
): Pose =>
  headYaw === 0
    ? pose
    : {
        ...pose,
        rotations: {
          ...pose.rotations,
          [headId]: clamp(mulMM(pose.rotations[headId] ?? IDENTITY_M, rotY((headYaw * 180) / Math.PI))),
        },
      };

/** Simulation gaze lands on framed joints after the action layers, so it is clamped like them: hit boxes and
 * the spit anchor must stay inside the bone's articulated limits. */
const clampedJointRotation = (bone: Bone, rotation: Mat3): Mat3 =>
  bone.frame && bone.limits ? jointRotation(bone, clampJointAngles(bone, jointAngles(bone, rotation))) : rotation;

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
  const gazed = withHeadYaw(attacked, 'head', input.headYaw);
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

const headBoneOf = (body: ActorBody): string => {
  const head = body.lookAt?.headBone;
  if (head === undefined) {
    throw new Error(`Actor body ${body.type} has no look-at head bone`);
  }
  return head;
};

const acidPose = (input: ActorPoseInput, bones: ReadonlyMap<string, Bone>): Pose => {
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
  const headId = headBoneOf(body);
  const head = bones.get(headId)!;
  const gazed = withHeadYaw(drawn, headId, input.headYaw, (rotation) => clampedJointRotation(head, rotation));
  return input.hitFlinchTime === undefined
    ? gazed
    : applyJointDelta(body, gazed, clipOf(set, 'hit', 'jointDelta'), input.hitFlinchTime, motion);
};

// The built fused-mass clips hold only its rest pose, and its flinch and figure are not built, so it generates.
const posedFusedMass = (input: ActorPoseInput): PosedActor => {
  if (input.bodyScale === undefined) {
    throw new Error('Fused-mass pose is missing its authored bodyScale');
  }
  const figure = fusedMassFigure(input.seed, input.bodyScale);
  const { bones } = figure.realized.body;
  const basePose: Pose = {
    root: figure.originOffset.map((coordinate) => coordinate / figure.scale) as Vec3,
    rotations: {},
  };
  const pose =
    input.hitFlinchTime === undefined
      ? basePose
      : fusedMassHitFlinchPose(basePose, input.hitFlinchTime, input.id ?? input.seed);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure,
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
  const anchor = posed.figure.realized.body.anchors?.mouth ?? { bone: highest.id, position: highest.tail };
  const scale = 'scale' in posed.figure && typeof posed.figure.scale === 'number' ? posed.figure.scale : 1;
  const local = applyPoint(posed.transforms.get(anchor.bone)!, anchor.position);
  const world = mulMV(posed.yaw, [local[0] * scale, local[1] * scale, local[2] * scale]);
  return [
    posed.position[0] + world[0] / posed.blockSize,
    posed.position[1] + world[1] / posed.blockSize,
    posed.position[2] + world[2] / posed.blockSize,
  ];
};

/**
 * The shared living-actor pose source. Rendering and hit-region FK consume the same simulation-driven pose,
 * composed from the built clips; `figure`, its bones and the transforms over them stay the generated
 * realization the renderer draws.
 */
export const posedActor = (input: ActorPoseInput): PosedActor => {
  const model = bodyPlanModel(input.model ?? 'humanoid');
  if (model === 'fused-mass') {
    return posedFusedMass(input);
  }
  const figure = templateFigure(model, input.seed);
  const { bones } = figure.realized.body;
  const pose = model === 'acid' ? acidPose(input, new Map(bones.map((bone) => [bone.id, bone]))) : humanoidPose(input);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure,
    hidden: severedBoneSet(bones, input.severed),
    yaw: yawOf(input.facing),
    position: input.position,
    blockSize: input.blockSize,
  };
};

export const HIT_FLINCH_DURATION = HIT_FLINCH.duration;

export const actorHitFlinchDuration = (model: string): number => {
  if (model === 'fused-mass') {
    return HIT_FLINCH_DURATION;
  }
  if (model === 'acid') {
    return acidTemplate.animation.hitDuration;
  }
  const template = templateByName(bodyPlanModel(model));
  return template.legCut === undefined ? flinchClipFor(template).duration : HIT_FLINCH_DURATION;
};
