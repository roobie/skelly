import { describe, expect, it } from 'vitest';
import {
  boxFromMinMax,
  type Obb,
  obbPolyhedron,
  penetration,
  penetrationConvex,
  penetrationWorld,
  validateExtrudedPolygon,
  worldBox,
  worldSolid,
} from '../src/core/geometry.ts';
import { IDENTITY, mulMM, rotX, rotY, rotZ } from '../src/core/math.ts';

const CONVEX_ERROR = /convex/i;
const SELF_INTERSECT_ERROR = /self-intersect/i;
const AREA_ERROR = /area/i;
const WINDING_ERROR = /counter-clockwise/i;
const EXTRUSION_ERROR = /extrusion/i;

const aabb = (min: [number, number, number], max: [number, number, number]): Obb =>
  worldBox(IDENTITY, boxFromMinMax(min, max));

describe('penetration', () => {
  const unit = aabb([0, 0, 0], [1, 1, 1]);

  it('is negative for separated boxes', () => {
    expect(penetration(unit, aabb([2, 0, 0], [3, 1, 1]))).toBeCloseTo(-1);
  });

  it('is zero for touching boxes', () => {
    expect(penetration(unit, aabb([1, 0, 0], [2, 1, 1]))).toBeCloseTo(0);
  });

  it('is the shallowest overlap for overlapping boxes', () => {
    expect(penetration(unit, aabb([0.75, 0.5, 0], [2, 2, 1]))).toBeCloseTo(0.25);
  });

  it('handles rotated boxes', () => {
    // A unit cube rotated 45° about Z reaches √2/2 from its centre along X.
    const diamond: Obb = { center: [2, 0.5, 0.5], r: rotZ(45), half: [0.5, 0.5, 0.5] };
    const reach = Math.SQRT1_2;
    expect(penetration(unit, diamond)).toBeCloseTo(reach - 1);
    const closer: Obb = { ...diamond, center: [1.5, 0.5, 0.5] };
    expect(penetration(unit, closer)).toBeCloseTo(reach - 0.5);
  });

  it('matches the box fast path for 300 deterministic random rotated box pairs', () => {
    let state = 0x51_a7;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_00_00_00_00;
    };
    for (let i = 0; i < 300; i++) {
      const randomObb = (): Obb => ({
        center: [next() * 8 - 4, next() * 8 - 4, next() * 8 - 4],
        r: mulMM(mulMM(rotX(next() * 360), rotY(next() * 360)), rotZ(next() * 360)),
        half: [0.1 + next() * 2, 0.1 + next() * 2, 0.1 + next() * 2],
      });
      const a = randomObb();
      const b = randomObb();
      expect(penetrationConvex(obbPolyhedron(a), obbPolyhedron(b))).toBeCloseTo(penetration(a, b), 9);
    }
  });

  it('checks extruded polygons against boxes with signed penetration depth', () => {
    const prism = {
      id: 'test-prism',
      kind: 'extruded-polygon' as const,
      profile: [
        [0.5, 0.5],
        [1.5, 0.5],
        [1.5, 1.5],
        [0.5, 1.5],
      ] as const,
      z: [0.5, 1.5] as const,
    };
    const overlap = worldSolid(IDENTITY, prism);
    expect(penetrationWorld(unit, overlap)).toBeCloseTo(0.5);
    const touching = worldSolid(IDENTITY, {
      ...prism,
      profile: [
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
      ] as const,
      z: [0, 1] as const,
    });
    expect(penetrationWorld(unit, touching)).toBeCloseTo(0);
    const separated = worldSolid(IDENTITY, {
      ...prism,
      profile: [
        [2, 0],
        [3, 0],
        [3, 1],
        [2, 1],
      ] as const,
      z: [0, 1] as const,
    });
    expect(penetrationWorld(unit, separated)).toBeCloseTo(-1);
  });

  it('validates convex profiles and non-empty extrusion depth', () => {
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [2, 0],
          [2, 1],
          [0, 1],
        ],
        [-1, 1],
      ),
    ).toBeUndefined();
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [2, 0],
          [1, 0.5],
          [2, 1],
          [0, 1],
        ],
        [-1, 1],
      ),
    ).toMatch(CONVEX_ERROR);
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
        ],
        [-1, 1],
      ),
    ).toMatch(SELF_INTERSECT_ERROR);
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        [-1, 1],
      ),
    ).toMatch(AREA_ERROR);
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [0, 1],
          [1, 0],
        ],
        [-1, 1],
      ),
    ).toMatch(WINDING_ERROR);
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        [1, 1],
      ),
    ).toMatch(EXTRUSION_ERROR);
  });
});
