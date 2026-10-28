import type { Bone } from '@mobgen/core/body.ts';
import { clampJointAngles, jointAngles, jointRotation } from '@mobgen/core/joints.ts';
import { applyPoint, IDENTITY_M, type Mat3, mulMM, mulMV, rotX, rotY, rotZ } from '@mobgen/core/math.ts';
import { blendPose, boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import { type Template, templateByName } from '@mobgen/core/template.ts';
import { acidAttackPose, acidHitPose, acidStrideLength, acidWalkPose, acidWindupPose } from '@mobgen/mob/acidPoses.ts';
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { type AttackClip, attackClipFor, attackPose } from '@mobgen/mob/attack.ts';
import { crawlerGaitPose, crawlerHitPose, groundCrawlerPose } from '@mobgen/mob/crawler.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { footRestExtents, type GaitClock, type WalkActor, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { applyIdleMotion, type IdleStance, idleBasePose } from '@mobgen/mob/idle.ts';
import { LOOK_AT_PROFILES } from '@mobgen/mob/lookAtProfiles.ts';
import { flinchClipFor, flinchPoseWithClip, HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { zombieFigure as humanoidFigure, type ShamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import { amalgamFigure, amalgamSeveredBones } from './amalgamFigure.ts';
import type { Vec3 } from './coords.ts';
import type { ZombieFigure } from './zombieFigure.ts';
import type { Zombie } from './zombies.ts';

export interface ShamblerPoseInput {
  readonly id?: number;
  readonly seed: number;
  readonly model?: string;
  /** Authored scale for amalgam's generated body. */
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
export const acidSpitWindupProgress = (zombie: Zombie): number => {
  const spit = zombie.type.acidSpit;
  return spit && zombie.spitWindup > 0 ? 1 - zombie.spitWindup / spit.windupSimSeconds : 0;
};

export const zombiePoseInputFor = (
  zombie: Zombie,
  id: number,
  blockSize: number,
  root?: PoseRootOverride,
): ShamblerPoseInput => {
  const position = root?.position ?? zombie.body.pos;
  return {
    id,
    seed: zombie.figureSeed,
    model: zombie.type.model,
    ...(zombie.type.bodyScale === undefined ? {} : { bodyScale: zombie.type.bodyScale }),
    position: [position[0], position[1] + (zombie.stepOffset ?? 0) / blockSize, position[2]],
    facing: root?.facing ?? zombie.facing,
    headYaw: root?.headYaw ?? zombie.headYaw,
    gaitPhase: zombie.gaitPhase,
    speed: zombie.horizontalSpeed,
    chasing: zombie.mode === 'chase',
    attackWindup: zombie.attackWindup,
    attackWindupSeconds: zombie.type.attack.windupSimSeconds,
    attackWait: zombie.attackWait,
    attackCooldown: zombie.type.attack.cooldownSimSeconds,
    idleTime: zombie.wanderClock,
    ...(zombie.stanceWeight === undefined ? {} : { stanceWeight: zombie.stanceWeight }),
    ...(zombie.hitFlinchTime === undefined ? {} : { hitFlinchTime: zombie.hitFlinchTime }),
    ...(zombie.spitWindup > 0 ? { spitProgress: acidSpitWindupProgress(zombie) } : {}),
    severed: zombie.severed,
    blockSize,
  };
};

export interface PosedShambler {
  readonly pose: Pose;
  readonly transforms: ReturnType<typeof boneTransforms>;
  readonly bones: readonly Bone[];
  readonly figure: ZombieFigure;
  readonly hidden: ReadonlySet<string>;
  readonly yaw: Mat3;
  readonly position: Vec3;
  readonly blockSize: number;
}

const actorForFigure = (
  figure: ShamblerFigure,
): {
  actor: WalkActor;
  bones: readonly Bone[];
  idleBases: Readonly<Record<IdleStance, Pose>>;
} => {
  const {
    realized: {
      body: { bones },
      voxels,
    },
    genome,
  } = figure;
  const actor: WalkActor = {
    bones,
    extents: footRestExtents(bones, voxels),
    params: genome.params as HumanoidParams,
    seed: figure.seed,
  };
  return {
    actor,
    bones,
    idleBases: { slack: idleBasePose(actor, 'slack'), aggravated: idleBasePose(actor, 'aggravated') },
  };
};

const actorCache = new Map<string, ReturnType<typeof actorForFigure>>();
const actorForSeed = (model: string, seed: number): ReturnType<typeof actorForFigure> => {
  const key = `${model}:${seed}`;
  let actor = actorCache.get(key);
  if (!actor) {
    actor = actorForFigure(humanoidFigure(model, seed));
    actorCache.set(key, actor);
  }
  return actor;
};

/** Stable per-entity hit-flinch side; shared by render and simulation pose generation. */
export const flinchSideForId = (id: number): number => {
  let h = (id ^ 0x5b_ad_c0_de) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return (h % 2000) / 1000 - 1;
};

const amalgamHitFlinchPose = (pose: Pose, time: number, id: number): Pose => {
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

const attackTimeFor = (
  { attackWait, attackCooldown, attackWindup, attackWindupSeconds }: ShamblerPoseInput,
  clip: AttackClip,
): number | undefined => {
  if (attackWait !== undefined && attackCooldown !== undefined) {
    if (attackWait <= 0) {
      return undefined;
    }
    const elapsed = Math.max(0, attackCooldown - attackWait);
    return Math.max(0, clip.hitTime - attackWindupSeconds) + elapsed;
  }
  return attackWindup > 0
    ? Math.max(0, clip.hitTime - attackWindupSeconds) + attackWindupSeconds - attackWindup
    : undefined;
};

interface ModelPoseContext {
  readonly template: Template;
  readonly figure: ShamblerFigure;
  readonly actor: WalkActor;
}

const withAttackPose = (context: ModelPoseContext, base: Pose, attackTime: number | undefined): Pose => {
  const clip = attackClipFor(context.template);
  if (attackTime === undefined || attackTime > clip.duration) {
    return base;
  }
  const attacked = attackPose(context.actor, clip, attackTime, base);
  return context.template.bodyPlan === 'crawler' ? groundCrawlerPose(context.figure.realized, attacked) : attacked;
};

const withHitFlinch = (context: ModelPoseContext, base: Pose, time: number, side: number): Pose => {
  if (context.template.bodyPlan === 'crawler') {
    return crawlerHitPose(context.figure.realized, base, time, side);
  }
  return flinchPoseWithClip(context.actor, time, base, { clip: flinchClipFor(context.template), side });
};

const STANCE_CROSSFADE_SECONDS = 0.5;

export const targetStanceWeight = (input: ShamblerPoseInput): number => {
  if (input.chasing || input.attackWindup > 0) {
    return 1;
  }
  const model = input.model ?? 'shambler';
  if (model === 'acid') {
    return acidAttackTimeFor(input) === undefined ? 0 : 1;
  }
  if (model === 'amalgam') {
    return 0;
  }
  const clip = attackClipFor(templateByName(model));
  const attackTime = attackTimeFor(input, clip);
  return attackTime !== undefined && attackTime <= clip.duration ? 1 : 0;
};

export const advanceStanceWeight = (current: number, target: number, dt: number): number => {
  if (dt <= 0) {
    return current;
  }
  const delta = target - current;
  const maxDelta = dt / STANCE_CROSSFADE_SECONDS;
  return Math.abs(delta) <= maxDelta + 1e-12 ? target : current + Math.sign(delta) * maxDelta;
};

const posedAmalgam = (input: ShamblerPoseInput): PosedShambler => {
  if (input.bodyScale === undefined) {
    throw new Error('Amalgam pose is missing its authored bodyScale');
  }
  const figure = amalgamFigure(input.seed, input.bodyScale);
  const { bones } = figure.realized.body;
  const basePose: Pose = {
    root: figure.originOffset.map((coordinate) => coordinate / figure.scale) as Vec3,
    rotations: {},
  };
  const pose =
    input.hitFlinchTime === undefined
      ? basePose
      : amalgamHitFlinchPose(basePose, input.hitFlinchTime, input.id ?? input.seed);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure,
    hidden: amalgamSeveredBones(figure, input.severed),
    yaw: rotY((Math.atan2(-input.facing[0], -input.facing[2]) * 180) / Math.PI),
    position: input.position,
    blockSize: input.blockSize,
  };
};

/** Melee clip time: the wind-up covers the clip up to its peak, then the clip runs out in real time. */
const acidAttackTimeFor = (input: ShamblerPoseInput): number | undefined => {
  const { attackPeak, attackDuration } = acidTemplate.animation;
  const timed = input.attackWait !== undefined && input.attackCooldown !== undefined;
  const running = timed ? input.attackWait! > 0 : input.attackWindup > 0;
  if (!running) {
    return undefined;
  }
  const elapsed = timed ? input.attackCooldown! - input.attackWait! : input.attackWindupSeconds - input.attackWindup;
  const time =
    elapsed < input.attackWindupSeconds
      ? (attackPeak * elapsed) / input.attackWindupSeconds
      : attackPeak + elapsed - input.attackWindupSeconds;
  return time > attackDuration ? undefined : time;
};

/** Simulation gaze lands on framed joints after the action layers, so it is clamped like them: hit boxes and
 * the spit anchor must stay inside the bone's articulated limits. */
const clampedJointRotation = (bone: Bone, rotation: Mat3): Mat3 =>
  bone.frame && bone.limits ? jointRotation(bone, clampJointAngles(bone, jointAngles(bone, rotation))) : rotation;

const posedAcid = (input: ShamblerPoseInput, figure: ShamblerFigure): PosedShambler => {
  const { realized } = figure;
  const { bones } = realized.body;
  const distance = (input.gaitPhase / (2 * Math.PI)) * acidStrideLength(realized);
  const walk = acidWalkPose(realized, distance, input.speed, input.idleTime ?? 0);
  const attackTime = acidAttackTimeFor(input);
  const attacked = attackTime === undefined ? walk : acidAttackPose(realized, walk, attackTime);
  const progress = input.spitProgress ?? 0;
  const woundUp = progress > 0 ? acidWindupPose(realized, attacked, progress) : attacked;
  const headId = LOOK_AT_PROFILES.acid?.headBone ?? 'skull';
  const head = bones.find((bone) => bone.id === headId)!;
  const gazed: Pose =
    input.headYaw === 0
      ? woundUp
      : {
          ...woundUp,
          rotations: {
            ...woundUp.rotations,
            [headId]: clampedJointRotation(
              head,
              mulMM(woundUp.rotations[headId] ?? IDENTITY_M, rotY((input.headYaw * 180) / Math.PI)),
            ),
          },
        };
  const pose =
    input.hitFlinchTime === undefined
      ? gazed
      : acidHitPose(realized, gazed, input.hitFlinchTime, flinchSideForId(input.id ?? 0));
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure,
    hidden: severedBoneSet(bones, input.severed),
    yaw: rotY((Math.atan2(-input.facing[0], -input.facing[2]) * 180) / Math.PI),
    position: input.position,
    blockSize: input.blockSize,
  };
};

/**
 * The posed mouth anchor in block units: where a spit leaves. A body without one spits from the top of its
 * highest bone, so any body given the ability still has a mouth line.
 */
export const posedMouth = (input: ShamblerPoseInput): Vec3 => {
  const posed = posedShambler(input);
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

/** The shared living-zombie pose source. Rendering and hit-region FK consume the same simulation-driven pose. */
export const posedShambler = (input: ShamblerPoseInput): PosedShambler => {
  const model = input.model ?? 'shambler';
  if (model === 'amalgam') {
    return posedAmalgam(input);
  }
  const figure = humanoidFigure(model, input.seed);
  if (model === 'acid') {
    return posedAcid(input, figure);
  }
  const { actor, bones, idleBases } = actorForSeed(model, input.seed);
  const phase = ((input.gaitPhase % Math.PI) + Math.PI) % Math.PI;
  const clock: GaitClock = { stepIndex: Math.floor(input.gaitPhase / Math.PI), progress: phase / Math.PI };
  const template = templateByName(model);
  const attackTime = attackTimeFor(input, attackClipFor(template));
  const stanceWeight = input.stanceWeight ?? targetStanceWeight(input);
  const stance: IdleStance = stanceWeight >= 0.5 ? 'aggravated' : 'slack';
  const idle = applyIdleMotion(
    blendPose(idleBases.slack, idleBases.aggravated, stanceWeight),
    stance,
    input.idleTime ?? 0,
    input.id ?? input.seed,
  );
  const walk =
    model === 'crawler'
      ? crawlerGaitPose(figure.realized, input.gaitPhase, input.speed)
      : walkPose(actor, clock, input.speed, { idle });
  const context = { template, figure, actor };
  const basePose = withAttackPose(context, walk, attackTime);
  const headPose: Pose =
    input.headYaw === 0
      ? basePose
      : {
          ...basePose,
          rotations: {
            ...basePose.rotations,
            head: mulMM(basePose.rotations.head ?? IDENTITY_M, rotY((input.headYaw * 180) / Math.PI)),
          },
        };
  const flinchSide = flinchSideForId(input.id ?? 0);
  const pose =
    input.hitFlinchTime === undefined ? headPose : withHitFlinch(context, headPose, input.hitFlinchTime, flinchSide);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure,
    hidden: severedBoneSet(bones, input.severed),
    yaw: rotY((Math.atan2(-input.facing[0], -input.facing[2]) * 180) / Math.PI),
    position: input.position,
    blockSize: input.blockSize,
  };
};

export const HIT_FLINCH_DURATION = HIT_FLINCH.duration;

export const zombieHitFlinchDuration = (model: string): number => {
  if (model === 'amalgam') {
    return HIT_FLINCH_DURATION;
  }
  if (model === 'acid') {
    return acidTemplate.animation.hitDuration;
  }
  const template = templateByName(model);
  return template.bodyPlan === 'crawler' ? HIT_FLINCH_DURATION : flinchClipFor(template).duration;
};
