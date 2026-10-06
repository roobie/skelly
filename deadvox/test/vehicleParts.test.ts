import { describe, expect, it } from 'vitest';
import {
  dependentsOf,
  type Fitting,
  initialFittings,
  missingSupports,
  noiseRadius,
  PartLibrary,
  partTypeOf,
  supportProblems,
  type Vehicle,
} from '../src/debug/vehicles/model.ts';
import { PICKUP } from '../src/debug/vehicles/pickup.ts';
import { RANGE_ROVER, STRIPPED_REMOVED } from '../src/debug/vehicles/rangeRover.ts';
import {
  GLASS,
  keyVoxel,
  type MeshBuffers,
  meshGrid,
  rasterize,
  type VoxelGrid,
  voxelKey,
} from '../src/debug/vehicles/voxels.ts';
import { WEAR_MATERIALS, wearGrid } from '../src/debug/vehicles/wear.ts';

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

/** Every vehicle built from parts, with the fittings each of its builds leaves off. */
const VEHICLES: readonly { readonly vehicle: Vehicle; readonly builds: readonly (readonly string[])[] }[] = [
  { vehicle: RANGE_ROVER, builds: [[], STRIPPED_REMOVED] },
  { vehicle: PICKUP, builds: [[]] },
];

describe.each(VEHICLES)('$vehicle.id built from parts', ({ vehicle, builds }) => {
  const library = new PartLibrary(vehicle);
  const byId = new Map(vehicle.fittings.map((fitting) => [fitting.id, fitting]));

  it('starts every build with each fitted part resting only on fitted parts, and no support cycles', () => {
    for (const removed of builds) {
      expect(supportProblems(vehicle, initialFittings(vehicle, removed))).toEqual([]);
    }
  });

  it('has every fitting touch each fitting it rests on, so no panel floats', () => {
    const floating = vehicle.fittings.flatMap((fitting) =>
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
    const below = vehicle.fittings.filter((fitting) => library.placed(fitting).bounds.min[1] < 0).map(({ id }) => id);
    expect(below).toEqual([]);
  });

  it('places no two fittings in the same voxel', () => {
    const owner = new Map<number, string>();
    const clashes = new Map<string, string>();
    for (const fitting of vehicle.fittings) {
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

describe('paint wear', () => {
  const library = new PartLibrary(RANGE_ROVER);
  const site = { origin: [0, 0, 0] as const, wheels: [[39, 12, 12] as const] };

  it('only recolours paint and seams into wear shades, never changing a part’s shape', () => {
    let changed = 0;
    for (const fitting of RANGE_ROVER.fittings) {
      const grid = library.grid(fitting.type, fitting.mirror === true);
      const worn = wearGrid(grid, fitting.id, 1, site);
      expect([...worn.keys()].sort(), fitting.id).toEqual([...grid.keys()].sort());
      for (const [key, mat] of worn) {
        const before = grid.get(key)!;
        if (mat !== before) {
          changed += 1;
          expect(['paint', 'seam'], fitting.id).toContain(before);
          expect(WEAR_MATERIALS, fitting.id).toContain(mat);
        }
      }
      expect(wearGrid(grid, fitting.id, 0, site), fitting.id).toEqual(grid);
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe('engine noise from installed fittings', () => {
  const vehicles = VEHICLES.map(({ vehicle }) => vehicle);
  const isSource = (vehicle: Vehicle, fitting: Fitting): boolean =>
    (partTypeOf(vehicle, fitting).noise?.radiusMetres ?? 0) > 0;
  const allOf = (vehicle: Vehicle): Set<string> => new Set(vehicle.fittings.map(({ id }) => id));

  it('never gets quieter when a part that makes no noise comes off, and some part damps it', () => {
    for (const vehicle of vehicles) {
      const installed = allOf(vehicle);
      const complete = noiseRadius(vehicle, installed);
      const withoutEach = vehicle.fittings
        .filter((fitting) => !isSource(vehicle, fitting))
        .map((fitting) => ({
          id: fitting.id,
          radius: noiseRadius(vehicle, new Set([...installed].filter((id) => id !== fitting.id))),
        }));
      expect(
        withoutEach.filter(({ radius }) => radius < complete).map(({ id }) => id),
        vehicle.id,
      ).toEqual([]);
      expect(
        withoutEach.some(({ radius }) => radius > complete),
        vehicle.id,
      ).toBe(true);
    }
  });

  it('makes engine noise only while a source is fitted', () => {
    for (const vehicle of vehicles) {
      expect(noiseRadius(vehicle, allOf(vehicle)), vehicle.id).toBeGreaterThan(0);
      const silent = new Set(vehicle.fittings.filter((fitting) => !isSource(vehicle, fitting)).map(({ id }) => id));
      expect(noiseRadius(vehicle, silent), vehicle.id).toBe(0);
    }
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

  it('reports a part fitted without its support, an unknown support and a support cycle', () => {
    const broken: Vehicle = {
      ...vehicle,
      fittings: [
        ...vehicle.fittings,
        fitting('beam', ['ghost']),
        fitting('left', ['right']),
        fitting('right', ['left']),
      ],
    };
    const problems = supportProblems(broken, new Set(['post-a', 'roof']));
    const naming = (...ids: string[]): readonly string[] =>
      problems.filter((problem) => ids.every((id) => problem.includes(id)));
    expect(naming('roof', 'post-b')).toHaveLength(1);
    expect(naming('beam', 'ghost')).toHaveLength(1);
    expect(naming('left', 'right')).toHaveLength(1);
    expect(problems).toHaveLength(3);
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

  /** One unit face: its material, outward normal, the plane it lies in and its minimum corner in that plane. */
  const unitFace = (mat: string | undefined, normal: readonly number[], corner: readonly number[]): string => {
    const axis = normal.findIndex((component) => component !== 0);
    const inPlane = [0, 1, 2].filter((k) => k !== axis).map((k) => corner[k]);
    return `${mat} ${normal.join(',')} @${corner[axis]} ${inPlane.join(',')}`;
  };

  /** Every exposed face, one voxel face at a time. */
  const naiveFaces = (grid: VoxelGrid, clear: boolean): string[] =>
    [...grid]
      .filter(([, mat]) => isClear(mat) === clear)
      .flatMap(([key, mat]) => {
        const voxel = keyVoxel(key);
        const [x, y, z] = voxel;
        return FACES.filter(([fx, fy, fz]) => !hidden(grid.get(voxelKey(x + fx, y + fy, z + fz)), clear)).map(
          (normal) =>
            unitFace(
              mat,
              normal,
              voxel.map((v, k) => v + Math.max(normal[k]!, 0)),
            ),
        );
      })
      .sort();

  /** The same list from a mesh: each quad split into the unit faces it covers, so a doubled or misplaced face shows. */
  const meshedFaces = (buffers: MeshBuffers): string[] => {
    const { positions, normals, colors, indices } = buffers;
    const faces: string[] = [];
    for (let q = 0; q < indices.length; q += 6) {
      const corners = [indices[q]!, indices[q + 1]!, indices[q + 2]!, indices[q + 5]!].map((i) => [
        positions[i * 3]!,
        positions[i * 3 + 1]!,
        positions[i * 3 + 2]!,
      ]);
      const min = [0, 1, 2].map((k) => Math.min(...corners.map((corner) => corner[k]!)));
      const max = [0, 1, 2].map((k) => Math.max(...corners.map((corner) => corner[k]!)));
      const first = indices[q]! * 3;
      const normal = [normals[first]!, normals[first + 1]!, normals[first + 2]!];
      const mat = matOf([colors[first]!, colors[first + 1]!, colors[first + 2]!]);
      const [u, v] = [0, 1, 2].filter((k) => normal[k] === 0) as [number, number];
      for (let a = min[u]!; a < max[u]!; a += 1) {
        for (let b = min[v]!; b < max[v]!; b += 1) {
          const corner = [...min];
          corner[u] = a;
          corner[v] = b;
          faces.push(unitFace(mat, normal, corner));
        }
      }
    }
    return faces.sort();
  };

  it('covers exactly the exposed faces, each once, in fewer quads', () => {
    const { solid, clear } = meshGrid(fixture, colorOf, isClear);
    expect(meshedFaces(solid)).toEqual(naiveFaces(fixture, false));
    expect(meshedFaces(clear)).toEqual(naiveFaces(fixture, true));
    expect(solid.quads).toBeLessThan(naiveFaces(fixture, false).length);
  });
});
