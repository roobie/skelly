// Prone crawler rest pose: the humanoid rig is lowered onto its front, with the head raised, arms reaching
// forward and legs trailing. The later drag cycle changes the arm reach alternately; this pose is its anchor.

import type { Realized } from '../core/generate.ts';
import { applyPoint, type Mat3, rotX } from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { posedVoxelSurfaceBoundsForBones } from '../core/voxelBounds.ts';

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

/** Fits each thigh's voxel surface to the torso plane while keeping its stump trailing behind the hip. */
const solveThighPitch = (
  realized: Realized,
  rotations: Record<string, Mat3>,
  boneId: string,
  targetY: number,
): void => {
  const bone = realized.body.bones.find((candidate) => candidate.id === boneId)!;
  let bestAngle: number | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  for (let angle = 0; angle <= 70; angle += 1) {
    const candidate = { ...rotations, [boneId]: rotX(angle) };
    const pose = { root: ROOT, rotations: candidate };
    const transforms = boneTransforms(realized.body.bones, pose);
    const transform = transforms.get(boneId)!;
    const hip = applyPoint(transform, bone.head);
    const tail = applyPoint(transform, bone.tail);
    if (!(tail[1] < hip[1] && tail[2] > hip[2])) {
      continue;
    }
    const surface = posedVoxelSurfaceBoundsForBones(realized, pose, [boneId]).get(boneId)!;
    const error = Math.abs(surface - targetY);
    if (error < bestError) {
      bestError = error;
      bestAngle = angle;
    }
  }
  if (bestAngle === undefined) {
    throw new Error(`crawlerPose: no trailing support pitch found for ${boneId}`);
  }
  rotations[boneId] = rotX(bestAngle);
};

/** Solves upper-arm and forearm pitch together so their lowest voxel surfaces meet the torso plane. */
const solveArmPitch = (realized: Realized, rotations: Record<string, Mat3>, side: 'L' | 'R', targetY: number): void => {
  const upper = `upperArm.${side}`;
  const forearm = `forearm.${side}`;
  const hand = `hand.${side}`;
  let bestUpper = 180;
  let bestForearm = -15;
  let bestError = Number.POSITIVE_INFINITY;
  const consider = (upperAngle: number, forearmAngle: number): void => {
    const candidate = { ...rotations, [upper]: rotX(upperAngle), [forearm]: rotX(forearmAngle) };
    const pose = { root: ROOT, rotations: candidate };
    const surfaces = posedVoxelSurfaceBoundsForBones(realized, pose, [forearm, hand]);
    const forearmY = surfaces.get(forearm)!;
    const handY = surfaces.get(hand)!;
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

/** Static prone pose, fitted to the torso and support-bone voxel surfaces for each realized figure. */
export const crawlerPose = (realized: Realized): Pose => {
  const cached = poseCache.get(realized);
  if (cached) {
    return cached;
  }

  const rotations: Record<string, Mat3> = { ...BASE_ROTATIONS };
  const torsoBones = ['pelvis', 'spine', 'chest'];
  const torsoBounds = posedVoxelSurfaceBoundsForBones(realized, { root: ROOT, rotations }, torsoBones);
  const torsoGroundY = Math.min(...torsoBones.map((bone) => torsoBounds.get(bone)!));
  for (const side of ['L', 'R'] as const) {
    solveArmPitch(realized, rotations, side, torsoGroundY);
  }
  for (const side of ['L', 'R'] as const) {
    solveThighPitch(realized, rotations, `thigh.${side}`, torsoGroundY);
  }
  const pose = { root: [0, -torsoGroundY, 0] as const, rotations };
  poseCache.set(realized, pose);
  return pose;
};
