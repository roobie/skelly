import { describe, expect, it } from 'vitest';
import { generateValid, type Realized } from '../src/core/generate.ts';
import { applyPoint, type Mat3, mulMM, rotX, rotY, rotZ } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { posedVoxelSurfaceBounds } from '../src/core/voxelBounds.ts';
import { cellIndex, worldPosition } from '../src/core/voxelize.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';

const realized = {
  body: { bones: [{ id: 'root', parent: null, head: [0, 0, 0], tail: [0, 1, 0] }] },
  voxels: {
    size: 1,
    origin: [0, 0, 0],
    dims: [1, 1, 1],
    owner: Uint8Array.of(1),
    color: Uint8Array.of(0),
  },
} as unknown as Pick<Realized, 'body' | 'voxels'>;

const rotations: readonly { readonly name: string; readonly rotation: Mat3; readonly lowest: number }[] = [
  { name: 'identity', rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], lowest: 0 },
  { name: '90-degree turn', rotation: rotX(90), lowest: -0.5 },
  { name: '45-degree turn', rotation: rotX(45), lowest: -Math.SQRT2 / 4 },
];

/** Reference: every occupied voxel swept, no candidate reduction. */
const sweptLowest = (body: Pick<Realized, 'body' | 'voxels'>, pose: Pose): Map<string, number> => {
  const transforms = boneTransforms(body.body.bones, pose);
  const { voxels } = body;
  const out = new Map<string, number>();
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner === 0) {
          continue;
        }
        const bone = body.body.bones[owner - 1]!.id;
        const t = transforms.get(bone)!;
        const extent = (voxels.size / 2) * (Math.abs(t.r[3]) + Math.abs(t.r[4]) + Math.abs(t.r[5]));
        const y = applyPoint(t, worldPosition(voxels, i, j, k))[1] - extent;
        out.set(bone, Math.min(out.get(bone) ?? Number.POSITIVE_INFINITY, y));
      }
    }
  }
  return out;
};

describe('posedVoxelSurfaceBounds', () => {
  it.each(rotations)('finds a single occupied voxel surface after $name', ({ rotation, lowest }) => {
    const bounds = posedVoxelSurfaceBounds(realized, { root: [0, 0, 0], rotations: { root: rotation } });
    expect(bounds.lowest).toBeCloseTo(lowest, 10);
    expect(bounds.byBone.get('root')).toBeCloseTo(lowest, 10);
  });

  it('matches a sweep of every voxel on a posed acid body', () => {
    const generated = generateValid(acidTemplate, 1)!.realized;
    const tilts: readonly Mat3[] = [rotX(37), mulMM(rotY(-71), rotZ(23)), mulMM(rotZ(118), rotX(-9))];
    for (const [index, tilt] of tilts.entries()) {
      const boneRotations = Object.fromEntries(
        generated.body.bones.map((bone, boneIndex) => [bone.id, boneIndex % 2 === index % 2 ? tilt : rotY(13)]),
      );
      const pose: Pose = { root: [0, 0, 0], rotations: boneRotations };
      const fitted = posedVoxelSurfaceBounds(generated, pose).byBone;
      const swept = sweptLowest(generated, pose);
      expect(fitted.size).toBe(swept.size);
      for (const [bone, lowest] of swept) {
        expect(fitted.get(bone), bone).toBeCloseTo(lowest, 10);
      }
    }
  });
});
