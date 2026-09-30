import type { Bone } from '@mobgen/core/body.ts';
import { IDENTITY_M, type Mat3, mulMM, rotY } from '@mobgen/core/math.ts';
import { boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import { attackPose, LUNGE_GRAB } from '@mobgen/mob/attack.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { footRestExtents, type GaitClock, type WalkActor, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { idlePose } from '@mobgen/mob/idle.ts';
import { flinchPose, HIT_FLINCH } from '@mobgen/mob/reactions.ts';
import { type ShamblerFigure, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import type { Vec3 } from './coords.ts';
import type { Zombie } from './zombies.ts';

export interface ShamblerPoseInput {
  readonly id?: number;
  readonly seed: number;
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
): ShamblerPoseInput => ({
  id,
  seed: zombie.figureSeed,
  position: root?.position ?? zombie.body.pos,
  facing: root?.facing ?? zombie.facing,
  headYaw: root?.headYaw ?? zombie.headYaw,
  gaitPhase: zombie.gaitPhase,
  speed: zombie.horizontalSpeed,
  chasing: zombie.mode === 'chase',
  attackWindup: zombie.attackWindup,
  attackWindupSeconds: zombie.type.attack.windup,
  attackWait: zombie.attackWait,
  attackCooldown: zombie.type.attack.cooldown,
  idleTime: zombie.wanderClock,
  ...(zombie.hitFlinchTime === undefined ? {} : { hitFlinchTime: zombie.hitFlinchTime }),
  severed: zombie.severed,
  blockSize,
});

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

const actorForFigure = (figure: ShamblerFigure): { actor: WalkActor; bones: readonly Bone[] } => {
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
  return { actor, bones };
};

const actorCache = new Map<number, ReturnType<typeof actorForFigure>>();
const actorForSeed = (seed: number): ReturnType<typeof actorForFigure> => {
  let actor = actorCache.get(seed);
  if (!actor) {
    actor = actorForFigure(shamblerFigure(seed));
    actorCache.set(seed, actor);
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

/** The sole living-shambler pose source. Both render and hit FK consume this exact simulation-driven pose. */
export const posedShambler = (input: ShamblerPoseInput): PosedShambler => {
  const { actor, bones } = actorForSeed(input.seed);
  const phase = ((input.gaitPhase % Math.PI) + Math.PI) % Math.PI;
  const clock: GaitClock = { stepIndex: Math.floor(input.gaitPhase / Math.PI), progress: phase / Math.PI };
  const attackTime = attackTimeFor(input);
  const stance = input.chasing || attackTime !== undefined ? 'aggravated' : 'slack';
  const walk = walkPose(actor, clock, input.speed, {
    idle: idlePose(actor, stance, input.idleTime ?? 0),
  });
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
    figure: shamblerFigure(input.seed),
    hidden: severedBoneSet(bones, input.severed),
    yaw: rotY((Math.atan2(-input.facing[0], -input.facing[2]) * 180) / Math.PI),
    position: input.position,
    blockSize: input.blockSize,
  };
};

export const HIT_FLINCH_DURATION = HIT_FLINCH.duration;
