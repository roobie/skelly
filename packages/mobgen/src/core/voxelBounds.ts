import type { Realized } from './generate.ts';
import { applyPoint, type Vec3 } from './math.ts';
import { boneTransforms, type Pose } from './pose.ts';
import { cellIndex, worldPosition } from './voxelize.ts';

export interface PosedVoxelSurfaceBounds {
  readonly lowest: number;
  readonly byBone: ReadonlyMap<string, number>;
}

const centersByRealized = new WeakMap<object, ReadonlyMap<string, readonly Vec3[]>>();

/** Lattice lines through a cell, one per direction up to sign. */
const LINE_DIRECTIONS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
];

/**
 * A rigid pose's lowest point of a voxel set is a corner of its convex hull, and a cell with cells of the
 * same bone on both sides along any lattice line is never a corner. Keeping only the other cells makes the
 * per-pose ground fit cheap while giving exactly the result of sweeping every voxel.
 */
const hullCandidateCells = (
  dims: readonly [number, number, number],
  owner: ArrayLike<number>,
  cells: readonly (readonly [number, number, number])[],
): readonly (readonly [number, number, number])[] => {
  const ownerAt = (i: number, j: number, k: number): number =>
    i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2] ? 0 : owner[cellIndex(dims, i, j, k)]!;
  const reaches = (cell: readonly [number, number, number], step: readonly number[], id: number): boolean => {
    for (let t = 1; ; t++) {
      const i = cell[0] + step[0]! * t;
      const j = cell[1] + step[1]! * t;
      const k = cell[2] + step[2]! * t;
      if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) {
        return false;
      }
      if (ownerAt(i, j, k) === id) {
        return true;
      }
    }
  };
  return cells.filter((cell) => {
    const id = ownerAt(...cell);
    return !LINE_DIRECTIONS.some(
      (direction) =>
        reaches(cell, direction, id) &&
        reaches(
          cell,
          direction.map((value) => -value),
          id,
        ),
    );
  });
};

const voxelCentersByBone = (realized: Pick<Realized, 'body' | 'voxels'>): ReadonlyMap<string, readonly Vec3[]> => {
  const cached = centersByRealized.get(realized);
  if (cached) {
    return cached;
  }
  const { body, voxels } = realized;
  const cellsByBone = new Map<string, [number, number, number][]>();
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner === 0) {
          continue;
        }
        const boneId = body.bones[owner - 1]!.id;
        const cells = cellsByBone.get(boneId) ?? [];
        cells.push([i, j, k]);
        cellsByBone.set(boneId, cells);
      }
    }
  }
  const centers = new Map<string, readonly Vec3[]>();
  for (const [boneId, cells] of cellsByBone) {
    centers.set(
      boneId,
      hullCandidateCells(voxels.dims, voxels.owner, cells).map((cell) => worldPosition(voxels, ...cell)),
    );
  }
  centersByRealized.set(realized, centers);
  return centers;
};

/** Lowest occupied voxel surface per selected owner bone, after applying a pose. */
export const posedVoxelSurfaceBoundsForBones = (
  realized: Pick<Realized, 'body' | 'voxels'>,
  pose: Pose,
  boneIds: Iterable<string>,
): ReadonlyMap<string, number> => {
  const transforms = boneTransforms(realized.body.bones, pose);
  const centersByBone = voxelCentersByBone(realized);
  const half = realized.voxels.size / 2;
  const byBone = new Map<string, number>();
  for (const boneId of boneIds) {
    const transform = transforms.get(boneId);
    const centers = centersByBone.get(boneId);
    if (!(transform && centers)) {
      continue;
    }
    const verticalHalfExtent = half * (Math.abs(transform.r[3]) + Math.abs(transform.r[4]) + Math.abs(transform.r[5]));
    let lowest = Number.POSITIVE_INFINITY;
    for (const center of centers) {
      lowest = Math.min(lowest, applyPoint(transform, center)[1] - verticalHalfExtent);
    }
    byBone.set(boneId, lowest);
  }
  return byBone;
};

/** Lowest occupied voxel surface per owner bone, after applying a pose. */
export const posedVoxelSurfaceBounds = (
  realized: Pick<Realized, 'body' | 'voxels'>,
  pose: Pose,
): PosedVoxelSurfaceBounds => {
  const byBone = posedVoxelSurfaceBoundsForBones(
    realized,
    pose,
    realized.body.bones.map((bone) => bone.id),
  );
  return { lowest: Math.min(...byBone.values()), byBone };
};
