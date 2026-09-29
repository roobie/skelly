import { describe, expect, it } from 'vitest';
import { massProperties } from '../src/core/massProperties.ts';
import type { Voxels } from '../src/core/voxelize.ts';

const grid = (dims: [number, number, number], size = 0.05): Voxels => ({
  size,
  origin: [0, 0, 0],
  dims,
  owner: new Uint8Array(dims[0] * dims[1] * dims[2]).fill(1),
  color: new Uint8Array(dims[0] * dims[1] * dims[2]),
});

describe('massProperties', () => {
  it('computes a 10-cube mass, centre and inertia as solid cubes', () => {
    const p = massProperties(grid([10, 10, 10]), [0], 0.05);
    expect(p.mass).toBeCloseTo(125, 10);
    for (const i of [0, 1, 2]) {
      expect(Math.abs(p.center[i]! - [0.225, 0.25, 0.225][i]!)).toBeLessThan(1e-9);
    }
    const analytic = (125 * (0.5 ** 2 + 0.5 ** 2)) / 12;
    for (const i of [0, 1, 2]) {
      expect(p.inertia[i]![i]).toBeCloseTo(analytic, 2);
    }
    expect(Math.abs(p.inertia[0][1])).toBeLessThan(1e-9);
  });
});
