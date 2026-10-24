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

  // A rod of diamond section around a lattice edge, like a thin round on its side: wider than a voxel across, yet
  // every centre lies outside it, while the sample columns either side cross it in a short chord.
  const diamondRod = () => {
    const r = 0.03;
    const diamond = [
      [r, 0],
      [0, r],
      [-r, 0],
      [0, -r],
    ];
    const positions = [0, 0.2].flatMap((x) => diamond.flatMap(([y, z]) => [x, y!, z!]));
    const sides = [0, 1, 2, 3].flatMap((i) => {
      const j = (i + 1) % 4;
      return [i, j, j + 4, i, j + 4, i + 4];
    });
    return { positions, indices: [...sides, 0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7], group: 0 };
  };
  it.each([
    ['a solid wider than the grain', diamondRod()],
    ['a speck no sample line crosses', box([0.001, 0.001, 0.001], [0.004, 0.004, 0.004])],
  ])('keeps a voxel for %s that holds no voxel centre', (_, solid) => {
    expect(voxelize([solid], grain).stats.voxels).toBeGreaterThan(0);
  });

  // A wall a fifth of a voxel thick, set on the diagonal so its box is wider than a voxel every way, like a trigger
  // guard's bar or a scope tube's shell.
  const diagonalWall = (from: readonly number[], to: readonly number[], height: number, group = 0) => {
    const thickness = grain / 5;
    const length = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!);
    const along = [(to[0]! - from[0]!) / length, (to[1]! - from[1]!) / length];
    const across = [-along[1]! * (thickness / 2), along[0]! * (thickness / 2)];
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const end = i & 1 ? to : from;
      const side = i & 2 ? 1 : -1;
      return [end[0]! + side * across[0]!, end[1]! + side * across[1]!, i & 4 ? height : 0];
    });
    return { ...box([0, 0, 0], [1, 1, 1], group), positions: corners.flat() };
  };
  /** The heights of one drawn result's z faces, by column of cells: each column's heights pair up into filled runs. */
  const zFaces = ({ groups }: ReturnType<typeof voxelize>): Map<string, number[]> => {
    const runs = new Map<string, number[]>();
    for (const { positions, normals, indices } of groups.values()) {
      for (let t = 0; t < indices.length; t += 6) {
        const corners = [0, 1, 2, 5].map((k) => indices[t + k]!);
        if (normals[corners[0]! * 3 + 2] === 0) {
          continue;
        }
        const cells = (axis: number) => corners.map((v) => Math.round(positions[v * 3 + axis]! / grain));
        const [xs, ys] = [cells(0), cells(1)];
        const columns = Array.from({ length: Math.max(...xs) - Math.min(...xs) }, (_row, i) =>
          Array.from(
            { length: Math.max(...ys) - Math.min(...ys) },
            (_column, j) => `${Math.min(...xs) + i},${Math.min(...ys) + j}`,
          ),
        ).flat();
        for (const column of columns) {
          runs.set(column, [...(runs.get(column) ?? []), cells(2)[0]!]);
        }
      }
    }
    return runs;
  };
  const filledCells = (voxelized: ReturnType<typeof voxelize>[]): Set<string> => {
    const cells = new Set<string>();
    for (const [column, heights] of voxelized.flatMap((result) => [...zFaces(result)])) {
      heights.sort((p, q) => p - q);
      for (let i = 0; i + 1 < heights.length; i += 2) {
        for (let z = heights[i]!; z < heights[i + 1]!; z += 1) {
          cells.add(`${column},${z}`);
        }
      }
    }
    return cells;
  };
  const Steps = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  /** The 6-connected bodies of the cells read back off the drawn results; each result's cells are read on their own. */
  const bodies = (...voxelized: ReturnType<typeof voxelize>[]): number => {
    const cells = filledCells(voxelized);
    const seen = new Set<string>();
    const flood = (start: string): void => {
      const stack = [start];
      seen.add(start);
      while (stack.length > 0) {
        const at = stack.pop()!.split(',').map(Number);
        const next = Steps.map((step) => step.map((d, axis) => at[axis]! + d).join(','));
        for (const cell of next.filter((key) => cells.has(key) && !seen.has(key))) {
          seen.add(cell);
          stack.push(cell);
        }
      }
    };
    let count = 0;
    for (const start of cells) {
      if (!seen.has(start)) {
        count += 1;
        flood(start);
      }
    }
    return count;
  };
  const diamondTube = (r: number, height: number) =>
    [
      [r, 0],
      [0, r],
      [-r, 0],
      [0, -r],
    ].map((corner, i, all) => diagonalWall(corner, all[(i + 1) % 4]!, height));
  it.each([
    [
      'two blocks joined by a wall thinner than a voxel',
      [
        box([0, 0, 0], [0.15, 0.15, 0.15]),
        diagonalWall([0.1, 0.1], [0.4, 0.45], 0.15),
        box([0.35, 0.4, 0], [0.5, 0.55, 0.15], 1),
      ],
    ],
    [
      'a block enclosed by a tube whose wall is thinner than a voxel',
      [...diamondTube(0.2, 0.3), box([-0.1, -0.1, 0.1], [0.1, 0.1, 0.2], 1)],
    ],
  ])('draws %s as one connected body', (_, sources) => {
    const voxelized = voxelize(sources, grain);
    expect(voxelized.groups.size).toBe(2);
    expect(bodies(voxelized)).toBe(1);
  });

  // Two parts: a block, and a bar thinner than a voxel that runs out from its edge on the diagonal, so the bar's first
  // voxel meets the block's last only along an edge.
  it('draws a part that meets its neighbour joined to the neighbour', () => {
    const block = box([0, 0, 0], [0.2, 0.2, 0.15]);
    const bar = diagonalWall([0.2, 0.2], [0.45, 0.47], 0.15);
    expect(bodies(voxelize([block], grain, [0, 0, 0], [bar]), voxelize([bar], grain, [0, 0, 0], [block]))).toBe(1);
  });

  /** A closed prism over a counter-clockwise triangle in x and y, from z = 0 to `height`. */
  const prism = (triangle: readonly (readonly number[])[], height: number) => {
    const sides = [0, 1, 2].flatMap((i) => {
      const j = (i + 1) % 3;
      return [i, j, j + 3, i, j + 3, i + 3];
    });
    return {
      positions: [0, height].flatMap((z) => triangle.flatMap(([x, y]) => [x!, y!, z])),
      indices: [0, 2, 1, 3, 4, 5, ...sides],
      group: 0,
    };
  };
  // A block split on its diagonal, like the facets of a curved magazine body: near the far corners the sample lines
  // cross one piece in a stretch too short to hold a voxel centre, though the block is thick there.
  it('draws a solid split into pieces that meet face to face as it draws the whole solid', () => {
    const [low, high, height] = [0.03, 0.33, 0.18];
    const pieces = [
      prism(
        [
          [low, low],
          [high, low],
          [low, high],
        ],
        height,
      ),
      prism(
        [
          [high, low],
          [high, high],
          [low, high],
        ],
        height,
      ),
    ];
    const whole = filledCells([voxelize([box([low, low, 0], [high, high, height])], grain)]);
    expect(whole.size).toBeGreaterThan(0);
    expect(filledCells([voxelize(pieces, grain)])).toEqual(whole);
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
