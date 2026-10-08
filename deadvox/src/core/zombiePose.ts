import type { Bone } from '@mobgen/core/body.ts';
import { IDENTITY_M, type Mat3, mulMM, rotX, rotY, rotZ } from '@mobgen/core/math.ts';
import { blendPose, boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import { attackPose, LUNGE_GRAB } from '@mobgen/mob/attack.ts';
import { crawlerGaitPose, crawlerHitPose, groundCrawlerPose } from '@mobgen/mob/crawler.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { footRestExtents, type GaitClock, type WalkActor, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { applyIdleMotion, type IdleStance, idleBasePose } from '@mobgen/mob/idle.ts';
import { flinchPose, flinchPoseWithClip, HIT_FLINCH, RUNNER_HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { zombieFigure as humanoidFigure, type ShamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import { amalgamFigure } from './amalgamFigure.ts';
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
  readonly severed: readonly string[];
  readonly blockSize: number;
}

export interface PoseRootOverride {
  readonly position: Vec3;
  readonly facing: Vec3;
  readonly headYaw: number;
}

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

const attackTimeFor = ({
  attackWait,
  attackCooldown,
  attackWindup,
  attackWindupSeconds,
}: ShamblerPoseInput): number | undefined => {
  if (attackWait !== undefined && attackCooldown !== undefined) {
    if (attackWait <= 0) {
      return undefined;
    }
    const elapsed = Math.max(0, attackCooldown - attackWait);
    return Math.max(0, LUNGE_GRAB.hitTime - attackWindupSeconds) + elapsed;
  }
  return attackWindup > 0
    ? Math.max(0, LUNGE_GRAB.hitTime - attackWindupSeconds) + attackWindupSeconds - attackWindup
    : undefined;
};

interface ModelPoseContext {
  readonly model: string;
  readonly figure: ShamblerFigure;
  readonly actor: WalkActor;
}

const withAttackPose = (context: ModelPoseContext, base: Pose, attackTime: number | undefined): Pose => {
  if (attackTime === undefined || attackTime > LUNGE_GRAB.duration) {
    return base;
  }
  const attacked = attackPose(context.actor, LUNGE_GRAB, attackTime, base);
  return context.model === 'crawler' ? groundCrawlerPose(context.figure.realized, attacked) : attacked;
};

const withHitFlinch = (context: ModelPoseContext, base: Pose, time: number, side: number): Pose => {
  if (context.model === 'crawler') {
    return crawlerHitPose(context.figure.realized, base, time, side);
  }
  if (context.model === 'runner') {
    return flinchPoseWithClip(context.actor, time, base, { clip: RUNNER_HIT_FLINCH, side });
  }
  return flinchPose(context.actor, time, base, { side });
};

const STANCE_CROSSFADE_SECONDS = 0.5;

export const targetStanceWeight = (input: ShamblerPoseInput): number => {
  const attackTime = attackTimeFor(input);
  return input.chasing || input.attackWindup > 0 || (attackTime !== undefined && attackTime <= LUNGE_GRAB.duration)
    ? 1
    : 0;
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
  const partRoots = new Map(figure.manifest.parts.map((part) => [part.id, part.rootBone]));
  const cuts = input.severed.map((part) => partRoots.get(part) ?? part);
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure,
    hidden: severedBoneSet(bones, cuts),
    yaw: rotY((Math.atan2(-input.facing[0], -input.facing[2]) * 180) / Math.PI),
    position: input.position,
    blockSize: input.blockSize,
  };
};

/** The shared living-zombie pose source. Rendering and hit-region FK consume the same simulation-driven pose. */
export const posedShambler = (input: ShamblerPoseInput): PosedShambler => {
  const model = input.model ?? 'shambler';
  if (model === 'amalgam') {
    return posedAmalgam(input);
  }
  const figure = humanoidFigure(model, input.seed);
  const { actor, bones, idleBases } = actorForSeed(model, input.seed);
  const phase = ((input.gaitPhase % Math.PI) + Math.PI) % Math.PI;
  const clock: GaitClock = { stepIndex: Math.floor(input.gaitPhase / Math.PI), progress: phase / Math.PI };
  const attackTime = attackTimeFor(input);
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
  const context = { model, figure, actor };
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
