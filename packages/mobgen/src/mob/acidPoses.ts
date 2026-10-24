import type { Realized } from '../core/generate.ts';
import { clampJointAngles, jointAngles, jointRotation } from '../core/joints.ts';
import { applyPoint, clamp, IDENTITY_M, type Mat3, mulMM, rotX, smoothstep, transpose } from '../core/math.ts';
import { boneTransforms, type EulerDeg, type Pose } from '../core/pose.ts';
import { posedVoxelSurfaceBounds } from '../core/voxelBounds.ts';
import { acidTemplate } from './acidTemplate.ts';

const tuning = acidTemplate.animation;
type Angles = Readonly<Record<string, readonly number[]>>;

const fitGround = (realized: Realized, pose: Pose): Pose => ({
  ...pose,
  root: [pose.root[0], pose.root[1] - posedVoxelSurfaceBounds(realized, pose).lowest, pose.root[2]],
});

const layer = (
  realized: Realized,
  base: Pose,
  values: Angles,
  options: number | { weight: number; side: number },
): Pose => {
  const { weight, side } = typeof options === 'number' ? { weight: options, side: 1 } : options;
  const rotations: Record<string, Mat3> = { ...base.rotations };
  for (const [id, value] of Object.entries(values)) {
    const bone = realized.body.bones.find((candidate) => candidate.id === id);
    if (!bone) {
      throw new Error(`missing acid pose bone ${id}`);
    }
    const old = jointAngles(bone, rotations[id] ?? IDENTITY_M);
    const angles: EulerDeg = [
      old[0] + value[0]! * weight,
      old[1] + value[1]! * weight,
      old[2] + value[2]! * weight * side,
    ];
    rotations[id] = jointRotation(bone, clampJointAngles(bone, angles));
  }
  return fitGround(realized, { ...base, rotations });
};

export const acidIdlePose = (realized: Realized, time = 0): Pose => {
  const wave = Math.sin((time * 2 * Math.PI) / tuning.idlePeriod);
  return layer(
    realized,
    { root: [0, 0, 0], rotations: {} },
    {
      chest: [tuning.breath * wave, 0, tuning.sway * wave],
      maw: [tuning.breath * (1 + wave), 0, 0],
    },
    1,
  );
};

export const acidStrideLength = (realized: Realized): number =>
  Math.max(...realized.body.bones.flatMap((bone) => [bone.head[1], bone.tail[1]])) * tuning.strideHeight;

/** Distance drives the cycle so changing speed cannot jump its phase. */
export const acidWalkPose = (realized: Realized, distance: number, speed: number, time = 0): Pose => {
  const base = acidIdlePose(realized, time);
  if (speed <= 0) {
    return base;
  }
  const phase = (distance / acidStrideLength(realized)) * 2 * Math.PI;
  const weight = clamp(speed, 0, 1);
  const values: Record<string, number[]> = {};
  for (const [index, side] of ['L', 'R'].entries()) {
    const wave = Math.sin(phase + index * Math.PI);
    const lift = Math.max(0, wave);
    values[`thigh.${side}`] = [tuning.swing * lift, 0, 0];
    values[`shin.${side}`] = [tuning.kneeLift * lift, 0, 0];
    values[`arm.${side}`] = [-tuning.armSwing * wave, 0, 0];
  }
  const posed = layer(realized, base, values, weight);
  const rotations = { ...posed.rotations };
  const transforms = boneTransforms(realized.body.bones, posed);
  // Keep each foot's bind sole orientation while its leg swings; respect the ankle's own limit.
  for (const side of ['L', 'R']) {
    const foot = realized.body.bones.find((bone) => bone.id === `foot.${side}`)!;
    const correction = transpose(transforms.get(foot.parent!)!.r);
    rotations[foot.id] = jointRotation(foot, clampJointAngles(foot, jointAngles(foot, correction)));
  }
  return fitGround(realized, { ...posed, rotations });
};

const pulse = (time: number, peak: number, duration: number): number =>
  time <= 0 || time >= duration ? 0 : smoothstep(time < peak ? time / peak : (duration - time) / (duration - peak));

export const acidAttackPose = (realized: Realized, base: Pose, time: number): Pose =>
  layer(realized, base, tuning.attack, pulse(time, tuning.attackPeak, tuning.attackDuration));

/** Progress is supplied by the action owner; holding at one keeps the head drawn back. */
export const acidWindupPose = (realized: Realized, base: Pose, progress: number): Pose =>
  layer(realized, base, tuning.windup, smoothstep(clamp(progress, 0, 1)));

export const acidHitPose = (realized: Realized, base: Pose, time: number, side = 0): Pose =>
  layer(realized, base, tuning.hit, {
    weight: pulse(time, tuning.hitPeak, tuning.hitDuration),
    side: clamp(side, -1, 1),
  });

export const acidDeathPose = (realized: Realized, base: Pose, time: number, direction: 1 | -1 = 1): Pose => {
  if (time <= 0) {
    return base;
  }
  const progress = smoothstep(clamp(time / tuning.deathDuration, 0, 1));
  const drool = Object.fromEntries(
    realized.body.bones
      .filter((bone) => bone.id.startsWith('drool.'))
      .map((bone) => [bone.id, [direction * tuning.droolDeathFlex, 0, 0]]),
  );
  const folded = layer(realized, base, { ...tuning.death, ...drool }, progress);
  const transforms = boneTransforms(realized.body.bones, folded);
  const hips = realized.body.bones.find((bone) => bone.id === 'hips')!;
  const skull = realized.body.bones.find((bone) => bone.id === 'skull')!;
  const from = applyPoint(transforms.get('hips')!, hips.head);
  const to = applyPoint(transforms.get('skull')!, skull.head);
  const trunkPitch = (Math.atan2(to[2] - from[2], to[1] - from[1]) * 180) / Math.PI;
  // Fit the hunched trunk, not an upright bind axis, so its head cannot prop the corpse upright.
  // The root rotates the entire actor in world space; it is not an articulated hips joint.
  const rotations = {
    ...folded.rotations,
    hips: mulMM(rotX((-direction * tuning.topple - trunkPitch) * progress), base.rotations.hips ?? IDENTITY_M),
  };
  return fitGround(realized, { ...folded, rotations });
};
