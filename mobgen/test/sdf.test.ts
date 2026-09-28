import { describe, expect, it } from 'vitest';
import type { Body, Material } from '../src/core/body.ts';
import { smin } from '../src/core/sdf.ts';
import { voxelize } from '../src/core/voxelize.ts';

describe('smin', () => {
  it('is never greater than the hard min', () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [1, 2, 0.1],
      [-1, 3, 0.5],
      [0, 0, 0.2],
      [5, -5, 1],
    ];
    for (const [a, b, k] of cases) {
      expect(smin(a, b, k)).toBeLessThanOrEqual(Math.min(a, b) + 1e-9);
    }
  });

  it('falls back to the hard min when k <= 0', () => {
    expect(smin(3, 1, 0)).toBe(1);
    expect(smin(3, 1, -1)).toBe(1);
  });
});

const PALETTE: Record<Material, readonly [number, number, number]> = {
  skin: [1, 1, 1],
  bruise: [0, 0, 0],
  shirt: [0, 0, 0],
  pants: [0, 0, 0],
  shoe: [0, 0, 0],
  hair: [0, 0, 0],
  eye: [0, 0, 0],
  mouth: [0, 0, 0],
  gore: [0, 0, 0],
  bone: [0, 0, 0],
};

describe('voxelize', () => {
  it('a sphere-like ellipsoid gives about the expected voxel count', () => {
    const r = 0.3;
    const v = 0.05;
    const center: readonly [number, number, number] = [0, 0.8, 0];
    const body: Body = {
      bones: [{ id: 'ball', parent: null, head: center, tail: center }],
      features: [{ bone: 'ball', op: 'add', shape: { kind: 'ellipsoid', center, radii: [r, r, r] }, material: 'skin' }],
      palette: PALETTE,
    };
    const voxels = voxelize(body, v, 1);
    let filled = 0;
    for (const o of voxels.owner) {
      if (o !== 0) {
        filled += 1;
      }
    }
    const expected = ((4 / 3) * Math.PI * (r / v) ** 3) / 1;
    expect(filled).toBeGreaterThan(expected * 0.8);
    expect(filled).toBeLessThan(expected * 1.2);
  });
});
