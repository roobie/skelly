// Prone crawler rest pose: the humanoid rig is lowered onto its front, with the head raised, arms reaching
// forward and legs trailing. The later drag cycle changes the arm reach alternately; this pose is its anchor.

import type { Realized } from '../core/generate.ts';
import { applyPoint, type Mat3, rotX } from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { cellIndex, worldPosition } from '../core/voxelize.ts';

const lowestVoxelBottom = (realized: Realized, rotations: Record<string, Mat3>): number => {
  const { bones } = realized.body;
  const { voxels } = realized;
  const transforms = boneTransforms(bones, { root: [0, 0, 0], rotations });
  const half = voxels.size / 2;
  let lowest = Number.POSITIVE_INFINITY;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner === 0) {
          continue;
        }
        const transform = transforms.get(bones[owner - 1]!.id)!;
        const center = applyPoint(transform, worldPosition(voxels, i, j, k));
        const verticalHalfExtent =
          half * (Math.abs(transform.r[3]) + Math.abs(transform.r[4]) + Math.abs(transform.r[5]));
        lowest = Math.min(lowest, center[1] - verticalHalfExtent);
      }
    }
  }
  return lowest;
};

/** Static prone pose, grounded from the actual posed voxel bounds. */
export const crawlerPose = (realized: Realized): Pose => {
  const rotations: Record<string, Mat3> = {
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
  return { root: [0, -lowestVoxelBottom(realized, rotations), 0], rotations };
};
