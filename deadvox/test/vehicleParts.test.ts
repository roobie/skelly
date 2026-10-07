import { describe, expect, it } from 'vitest';
import { pairAcross } from '../src/vehicles/authoring.ts';
import { CATALOGUE } from '../src/vehicles/catalogue.ts';
import {
  addFitting,
  type Blueprint,
  catalogueOf,
  type Fitting,
  newInstance,
  noiseRadius,
  PartLibrary,
  type PartType,
  partTypeOf,
  removeFitting,
  supportProblems,
} from '../src/vehicles/model.ts';
import { MOTORBIKE } from '../src/vehicles/motorbike.ts';
import { PICKUP } from '../src/vehicles/pickup.ts';
import { RANGE_ROVER, STRIPPED_REMOVED } from '../src/vehicles/rangeRover.ts';
import {
  GLASS,
  keyVoxel,
  type MeshBuffers,
  meshGrid,
  rasterize,
  type VoxelGrid,
  voxelKey,
} from '../src/vehicles/voxels.ts';
import { WEAR_MATERIALS, wearGrid, wearKey } from '../src/vehicles/wear.ts';

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

const library = new PartLibrary(CATALOGUE);

/** Every blueprint built from parts, with the fittings each of its builds is made without. */
const BLUEPRINTS: readonly { readonly blueprint: Blueprint; readonly builds: readonly (readonly string[])[] }[] = [
  { blueprint: RANGE_ROVER, builds: [[], STRIPPED_REMOVED] },
  { blueprint: PICKUP, builds: [[]] },
  { blueprint: MOTORBIKE, builds: [[]] },
];

