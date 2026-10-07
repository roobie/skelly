// Prone crawler rest pose: the humanoid rig is lowered onto its front, with the head raised, arms reaching
// forward and legs trailing. The later drag cycle changes the arm reach alternately; this pose is its anchor.

import type { Bone } from '../core/body.ts';
import type { Realized } from '../core/generate.ts';
import { applyPoint, type Mat3, rotX } from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { posedVoxelSurfaceBounds } from '../core/voxelBounds.ts';

const ROOT = [0, 0, 0] as const;
const BASE_ROTATIONS: Readonly<Record<string, Mat3>> = {
  pelvis: rotX(-90),
  neck: rotX(62),
  head: rotX(13),
  'upperArm.L': rotX(180),
  'upperArm.R': rotX(180),
  'thigh.L': rotX(20),
  'thigh.R': rotX(20),
  'forearm.L': rotX(-15),
  'forearm.R': rotX(-15),
};
const poseCache = new WeakMap<Realized, Pose>();

const supportTailHeight = (
  bones: readonly Bone[],
  rotations: Readonly<Record<string, Mat3>>,
  boneId: string,
): number => {
  const transforms = boneTransforms(bones, { root: ROOT, rotations });
  const bone = bones.find((candidate) => candidate.id === boneId)!;
  return applyPoint(transforms.get(boneId)!, bone.tail)[1];
};

/** Fits each stump tail to the median height of the other named support tails. */
const solveThighPitch = (bones: readonly Bone[], rotations: Record<string, Mat3>, boneId: string): void => {
  const supportIds = ['thigh.L', 'thigh.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R'].filter(
    (candidate) => candidate !== boneId,
  );
  const otherSupports = supportIds.map((id) => supportTailHeight(bones, rotations, id)).sort((a, b) => a - b);
  const targetY = otherSupports[Math.floor(otherSupports.length / 2)]!;
  let bestAngle = 20;
  let bestError = Number.POSITIVE_INFINITY;
  for (let angle = -180; angle <= 180; angle += 1) {
    const candidate = { ...rotations, [boneId]: rotX(angle) };
    const error = Math.abs(supportTailHeight(bones, candidate, boneId) - targetY);
    if (error < bestError) {
      bestError = error;
      bestAngle = angle;
    }
  }
  rotations[boneId] = rotX(bestAngle);
};

/** Solves upper-arm and forearm pitch together so the forearm and hand tails share a support plane. */
const solveArmPitch = (
  bones: readonly Bone[],
  rotations: Record<string, Mat3>,
  side: 'L' | 'R',
  targetY: number,
): void => {
  const upper = `upperArm.${side}`;
  const forearm = `forearm.${side}`;
  let bestUpper = 180;
  let bestForearm = -15;
  let bestError = Number.POSITIVE_INFINITY;
  const consider = (upperAngle: number, forearmAngle: number): void => {
    const candidate = { ...rotations, [upper]: rotX(upperAngle), [forearm]: rotX(forearmAngle) };
    const transforms = boneTransforms(bones, { root: ROOT, rotations: candidate });
    const forearmBone = bones.find((bone) => bone.id === forearm)!;
    const handBone = bones.find((bone) => bone.id === `hand.${side}`)!;
    const [, forearmY] = applyPoint(transforms.get(forearm)!, forearmBone.tail);
    const [, handY] = applyPoint(transforms.get(handBone.id)!, handBone.tail);
    const error = Math.max(Math.abs(forearmY - targetY), Math.abs(handY - targetY));
    if (error < bestError) {
      bestError = error;
      bestUpper = upperAngle;
      bestForearm = forearmAngle;
    }
  };

  for (let upperAngle = 120; upperAngle <= 240; upperAngle += 4) {
    for (let forearmAngle = -105; forearmAngle <= 75; forearmAngle += 4) {
      consider(upperAngle, forearmAngle);
    }
  }
  for (let upperAngle = bestUpper - 4; upperAngle <= bestUpper + 4; upperAngle += 0.5) {
    for (let forearmAngle = bestForearm - 4; forearmAngle <= bestForearm + 4; forearmAngle += 0.5) {
      consider(upperAngle, forearmAngle);
    }
  }
  rotations[upper] = rotX(bestUpper);
  rotations[forearm] = rotX(bestForearm);
};

/** Static prone pose, solved from the figure's rig and posed voxel bounds. */
export const crawlerPose = (realized: Realized): Pose => {
  const cached = poseCache.get(realized);
  if (cached) {
    return cached;
  }

  const rotations: Record<string, Mat3> = { ...BASE_ROTATIONS };
  const torsoBounds = posedVoxelSurfaceBounds(realized, { root: ROOT, rotations }).byBone;
  const torsoGroundY = Math.min(...['pelvis', 'spine', 'chest'].map((bone) => torsoBounds.get(bone)!));
  for (const side of ['L', 'R'] as const) {
    solveArmPitch(realized.body.bones, rotations, side, torsoGroundY);
  }
  for (const side of ['L', 'R'] as const) {
    solveThighPitch(realized.body.bones, rotations, `thigh.${side}`);
  }
  // Use rig support points for the root plane; voxel bounds are the independent contact check.
  const supportTransforms = boneTransforms(realized.body.bones, { root: ROOT, rotations });
  const supportTails = ['thigh.L', 'thigh.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R'].map((boneId) => {
    const bone = realized.body.bones.find((candidate) => candidate.id === boneId)!;
    return applyPoint(supportTransforms.get(boneId)!, bone.tail)[1];
  });
  supportTails.sort((a, b) => a - b);
  const supportPlaneY = (supportTails[2]! + supportTails[3]!) / 2;
  const pose = { root: [0, -supportPlaneY, 0] as const, rotations };
  poseCache.set(realized, pose);
  return pose;
};
