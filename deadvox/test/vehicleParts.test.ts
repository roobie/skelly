import { describe, expect, it } from 'vitest';
import {
  dependentsOf,
  type Fitting,
  initialFittings,
  missingSupports,
  PartLibrary,
  supportProblems,
  type Vehicle,
} from '../src/debug/vehicles/model.ts';
import { RANGE_ROVER, STRIPPED_REMOVED } from '../src/debug/vehicles/rangeRover.ts';
import { GLASS, keyVoxel, meshGrid, rasterize, type VoxelGrid, voxelKey } from '../src/debug/vehicles/voxels.ts';

const FACES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

const touches = (part: VoxelGrid, support: VoxelGrid): boolean =>
  [...part.keys()].some((key) => {
    const [x, y, z] = keyVoxel(key);
    return FACES.some(([dx, dy, dz]) => support.has(voxelKey(x + dx, y + dy, z + dz)));
  });

describe('the 4×4 built from parts', () => {
  const library = new PartLibrary(RANGE_ROVER);
  const byId = new Map(RANGE_ROVER.fittings.map((fitting) => [fitting.id, fitting]));

  it('starts every build with each fitted part resting only on fitted parts, and no support cycles', () => {
    expect(supportProblems(RANGE_ROVER, initialFittings(RANGE_ROVER, []))).toEqual([]);
    expect(supportProblems(RANGE_ROVER, initialFittings(RANGE_ROVER, STRIPPED_REMOVED))).toEqual([]);
  });

  it('has every fitting touch each fitting it rests on, so no panel floats', () => {
    const floating = RANGE_ROVER.fittings.flatMap((fitting) =>
      fitting.supportedBy
        .filter((id) => {
          const support = byId.get(id);
          return !(support && touches(library.placed(fitting).grid, library.placed(support).grid));
        })
        .map((id) => `${fitting.id} does not touch ${id}`),
    );
    expect(floating).toEqual([]);
  });

  it('keeps every fitting above the ground it stands on', () => {
    const below = RANGE_ROVER.fittings
      .filter((fitting) => library.placed(fitting).bounds.min[1] < 0)
      .map(({ id }) => id);
    expect(below).toEqual([]);
  });

  it('places no two fittings in the same voxel', () => {
    const owner = new Map<number, string>();
    const clashes = new Map<string, string>();
    for (const fitting of RANGE_ROVER.fittings) {
      for (const key of library.placed(fitting).grid.keys()) {
        const other = owner.get(key);
        if (other && !clashes.has(`${other} / ${fitting.id}`)) {
          clashes.set(`${other} / ${fitting.id}`, `first at ${keyVoxel(key).join(',')}`);
        }
        owner.set(key, fitting.id);
      }
    }
    expect(Object.fromEntries(clashes)).toEqual({});
  });
});

describe('fitting and removing parts', () => {
  const part = { label: 'block', layer: 'body', massKg: 1, shape: [] } as const;
  const fitting = (id: string, supportedBy: readonly string[]): Fitting => ({
    id,
    type: 'block',
    at: [0, 0, 0],
    supportedBy,
  });
  const vehicle: Vehicle = {
    id: 'fixture',
    label: 'fixture',
    lattice: [1, 1, 1],
    palette: {},
    parts: { block: { id: 'block', ...part } },
    fittings: [fitting('post-a', []), fitting('post-b', []), fitting('roof', ['post-a', 'post-b'])],
  };

  it('refuses to take off a part another rests on, or to fit one before all its supports', () => {
    expect(dependentsOf(vehicle, new Set(['post-a', 'post-b', 'roof']), 'post-a').map(({ id }) => id)).toEqual([
      'roof',
    ]);
    expect(dependentsOf(vehicle, new Set(['post-a', 'post-b']), 'post-a')).toEqual([]);
    expect(missingSupports(vehicle, new Set(['post-a']), 'roof')).toEqual(['post-b']);
  });
});

