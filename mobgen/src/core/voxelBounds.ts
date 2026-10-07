import type { Realized } from './generate.ts';
import { applyPoint } from './math.ts';
import { boneTransforms, type Pose } from './pose.ts';
import { cellIndex, worldPosition } from './voxelize.ts';

export interface PosedVoxelSurfaceBounds {
  readonly lowest: number;
  readonly byBone: ReadonlyMap<string, number>;
}

/** Lowest occupied voxel surface per owner bone, after applying a pose. */
export const posedVoxelSurfaceBounds = (
  realized: Pick<Realized, 'body' | 'voxels'>,
  pose: Pose,
): PosedVoxelSurfaceBounds => {
  const { body, voxels } = realized;
  const transforms = boneTransforms(body.bones, pose);
  const half = voxels.size / 2;
  const byBone = new Map<string, number>();
  let lowest = Number.POSITIVE_INFINITY;

  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner === 0) {
          continue;
        }
        const boneId = body.bones[owner - 1]!.id;
        const transform = transforms.get(boneId)!;
        const center = applyPoint(transform, worldPosition(voxels, i, j, k));
        const verticalHalfExtent =
          half * (Math.abs(transform.r[3]) + Math.abs(transform.r[4]) + Math.abs(transform.r[5]));
        const bottom = center[1] - verticalHalfExtent;
        byBone.set(boneId, Math.min(byBone.get(boneId) ?? Number.POSITIVE_INFINITY, bottom));
        lowest = Math.min(lowest, bottom);
      }
    }
  }

  return { lowest, byBone };
};
