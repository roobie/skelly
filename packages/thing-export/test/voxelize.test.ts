import { describe, expect, it } from 'vitest';
import { type VoxelBuffers, voxelize } from '../src/voxelize.ts';

const POSITIVE = /positive/;

/** A closed axis-aligned box as twelve outward-facing triangles. */
const box = (min: readonly number[], max: readonly number[], group = 0) => {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
    i & 1 ? max[0]! : min[0]!,
    i & 2 ? max[1]! : min[1]!,
    i & 4 ? max[2]! : min[2]!,
  ]);
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  return {
    positions: corners.flat(),
    indices: quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]),
    group,
  };
};

/** The volume a triangle mesh encloses, by the divergence theorem: right only when the surface is closed and outward. */
const enclosedVolume = ({ positions, indices }: VoxelBuffers): number => {
  let sum = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      Array.from(positions.subarray(indices[t + k]! * 3, indices[t + k]! * 3 + 3)),
    );
    sum +=
      (a![0]! * (b![1]! * c![2]! - b![2]! * c![1]!) +
        a![1]! * (b![2]! * c![0]! - b![0]! * c![2]!) +
        a![2]! * (b![0]! * c![1]! - b![1]! * c![0]!)) /
      6;
  }
  return sum;
};

describe('voxelize', () => {
  const grain = 0.05;

  it('turns a closed mesh into a closed outward voxel mesh of the same extent', () => {
    const { groups, stats } = voxelize([box([0.01, 0.02, 0.0], [0.31, 0.16, 0.2])], grain);
    const [mesh] = [...groups.values()];
    expect(stats.voxels).toBeGreaterThan(0);
    expect(enclosedVolume(mesh!)).toBeCloseTo(stats.voxels * grain ** 3, 6);
    const extent = (axis: number): number => {
      const values = Array.from(mesh!.positions).filter((_, i) => i % 3 === axis);
      return Math.max(...values) - Math.min(...values);
    };
    expect(extent(0)).toBeCloseTo(0.3, 0);
    expect(Math.abs(extent(1) - 0.14)).toBeLessThanOrEqual(grain);
    expect(Math.abs(extent(2) - 0.2)).toBeLessThanOrEqual(grain);
  });

  it('merges flat faces into fewer quads than faces', () => {
    const { stats } = voxelize([box([0, 0, 0], [0.4, 0.4, 0.4])], grain);
    expect(stats.quads).toBe(6);
    expect(stats.faces).toBeGreaterThan(stats.quads);
  });

  it('keeps a plate thinner than the grain as one voxel layer', () => {
    const { stats } = voxelize([box([0, 0, 0.011], [0.2, 0.2, 0.013])], grain);
    expect(stats.voxels).toBe(16);
  });

  it('lets a later source paint over an earlier one and meshes each group alone', () => {
    const { groups, stats } = voxelize(
      [box([0, 0, 0], [0.2, 0.2, 0.2], 0), box([0.1, 0.1, 0.1], [0.3, 0.2, 0.2], 1)],
      grain,
    );
    expect(new Set(groups.keys())).toEqual(new Set([0, 1]));
    expect(stats.voxels).toBe(72);
  });

  it('puts every voxel corner on the lattice that starts at the given origin', () => {
    const origin = [0.013, -0.021, 0.034];
    const { groups } = voxelize([box([0.01, 0.02, 0.0], [0.31, 0.16, 0.2])], grain, origin);
    const [mesh] = [...groups.values()];
    expect(mesh!.positions.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh!.positions.length; i += 1) {
      const cells = (mesh!.positions[i]! - origin[i % 3]!) / grain;
      expect(Math.abs(cells - Math.round(cells))).toBeLessThan(1e-3);
    }
  });

  it('refuses a grain that is not a positive number', () => {
    expect(() => voxelize([box([0, 0, 0], [1, 1, 1])], 0)).toThrow(POSITIVE);
    expect(() => voxelize([box([0, 0, 0], [1, 1, 1])], Number.NaN)).toThrow(POSITIVE);
  });
});
