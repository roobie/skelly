import type { Realized } from './generate.ts';
import { applyPoint, type Vec3 } from './math.ts';
import { boneTransforms, type Pose } from './pose.ts';
import { cellIndex, worldPosition } from './voxelize.ts';

export interface PosedVoxelSurfaceBounds {
  readonly lowest: number;
  readonly byBone: ReadonlyMap<string, number>;
}

const centersByRealized = new WeakMap<object, ReadonlyMap<string, readonly Vec3[]>>();

const voxelCentersByBone = (realized: Pick<Realized, 'body' | 'voxels'>): ReadonlyMap<string, readonly Vec3[]> => {
  const cached = centersByRealized.get(realized);
  if (cached) {
    return cached;
  }
  const { body, voxels } = realized;
  const mutable = new Map<string, Vec3[]>();
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner === 0) {
          continue;
        }
        const boneId = body.bones[owner - 1]!.id;
        const centers = mutable.get(boneId) ?? [];
        centers.push(worldPosition(voxels, i, j, k));
        mutable.set(boneId, centers);
      }
    }
  }
  centersByRealized.set(realized, mutable);
  return mutable;
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
