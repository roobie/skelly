import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, Resolved } from '@skelly/engine/assembly/schema.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import { meshForSolid } from '@skelly/engine/shapes/mesh.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import { drawnGeometry } from '../src/drawn.ts';
import { modelParts } from '../src/physical.ts';
import { voxelize } from '../src/voxelize.ts';

const GRAIN = 0.1;
// Every face sits off the lattice, so a datum read off the authored solid would stand apart from the drawn voxels.
const slab: Solid = { id: 'slab', kind: 'box', box: { center: [0.33, 0.27, 0.52], half: [0.21, 0.11, 0.16] } };

const fixture = (solids: readonly Solid[] = [slab]): Resolved => {
  const domain: Domain = {
    name: 'fixture',
    units: { metresPerUnit: 1, grid: 1, bevel: 0 },
    axisRules: [],
    families: {
      shape: {
        name: 'shape',
        params: {},
        build: () => ({ family: 'shape', solids: [...solids], ports: [], keepOuts: [], axes: [] }),
      },
    },
  };
  const resolved = resolve(
    { name: 'fixture', root: 'body', parts: { body: { family: 'shape' } }, connections: [] },
    domain,
  );
  if (resolved.issues.length > 0) {
    throw new Error(JSON.stringify(resolved.issues));
  }
  return resolved;
};

/** The bounds of what `voxelize` draws for the solids sampled together, the geometry the file holds. */
const drawnBounds = (solids: readonly Solid[] = [slab]): [Vec3, Vec3] => {
  const sources = solids.map((solid) => {
    const mesh = meshForSolid(solid, 0);
    return { positions: mesh.positions, indices: mesh.indices, group: 0 };
  });
  const [buffers] = voxelize(sources, GRAIN).groups.values();
  const { positions } = buffers!;
  const low = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const high = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let v = 0; v < positions.length; v += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis]!, positions[v + axis]!);
      high[axis] = Math.max(high[axis]!, positions[v + axis]!);
    }
  }
  return [low as unknown as Vec3, high as unknown as Vec3];
};

const onLattice = (value: number): boolean => Math.abs(value / GRAIN - Math.round(value / GRAIN)) < 1e-6;

describe('datums read off the drawn voxels', () => {
  it('gives a solid the collision box of the voxels it draws', () => {
    const resolved = fixture();
    const drawn = drawnGeometry(resolved, { voxelGrain: GRAIN });
    const parts = modelParts(resolved, (_id, part) => ({ part, massKg: 1 }), { collision: true, drawn });
    const [box] = parts.body!.collision!;
    const [low, high] = drawnBounds();
    for (let axis = 0; axis < 3; axis += 1) {
      expect(box!.min[axis]).toBeCloseTo(low[axis]!, 6);
      expect(box!.max[axis]).toBeCloseTo(high[axis]!, 6);
      expect(onLattice(box!.min[axis]!) && onLattice(box!.max[axis]!)).toBe(true);
    }
  });

  it('puts a point on a solid face onto the drawn face, and its middle on the drawn middle', () => {
    const drawn = drawnGeometry(fixture(), { voxelGrain: GRAIN });
    const { center, half } = slab.box;
    const top = drawn.point([center[0], center[1] + half[1], center[2]]);
    const [low, high] = drawnBounds();
    expect(top[1]).toBeCloseTo(high[1], 6);
    for (const axis of [0, 2]) {
      expect(top[axis]).toBeCloseTo((low[axis]! + high[axis]!) / 2, 6);
    }
  });

  // A block split on its diagonal into two solids that meet face to face: sampled alone, each piece would keep a
  // voxel outside the block where the seam clips its corner, though the file draws none there.
  it('puts a point on a face of solids that meet onto the face the file draws', () => {
    const [low, high, height] = [0.06, 0.66, 0.36];
    const prism = (id: string, profile: readonly (readonly [number, number])[]): Solid => ({
      id,
      kind: 'extruded-polygon',
      profile,
      z: [0, height],
    });
    const pieces = [
      prism('lower', [
        [low, low],
        [high, low],
        [low, high],
      ]),
      prism('upper', [
        [high, low],
        [high, high],
        [low, high],
      ]),
    ];
    const drawn = drawnGeometry(fixture(pieces), { voxelGrain: GRAIN });
    const face = drawn.point([low, (low + high) / 2, height / 2]);
    const [drawnLow, drawnHigh] = drawnBounds(pieces);
    expect(face[0]).toBeCloseTo(drawnLow[0], 6);
    for (const axis of [1, 2]) {
      expect(face[axis]).toBeGreaterThanOrEqual(drawnLow[axis]!);
      expect(face[axis]).toBeLessThanOrEqual(drawnHigh[axis]!);
    }
  });

  it('puts the centre of mass at the centroid of the drawn voxels', () => {
    const resolved = fixture();
    const parts = modelParts(resolved, (_id, part) => ({ part, massKg: 1 }), {
      drawn: drawnGeometry(resolved, { voxelGrain: GRAIN }),
    });
    const [low, high] = drawnBounds();
    for (let axis = 0; axis < 3; axis += 1) {
      expect(parts.body!.centreOfMass[axis]).toBeCloseTo((low[axis]! + high[axis]!) / 2, 6);
    }
  });
});