describe.each(BLUEPRINTS)('$blueprint.id built from parts', ({ blueprint, builds }) => {
  const { fittings } = newInstance(blueprint, 'complete');
  const byId = new Map(fittings.map((fitting) => [fitting.id, fitting]));

  it('starts every build with each fitted part resting only on fitted parts, and no support cycles', () => {
    for (const without of builds) {
      expect(supportProblems(newInstance(blueprint, 'build', without).fittings)).toEqual([]);
    }
  });

  it('rests every fitting, through its supports, on a frame part that stands on nothing', () => {
    const roots = fittings.filter((fitting) => fitting.supportedBy.length === 0);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.filter((fitting) => partTypeOf(CATALOGUE, fitting).layer !== 'frame').map(({ id }) => id)).toEqual([]);
  });

  it('has every fitting touch each fitting it rests on, so no panel floats', () => {
    const floating = fittings.flatMap((fitting) =>
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
    const below = fittings.filter((fitting) => library.placed(fitting).bounds.min[1] < 0).map(({ id }) => id);
    expect(below).toEqual([]);
  });

  it('places no two fittings in the same voxel', () => {
    const owner = new Map<number, string>();
    const clashes = new Map<string, string>();
    for (const fitting of fittings) {
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
  const site = { origin: [0, 0, 0] as const, wheels: [[39, 12, 12] as const] };
  const gridOf = (fitting: Fitting): VoxelGrid => library.grid(fitting.type, fitting.mirror === true);

  it('only recolours paint and seams into wear shades, never changing a part’s shape', () => {
    let changed = 0;
    for (const fitting of RANGE_ROVER.fittings) {
      const grid = gridOf(fitting);
      const key = wearKey('rover', fitting.id);
      const worn = wearGrid(grid, key, 1, site);
      expect([...worn.keys()].sort(), fitting.id).toEqual([...grid.keys()].sort());
      for (const [voxel, mat] of worn) {
        const before = grid.get(voxel)!;
        if (mat !== before) {
          changed += 1;
          expect(['paint', 'seam'], fitting.id).toContain(before);
          expect(WEAR_MATERIALS, fitting.id).toContain(mat);
        }
      }
      expect(wearGrid(grid, key, 0, site), fitting.id).toEqual(grid);
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('wears two vehicles of one blueprint differently', () => {
    const differs = RANGE_ROVER.fittings.some((fitting) => {
      const grid = gridOf(fitting);
      const first = wearGrid(grid, wearKey('first', fitting.id), 1, site);
      const second = wearGrid(grid, wearKey('second', fitting.id), 1, site);
      return [...first].some(([voxel, mat]) => second.get(voxel) !== mat);
    });
    expect(differs).toBe(true);
  });
});

describe('engine noise from fitted parts', () => {
  const vehicles = BLUEPRINTS.map(({ blueprint }) => newInstance(blueprint, 'complete'));
  const isSource = (fitting: Fitting): boolean => (partTypeOf(CATALOGUE, fitting).noise?.radiusMetres ?? 0) > 0;

  it('never gets quieter when a part that makes no noise comes off, and some part damps it', () => {
    for (const { blueprint, fittings } of vehicles) {
      const complete = noiseRadius(CATALOGUE, fittings);
      const withoutEach = fittings
        .filter((fitting) => !isSource(fitting))
        .map((fitting) => ({
          id: fitting.id,
          radius: noiseRadius(
            CATALOGUE,
            fittings.filter((other) => other !== fitting),
          ),
        }));
      expect(
        withoutEach.filter(({ radius }) => radius < complete).map(({ id }) => id),
        blueprint,
      ).toEqual([]);
      expect(
        withoutEach.some(({ radius }) => radius > complete),
        blueprint,
      ).toBe(true);
    }
  });

  it('makes engine noise only while a source is fitted', () => {
    for (const { blueprint, fittings } of vehicles) {
      expect(noiseRadius(CATALOGUE, fittings), blueprint).toBeGreaterThan(0);
      expect(
        noiseRadius(
          CATALOGUE,
          fittings.filter((fitting) => !isSource(fitting)),
        ),
        blueprint,
      ).toBe(0);
    }
  });
});

describe('fitting and removing parts', () => {
  const fitting = (id: string, supportedBy: readonly string[]): Fitting => ({
    id,
    type: 'block',
    at: [0, 0, 0],
    supportedBy,
  });
  const blueprint: Blueprint = {
    id: 'fixture',
    label: 'fixture',
    lattice: [1, 1, 1],
    paint: { body: '#000000', seam: '#000000' },
    fittings: [fitting('post-a', []), fitting('post-b', []), fitting('roof', ['post-a', 'post-b'])],
  };
  const ids = (fittings: readonly Fitting[]): readonly string[] => fittings.map(({ id }) => id);

  it('refuses to take off a part another rests on, or to fit one before all its supports', () => {
    const vehicle = newInstance(blueprint, 'vehicle');
    expect(ids(removeFitting(vehicle, 'post-a'))).toEqual(['roof']);
    expect(ids(vehicle.fittings)).toContain('post-a');
    expect(removeFitting(vehicle, 'roof')).toEqual([]);
    expect(removeFitting(vehicle, 'post-a')).toEqual([]);
    expect(addFitting(vehicle, fitting('roof', ['post-a', 'post-b']))).toEqual(['post-a']);
    expect(ids(vehicle.fittings)).toEqual(['post-b']);
  });

  it('keeps two vehicles of one blueprint, and the blueprint, independent', () => {
    const first = newInstance(blueprint, 'first');
    const second = newInstance(blueprint, 'second');
    removeFitting(first, 'roof');
    addFitting(second, fitting('beacon', ['roof']));
    expect(ids(first.fittings)).toEqual(['post-a', 'post-b']);
    expect(ids(second.fittings)).toEqual(['post-a', 'post-b', 'roof', 'beacon']);
    expect(ids(blueprint.fittings)).toEqual(['post-a', 'post-b', 'roof']);
  });

  it('reports a part resting on an absent support, and a support cycle', () => {
    const problems = supportProblems([
      ...blueprint.fittings.filter(({ id }) => id !== 'post-b'),
      fitting('left', ['right']),
      fitting('right', ['left']),
    ]);
    const naming = (...names: string[]): readonly string[] =>
      problems.filter((problem) => names.every((name) => problem.includes(name)));
    expect(naming('roof', 'post-b')).toHaveLength(1);
    expect(naming('left', 'right')).toHaveLength(1);
    expect(problems).toHaveLength(2);
  });
});

describe('the part catalogue', () => {
  const wheel: PartType = { id: 'wheel', label: 'Wheel', layer: 'under', massKg: 1, shape: [] };

  it('keeps one type per id: the same type listed twice is one entry, two types under one id are refused', () => {
    expect(Object.keys(catalogueOf([wheel, wheel]))).toEqual(['wheel']);
    expect(() => catalogueOf([wheel, { ...wheel, label: 'Another wheel' }])).toThrow('wheel');
  });
});

describe('mirrored fittings', () => {
  it('places a far-side twin from its own stored position, without the vehicle’s width', () => {
    const bracket: PartType = {
      id: 'bracket',
      label: 'Bracket',
      layer: 'body',
      massKg: 1,
      shape: [
        { op: 'box', from: [0, 0, 0], to: [3, 2, 1], mat: 'red' },
        { op: 'box', from: [0, 0, 1], to: [1, 1, 3], mat: 'red' },
      ],
    };
    const width = 20;
    const [near, far] = pairAcross(width)('bracket', { type: bracket, at: [2, 0, 14] }, []);
    const fixture = new PartLibrary(catalogueOf([bracket]));
    const reflected = [...fixture.placed(near!).grid.keys()].map((key) => {
      const [x, y, z] = keyVoxel(key);
      return voxelKey(x, y, width - 1 - z);
    });
    expect([...fixture.placed(far!).grid.keys()].sort()).toEqual(reflected.sort());
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
