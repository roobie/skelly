import type { Bone } from '@mobgen/core/body.ts';
import { IDENTITY_M, type Mat3, mulMM, rotY } from '@mobgen/core/math.ts';
import { blendPose, boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import { attackPose, LUNGE_GRAB } from '@mobgen/mob/attack.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { footRestExtents, type GaitClock, type WalkActor, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { applyIdleMotion, type IdleStance, idleBasePose } from '@mobgen/mob/idle.ts';
import { flinchPose, HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { type ShamblerFigure, zombieFigure } from '@mobgen/mob/shamblerFigure.ts';
import type { Vec3 } from './coords.ts';
import type { Zombie } from './zombies.ts';

export interface ShamblerPoseInput {
  readonly id?: number;
  readonly seed: number;
  readonly model?: string;
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
  readonly figure: ShamblerFigure;
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
    actor = actorForFigure(zombieFigure(model, seed));
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

/** The sole living-shambler pose source. Both render and hit FK consume this exact simulation-driven pose. */
export const posedShambler = (input: ShamblerPoseInput): PosedShambler => {
  const { actor, bones, idleBases } = actorForSeed(input.model ?? 'shambler', input.seed);
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
  const walk = walkPose(actor, clock, input.speed, { idle });
  const basePose =
    attackTime === undefined || attackTime > LUNGE_GRAB.duration
      ? walk
      : attackPose(actor, LUNGE_GRAB, attackTime, walk);
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
  const pose =
    input.hitFlinchTime === undefined
      ? headPose
      : flinchPose(actor, input.hitFlinchTime, headPose, { side: flinchSideForId(input.id ?? 0) });
  return {
    pose,
    transforms: boneTransforms(bones, pose),
    bones,
    figure: zombieFigure(input.model ?? 'shambler', input.seed),
    hidden: severedBoneSet(bones, input.severed),
    yaw: rotY((Math.atan2(-input.facing[0], -input.facing[2]) * 180) / Math.PI),
    position: input.position,
    blockSize: input.blockSize,
  };
};

export const HIT_FLINCH_DURATION = HIT_FLINCH.duration;
