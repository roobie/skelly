import type { RagdollBody } from '../../../deadvox/src/render/ragdoll.ts';
import type { Realized } from '../core/generate.ts';
import { voxelCentersByBone } from '../core/voxelize.ts';

/** A realized figure as the shared ragdoll reads a built body: each bone with the rest centres it owns. */
export const ragdollBody = ({ body, voxels }: Pick<Realized, 'body' | 'voxels'>): RagdollBody => {
  const centers = voxelCentersByBone(voxels, body.bones);
  return {
    voxelSize: voxels.size,
    bones: body.bones.map((bone) => ({ ...bone, voxels: centers.get(bone.id) })),
  };
};
