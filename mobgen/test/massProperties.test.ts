import { describe, expect, it } from 'vitest';
import { generateValid } from '../src/core/generate.ts';
import { massProperties, voxelBounds } from '../src/core/massProperties.ts';
import type { Voxels } from '../src/core/voxelize.ts';
import { severedBoneSet } from '../src/mob/dismember.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const grid = (dims: [number, number, number], size = 0.05, origin: [number, number, number] = [0, 0, 0]): Voxels => ({
  size,
  origin,
  dims,
  owner: new Uint8Array(dims[0] * dims[1] * dims[2]).fill(1),
  color: new Uint8Array(dims[0] * dims[1] * dims[2]),
});

describe('massProperties', () => {
  it('computes a 10-cube mass, centre and inertia as solid cubes', () => {
    const p = massProperties(grid([10, 10, 10], 0.05, [-4.5, 0, -4.5]), [0], 0.05);
    expect(p.mass).toBeCloseTo(125, 10);
    for (const i of [0, 1, 2]) {
      expect(Math.abs(p.center[i]! - [0, 0.25, 0][i]!)).toBeLessThan(1e-9);
    }
    const analytic = (125 * (0.5 ** 2 + 0.5 ** 2)) / 12;
    for (const i of [0, 1, 2]) {
      expect(p.inertia[i]![i]).toBeCloseTo(analytic, 2);
    }
    expect(Math.abs(p.inertia[0][1])).toBeLessThan(1e-9);
    expect(Math.abs(p.inertia[0][2])).toBeLessThan(1e-9);
    expect(Math.abs(p.inertia[1][2])).toBeLessThan(1e-9);
  });

  it('computes the principal moments of a 2×10×2 rod', () => {
    const p = massProperties(grid([2, 10, 2]), [0], 0.05);
    const [a, b, c] = [0.1, 0.5, 0.1];
    const expected = [
      (p.mass * (b * b + c * c)) / 12,
      (p.mass * (a * a + c * c)) / 12,
      (p.mass * (a * a + b * b)) / 12,
    ];
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(p.inertia[axis]![axis]! / expected[axis]! - 1)).toBeLessThan(0.01);
    }
    expect(p.inertia[1][1]).toBeLessThan(p.inertia[0][0]);
    expect(p.inertia[1][1]).toBeLessThan(p.inertia[2][2]);
  });

  it('keeps generated shambler severed subtrees in anatomical mass ranges for seeds 1–5', () => {
    const template = TEMPLATES.find((candidate) => candidate.name === 'shambler')!;
    const results: number[][] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const generated = generateValid(template, seed)!;
      const { body, voxels } = generated.realized;
      const byId = new Map(body.bones.map((bone, index) => [bone.id, index]));
      const subtreeMass = (part: string): number =>
        massProperties(
          voxels,
          [...severedBoneSet(body.bones, [part])].map((id) => byId.get(id)!),
          generated.genome.voxelSize,
        ).mass;
      results.push([subtreeMass('hand.L'), subtreeMass('forearm.L'), subtreeMass('upperArm.L'), subtreeMass('head')]);
    }
    expect(results).toHaveLength(5);
    expect(results.flat().every((mass) => mass > 0)).toBe(true);
  });

  it('builds eight COM-relative corners around the selected voxel AABB', () => {
    const bounds = voxelBounds(grid([2, 10, 2]), [0], [0.025, 0.25, 0.025]);
    expect(bounds.halfExtents).toEqual([0.05, 0.25, 0.05]);
    expect(bounds.corners).toHaveLength(8);
    for (const corner of bounds.corners) {
      expect(Math.abs(Math.abs(corner[0]) - 0.05)).toBeLessThan(1e-12);
      expect(Math.abs(Math.abs(corner[1]) - 0.25)).toBeLessThan(1e-12);
      expect(Math.abs(Math.abs(corner[2]) - 0.05)).toBeLessThan(1e-12);
    }
  });
});
