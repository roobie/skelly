// Static leaper stances. The coiled crouch is the rest pose itself; rearing aims each bone along a
// world direction and lifts the root until the lowest voxel rests on the ground.

import type { Bone } from '../../core/body.ts';
import type { Realized } from '../../core/generate.ts';
import {
  cross,
  dot,
  IDENTITY_M,
  length,
  type Mat3,
  mulMM,
  normalize,
  rotAxis,
  sub,
  transpose,
  type Vec3,
} from '../../core/math.ts';
import type { Pose } from '../../core/pose.ts';
import { posedVoxelSurfaceBounds } from '../../core/voxelBounds.ts';

/** Shortest-arc world rotation taking direction `from` onto `to`. */
const turn = (from: Vec3, to: Vec3): Mat3 => {
  const a = normalize(from);
  const b = normalize(to);
  const axis = cross(a, b);
  const sine = length(axis);
  const cosine = dot(a, b);
  if (sine < 1e-9) {
    return cosine > 0 ? IDENTITY_M : rotAxis(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]), 180);
  }
  return rotAxis(axis, (Math.atan2(sine, cosine) * 180) / Math.PI);
};

/** A pose whose listed bones point along world directions; an unlisted bone keeps its parent's turn. */
const aimPose = (bones: readonly Bone[], aims: Readonly<Record<string, Vec3>>): Pose => {
  const world = new Map<string, Mat3>();
  const rotations: Record<string, Mat3> = {};
  for (const bone of bones) {
    const parent = bone.parent === null ? IDENTITY_M : world.get(bone.parent)!;
    const aim = aims[bone.id];
    const turned = aim ? turn(sub(bone.tail, bone.head), aim) : parent;
    world.set(bone.id, turned);
    rotations[bone.id] = mulMM(transpose(parent), turned);
  }
  return { root: [0, 0, 0], rotations };
};

/** Moves a pose vertically so its lowest voxel surface sits on the ground. */
const grounded = (realized: Pick<Realized, 'body' | 'voxels'>, pose: Pose): Pose => {
  const { lowest } = posedVoxelSurfaceBounds(realized, pose);
  return { ...pose, root: [pose.root[0], pose.root[1] - lowest, pose.root[2]] };
};

const mirrored = (aims: Readonly<Record<string, Vec3>>): Record<string, Vec3> =>
  Object.fromEntries(
    Object.entries(aims).flatMap(([id, [x, y, z]]) => [
      [`${id}.L`, [x, y, z]],
      [`${id}.R`, [-x, y, z]],
    ]),
  );

/** Reared to full height on the hind springs, forelimbs thrown forward with claws hooked: the stance its
 * reach comes from. */
const REARED: Readonly<Record<string, Vec3>> = {
  pelvis: [0, 1, -0.3],
  spine: [0, 1, -0.35],
  chest: [0, 0.45, -0.9],
  head: [0, -0.35, -1],
  jaw: [0, -0.6, -1],
  ...mirrored({
    thigh: [-0.25, -1, -0.2],
    shin: [-0.05, -1, 0.3],
    foot: [0, -0.8, -1],
    upperArm: [-0.6, 0.1, -0.8],
    forearm: [-0.1, 0.55, -0.85],
    hand: [0, -0.2, -1],
  }),
};

export const LEAPER_STANCES = {
  coiled: (_realized: Pick<Realized, 'body' | 'voxels'>): Pose => ({ root: [0, 0, 0], rotations: {} }),
  reared: (realized: Pick<Realized, 'body' | 'voxels'>): Pose =>
    grounded(realized, aimPose(realized.body.bones, REARED)),
} as const;
export type LeaperStance = keyof typeof LEAPER_STANCES;
