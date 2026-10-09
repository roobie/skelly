import {
  boxFromMinMax,
  clipConvexPolyhedron,
  distanceWorld,
  localSolidBounds,
  type Obb,
  obbPolyhedron,
  penetration,
  penetrationConvex,
  penetrationWorld,
  validateExtrudedPolygon,
  worldBox,
  worldSolid,
} from '@skelly/engine/core/geometry.ts';
import { IDENTITY, mulMM, rotX, rotY, rotZ } from '@skelly/engine/core/math.ts';
import type { Solid } from '@skelly/engine/core/schema.ts';
import { describe, expect, it } from 'vitest';

const CONVEX_ERROR = /convex/i;
const SELF_INTERSECT_ERROR = /self-intersect/i;
const AREA_ERROR = /area|collinear/i;
const WINDING_ERROR = /counter-clockwise/i;
const EXTRUSION_ERROR = /extrusion/i;
const CLIP_ERROR = /clip plane/i;
const REMOVES_SOLID_ERROR = /removes the entire solid/;

const aabb = (min: [number, number, number], max: [number, number, number]): Obb =>
  worldBox(IDENTITY, boxFromMinMax(min, max));

describe('distance', () => {
  const unit = aabb([0, 0, 0], [1, 1, 1]);

  it('computes Euclidean gaps between separated boxes and returns zero at contact or overlap', () => {
    expect(distanceWorld(unit, aabb([2, 2, 0], [3, 3, 1]))).toBeCloseTo(Math.SQRT2);
    expect(distanceWorld(unit, aabb([1, 0, 0], [2, 1, 1]))).toBeCloseTo(0);
    expect(distanceWorld(unit, aabb([0.5, 0, 0], [1.5, 1, 1]))).toBeCloseTo(0);
  });

  it('measures the gap between extruded convex solids and boxes', () => {
    const prism = worldSolid(IDENTITY, {
      id: 'distance-prism',
      kind: 'extruded-polygon',
      profile: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      z: [0, 1],
    });
    expect(distanceWorld(prism, aabb([2, 0, 0], [3, 1, 1]))).toBeCloseTo(1);
  });
});

describe('convex half-space clipping', () => {
  const source = obbPolyhedron(worldBox(IDENTITY, boxFromMinMax([0, 0, 0], [2, 2, 2])));
  const diagonal = { normal: [1, 1, 0] as const, offset: 2 };

  it('clips a box at 45 degrees with a closed five-face, six-vertex polyhedron of volume four', () => {
    const clipped = clipConvexPolyhedron(source, diagonal)!;
    expect(clipped.vertices).toHaveLength(6);
    expect(clipped.faces).toHaveLength(5);
    let sixVolume = 0;
    const edgeUse = new Map<string, number>();
    for (const face of clipped.faces) {
      for (let i = 1; i < face.length - 1; i++) {
        const a = clipped.vertices[face[0]!]!;
        const b = clipped.vertices[face[i]!]!;
        const c = clipped.vertices[face[i + 1]!]!;
        sixVolume +=
          a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      }
      for (let i = 0; i < face.length; i++) {
        const a = face[i]!;
        const b = face[(i + 1) % face.length]!;
        const key = [a, b].sort((left, right) => left - right).join('|');
        edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      }
    }
    expect(Math.abs(sixVolume / 6)).toBeCloseTo(4);
    expect([...edgeUse.values()].every((count) => count === 2)).toBe(true);
    expect(clipped.vertices).toContainEqual([2, 0, 0]);
    expect(clipped.vertices).toContainEqual([0, 2, 2]);
  });

  it('leaves a missed solid unchanged and rejects zero normals or clips that remove everything', () => {
    expect(clipConvexPolyhedron(source, { normal: [0, 0, 1], offset: 3 })).toBe(source);
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        [0, 2],
        undefined,
        [{ normal: [0, 0, 0], offset: 0 }],
      ),
    ).toMatch(CLIP_ERROR);
    expect(
      validateExtrudedPolygon(
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
        [0, 2],
        undefined,
        [{ normal: [0, 0, 1], offset: -1 }],
      ),
    ).toMatch(REMOVES_SOLID_ERROR);
  });

  it('uses clipped vertices for bounds and SAT collision', () => {
    const cutSolid: Solid = {
      id: 'clipped-box',
      kind: 'extruded-polygon',
      profile: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      z: [0, 2],
      clip: [{ normal: [1, 0, 0], offset: 1 }],
    };
    const cut = worldSolid(IDENTITY, cutSolid);
    const [boundsMin, boundsMax] = localSolidBounds(cutSolid);
    expect(boundsMin[0]).toBeCloseTo(0);
    expect(boundsMax[0]).toBeCloseTo(1);
    const cutAway = aabb([1.6, 0.6, 0.8], [1.8, 1.2, 1.2]);
    expect(penetrationWorld(cut, cutAway)).toBeLessThan(0);
  });
});

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
