// Prone crawler rest pose: the humanoid rig is lowered onto its front, with the head raised, arms reaching
// forward and leg stumps trailing. crawlerGaitPose layers alternating arm reach, plant and pull onto it.

import type { Realized } from '../core/generate.ts';
import { applyPoint, IDENTITY_M, type Mat3, mulMM, rotX, rotZ } from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { posedVoxelSurfaceBoundsForBones } from '../core/voxelBounds.ts';
import { HIT_FLINCH } from './reactions.ts';

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

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

const GROUND_CONTACT_BONES = [
  'pelvis',
  'spine',
  'chest',
  'forearm.L',
  'hand.L',
  'forearm.R',
  'hand.R',
  'thigh.L',
  'thigh.R',
];

export const groundCrawlerPose = (realized: Realized, pose: Pose): Pose => {
  const probe: Pose = { root: [pose.root[0], 0, pose.root[2]], rotations: pose.rotations };
  const surfaces = posedVoxelSurfaceBoundsForBones(realized, probe, GROUND_CONTACT_BONES);
  const lowest = Math.min(...surfaces.values());
  return { ...pose, root: [pose.root[0], -lowest, pose.root[2]] };
};

const DRAG_KEYS = [
  { at: 0, upper: 15, forearm: -15 },
  { at: 0.25, upper: 15, forearm: -15 },
  { at: 0.4, upper: 0, forearm: 0 },
  { at: 0.62, upper: -15, forearm: 40 },
  { at: 0.82, upper: -15, forearm: 40 },
  { at: 1, upper: 0, forearm: 0 },
] as const;

const dragAngles = (progress: number): { upper: number; forearm: number } => {
  const right = DRAG_KEYS.findIndex((key) => key.at >= progress);
  const from = DRAG_KEYS[Math.max(0, right - 1)]!;
  const to = DRAG_KEYS[Math.max(0, right)] ?? from;
  const span = to.at - from.at;
  const t = span === 0 ? 1 : smoothstep((progress - from.at) / span);
  return { upper: from.upper + (to.upper - from.upper) * t, forearm: from.forearm + (to.forearm - from.forearm) * t };
};

/** Alternates arm reach, plant and pull from distance-driven phase; the trailing leg stumps never step. */
export const crawlerGaitPose = (realized: Realized, phase: number, speed: number): Pose => {
  const base = crawlerPose(realized);
  if (speed <= 0 || !Number.isFinite(phase)) {
    return base;
  }
  const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const side = cycle < Math.PI ? 'L' : 'R';
  const progress = (cycle % Math.PI) / Math.PI;
  const angles = dragAngles(progress);
  const rotations: Record<string, Mat3> = { ...base.rotations };
  for (const [bone, delta] of [
    [`upperArm.${side}`, angles.upper],
    [`forearm.${side}`, angles.forearm],
  ] as const) {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, rotX(delta));
  }
  return groundCrawlerPose(realized, { ...base, rotations });
};

/** A short brace/recoil layered over the current crawl pose and re-grounded against its support bones. */
export const crawlerHitPose = (realized: Realized, base: Pose, time: number, side = 0): Pose => {
  if (!(time > 0) || time >= HIT_FLINCH.duration) {
    return base;
  }
  const progress = time / HIT_FLINCH.duration;
  const intensity = progress < 0.2 ? smoothstep(progress / 0.2) : 1 - smoothstep((progress - 0.2) / 0.8);
  const rotations: Record<string, Mat3> = { ...base.rotations };
  const addRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };
  addRotation('spine', rotX(-2 * intensity));
  addRotation('chest', rotX(-3 * intensity));
  addRotation('neck', rotX(2 * intensity));
  addRotation('head', rotX(6 * intensity));
  addRotation('upperArm.L', rotZ(-2 * intensity * side));
  addRotation('upperArm.R', rotZ(2 * intensity * side));
  return groundCrawlerPose(realized, { ...base, rotations });
};
