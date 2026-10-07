import { describe, expect, it } from 'vitest';
import type { Realized } from '../src/core/generate.ts';
import { type Mat3, rotX } from '../src/core/math.ts';
import { posedVoxelSurfaceBounds } from '../src/core/voxelBounds.ts';

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

describe('posedVoxelSurfaceBounds', () => {
  it.each(rotations)('finds a single occupied voxel surface after $name', ({ rotation, lowest }) => {
    const bounds = posedVoxelSurfaceBounds(realized, { root: [0, 0, 0], rotations: { root: rotation } });
    expect(bounds.lowest).toBeCloseTo(lowest, 10);
    expect(bounds.byBone.get('root')).toBeCloseTo(lowest, 10);
  });
});