describe('greedy voxel meshing', () => {
  const fixture = rasterize([
    { op: 'box', from: [0, 0, 0], to: [6, 3, 4], mat: 'red' },
    { op: 'box', from: [2, 3, 0], to: [5, 5, 4], mat: 'blue' },
    { op: 'box', from: [3, 1, 1], to: [4, 2, 3], mat: 'air' },
    {
      op: 'prism',
      axis: 'z',
      profile: [
        [0, 3],
        [2, 3],
        [2, 6],
      ],
      from: 1,
      to: 3,
      mat: GLASS,
    },
    { op: 'cylinder', axis: 'x', center: [2, 6], radius: 1.6, from: 5, to: 8, mat: 'red' },
    { op: 'box', from: [6, 4, 1], to: [8, 5, 3], mat: GLASS },
    { op: 'box', from: [0, 0, 4], to: [3, 2, 6], mat: 'red' },
    { op: 'box', from: [3, 0, 4], to: [6, 2, 6], mat: 'blue' },
  ]);
  const isClear = (mat: string): boolean => mat === GLASS;
  const Colors: Readonly<Record<string, readonly [number, number, number]>> = {
    red: [1, 0, 0],
    blue: [0, 0, 1],
    [GLASS]: [0, 1, 0],
  };
  const colorOf = (mat: string): readonly [number, number, number] => Colors[mat] ?? [0, 0, 0];
  const matOf = (rgb: readonly number[]): string | undefined =>
    Object.keys(Colors).find((mat) => colorOf(mat).every((channel, k) => channel === rgb[k]));
  /** Glass hides behind anything; an opaque face hides only behind another opaque voxel. */
  const hidden = (neighbour: string | undefined, clear: boolean): boolean =>
    neighbour !== undefined && (clear || !isClear(neighbour));

  /** Face area per material and direction, counted one voxel face at a time. */
  const naiveFaces = (grid: VoxelGrid, clear: boolean): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const [key, mat] of [...grid].filter(([, value]) => isClear(value) === clear)) {
      const [x, y, z] = keyVoxel(key);
      const exposed = FACES.filter(([fx, fy, fz]) => !hidden(grid.get(voxelKey(x + fx, y + fy, z + fz)), clear));
      for (const [dx, dy, dz] of exposed) {
        const id = `${mat} ${dx},${dy},${dz}`;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  };

  /** The same tally from a mesh: each quad's area under its colour's material and its normal. */
  const meshedFaces = (positions: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint32Array) => {
    const counts = new Map<string, number>();
    for (let q = 0; q < indices.length; q += 6) {
      const [a, b, , d] = [indices[q]!, indices[q + 1]!, indices[q + 2]!, indices[q + 5]!];
      const corner = (i: number): number[] => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
      const edge1 = corner(b).map((value, k) => value - corner(a)[k]!);
      const edge2 = corner(d).map((value, k) => value - corner(a)[k]!);
      const area = Math.hypot(
        edge1[1]! * edge2[2]! - edge1[2]! * edge2[1]!,
        edge1[2]! * edge2[0]! - edge1[0]! * edge2[2]!,
        edge1[0]! * edge2[1]! - edge1[1]! * edge2[0]!,
      );
      const mat = matOf([colors[a * 3]!, colors[a * 3 + 1]!, colors[a * 3 + 2]!]);
      const id = `${mat} ${normals[a * 3]},${normals[a * 3 + 1]},${normals[a * 3 + 2]}`;
      counts.set(id, (counts.get(id) ?? 0) + Math.round(area));
    }
    return counts;
  };

  it('covers exactly the exposed faces, per material and direction, in fewer quads', () => {
    const { solid, clear } = meshGrid(fixture, colorOf, isClear);
    const sorted = (counts: Map<string, number>): [string, number][] =>
      [...counts].sort(([a], [b]) => a.localeCompare(b));
    expect(sorted(meshedFaces(solid.positions, solid.normals, solid.colors, solid.indices))).toEqual(
      sorted(naiveFaces(fixture, false)),
    );
    expect(sorted(meshedFaces(clear.positions, clear.normals, clear.colors, clear.indices))).toEqual(
      sorted(naiveFaces(fixture, true)),
    );
    const faces = [...naiveFaces(fixture, false).values()].reduce((sum, n) => sum + n, 0);
    expect(solid.quads).toBeLessThan(faces);
  });
});
