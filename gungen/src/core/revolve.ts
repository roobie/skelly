// Revolved solids: a profile of (axial, radial) points turned about one axis. Domain-neutral.
//
// The mesh has smooth normals around the circumference and hard edges where the profile bends past a
// crease angle, so a shoulder, a rim edge or a case mouth still reads as a corner while a neck, a taper
// or an ogive reads as one curved surface. The facet count is a level of detail chosen by the caller
// (a handful reads as round at a distance; about 24 for a close-up); collision never depends on it.
//
// The profile is traversed so the material lies to the left of travel in the (axial, radial) plane: a
// closed solid runs from the axis at its base, out along the base face, along the outside to the tip and
// back down to the axis. A hollow part goes out along the outside, across the mouth, and back along the
// inside. The outward normal of a segment with direction (da, dr) is (-dr, da).

import type { ConvexPolyhedron } from './geometry.ts';
import { extrusionPoint, type Vec3 } from './math.ts';
import type { TriangleMesh } from './mesh.ts';
import type { RevolvedSolid, Vec2 } from './schema.ts';

export const DEFAULT_CREASE_DEGREES = 40;
/**
 * Facets of the collision hull, whatever the mesh's level of detail, so validation never depends on how a
 * solid is drawn. Divisible by four, so the hull reaches the full radius on both transverse axes and its
 * bounds are exact. Its vertices sit on the circle, so it is at most 7.6% of the radius smaller than the
 * true solid (about 0.4 mm on a 7.62x39 case head). Collision accuracy matters little for these parts, but
 * the convex SAT cost grows roughly with the fourth power of the facet count. Measured on a 7.62x39 case
 * against its bullet: 16 facets took 73 ms per penetration check and 67 ms per distance check; 8 facets took
 * 5.1 ms and 5.2 ms. Case against a box: 1.9 ms and 10.8 ms at 16, 0.2 ms and 2.2 ms at 8.
 */
export const REVOLVE_COLLISION_FACETS = 8;
/** Facets of a mesh when the caller does not choose: enough to read as round beyond arm's length. */
export const DEFAULT_REVOLVE_FACETS = 6;
export const MIN_REVOLVE_FACETS = 3;
/** A hard ceiling, so a typo cannot ask for millions of triangles. */
export const MAX_REVOLVE_FACETS = 128;
const EPSILON = 1e-9;

const dropRepeats = (profile: readonly Vec2[]): Vec2[] =>
  profile.filter((p, i) => i === 0 || Math.hypot(p[0] - profile[i - 1]![0], p[1] - profile[i - 1]![1]) > EPSILON);

/** What is wrong with a revolved profile, or undefined when it can be turned. */
export const revolvedProfileError = (profile: readonly Vec2[], axis?: string): string | undefined => {
  if (axis !== undefined && !['x', 'y', 'z'].includes(axis)) {
    return 'revolve axis must be x, y, or z';
  }
  if (!Array.isArray(profile)) {
    return 'profile must be an array of points';
  }
  if (profile.some((p) => !(Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])))) {
    return 'profile points must be finite (axial, radial) pairs';
  }
  if (profile.some((p) => p[1] < 0)) {
    return 'profile radii must not be negative';
  }
  if (dropRepeats(profile).length < 2) {
    return 'profile needs at least two distinct points';
  }
  const axial = profile.map((p) => p[0]);
  if (Math.max(...axial) - Math.min(...axial) <= EPSILON) {
    return 'profile has no axial extent';
  }
  if (Math.max(...profile.map((p) => p[1])) <= EPSILON) {
    return 'profile has no radius';
  }
  return undefined;
};

/** Unit outward normal of the profile segment from `a` to `b`, as (axial, radial). */
const segmentNormal = (a: Vec2, b: Vec2): Vec2 => {
  const da = b[0] - a[0];
  const dr = b[1] - a[1];
  const length = Math.hypot(da, dr);
  return [-dr / length, da / length];
};

/**
 * The normal (axial, radial) used at one end of a segment. A neighbouring segment within the crease
 * angle shares an averaged normal with it; a sharper bend or a profile end keeps the segment's own
 * normal. A point on the axis has no circumferential direction, so its normal points along the axis.
 */
const endNormal = (own: Vec2, other: Vec2 | undefined, creaseCos: number, onAxis: boolean): Vec2 => {
  if (onAxis) {
    return [own[0] >= 0 ? 1 : -1, 0];
  }
  if (other === undefined || own[0] * other[0] + own[1] * other[1] < creaseCos) {
    return own;
  }
  const a = own[0] + other[0];
  const r = own[1] + other[1];
  const length = Math.hypot(a, r);
  return length < EPSILON ? own : [a / length, r / length];
};

/**
 * The solid as a triangle mesh turned about local Z with `facets` facets. The caller orients it for
 * the solid's `axis` (see `meshForSolid`).
 */
export const meshForRevolved = (solid: RevolvedSolid, facets: number): TriangleMesh => {
  const error = revolvedProfileError(solid.profile, solid.axis);
  if (error) {
    throw new RangeError(`revolved solid '${solid.id}': ${error}`);
  }
  if (!Number.isInteger(facets) || facets < MIN_REVOLVE_FACETS || facets > MAX_REVOLVE_FACETS) {
    throw new RangeError(
      `revolved solid '${solid.id}': facets must be an integer from ${MIN_REVOLVE_FACETS} to ${MAX_REVOLVE_FACETS}`,
    );
  }
  const profile = dropRepeats(solid.profile);
  const creaseCos = Math.cos(((solid.creaseDegrees ?? DEFAULT_CREASE_DEGREES) * Math.PI) / 180);
  const normals2d = profile.slice(1).map((p, i) => segmentNormal(profile[i]!, p));

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const cos = Array.from({ length: facets }, (_, j) => Math.cos((2 * Math.PI * j) / facets));
  const sin = Array.from({ length: facets }, (_, j) => Math.sin((2 * Math.PI * j) / facets));

  // One ring per segment end, so a hard edge needs no vertex splitting logic: every segment owns its vertices.
  const ring = (point: Vec2, normal: Vec2): number => {
    const base = positions.length / 3;
    for (let j = 0; j < facets; j++) {
      positions.push(point[1] * cos[j]!, point[1] * sin[j]!, point[0]);
      normals.push(normal[1] * cos[j]!, normal[1] * sin[j]!, normal[0]);
    }
    return base;
  };

  for (const [s, own] of normals2d.entries()) {
    const a = profile[s]!;
    const b = profile[s + 1]!;
    const start = ring(a, endNormal(own, normals2d[s - 1], creaseCos, a[1] < EPSILON));
    const end = ring(b, endNormal(own, normals2d[s + 1], creaseCos, b[1] < EPSILON));
    for (let j = 0; j < facets; j++) {
      const k = (j + 1) % facets;
      // Winding: (start_j, start_k, end_k) has T_theta x T_profile as its normal, which points outward.
      // A ring on the axis collapses to one point, so its degenerate triangle is skipped.
      if (a[1] >= EPSILON) {
        indices.push(start + j, start + k, end + k);
      }
      if (b[1] >= EPSILON) {
        indices.push(start + j, end + k, end + j);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    triangleCount: indices.length / 3,
  };
};

const turn = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * The upper concave envelope of the profile's radius over its axial range. A solid whose every ring is
 * a regular polygon in the same phase is convex exactly when its radius is a concave function of the
 * axial position, so the hull of the turned profile is the turn of this envelope.
 */
const upperEnvelope = (profile: readonly Vec2[]): Vec2[] => {
  const sorted = [...profile].sort((p, q) => p[0] - q[0] || q[1] - p[1]);
  const tallest = sorted.filter((p, i) => i === 0 || p[0] - sorted[i - 1]![0] > EPSILON);
  const hull: Vec2[] = [];
  for (const point of tallest) {
    while (hull.length >= 2 && turn(hull.at(-2)!, hull.at(-1)!, point) >= 0) {
      hull.pop();
    }
    hull.push(point);
  }
  return hull;
};

/**
 * The convex hull of the solid in its part frame, used for collision. It ignores grooves and hollows.
 * It has `REVOLVE_COLLISION_FACETS` facets per ring and does not depend on any mesh level of detail.
 */
export const revolvedLocalPolyhedron = (solid: RevolvedSolid): ConvexPolyhedron => {
  const n = REVOLVE_COLLISION_FACETS;
  const envelope = upperEnvelope(solid.profile);
  const vertices: Vec3[] = [];
  /** First vertex of each envelope point's ring, or the single vertex of one on the axis. */
  const first = envelope.map(([axial, radius]) => {
    const start = vertices.length;
    if (radius <= EPSILON) {
      vertices.push(extrusionPoint(solid.axis, [0, 0], axial));
      return start;
    }
    for (let j = 0; j < n; j++) {
      const angle = (2 * Math.PI * j) / n;
      vertices.push(extrusionPoint(solid.axis, [radius * Math.cos(angle), radius * Math.sin(angle)], axial));
    }
    return start;
  });
  const onAxis = (i: number): boolean => envelope[i]![1] <= EPSILON;
  const ringIndices = (i: number): number[] => Array.from({ length: n }, (_, j) => first[i]! + j);

  const faces: number[][] = [];
  const last = envelope.length - 1;
  if (!onAxis(0)) {
    faces.push(ringIndices(0).reverse());
  }
  if (!onAxis(last)) {
    faces.push(ringIndices(last));
  }
  for (let i = 0; i < last; i++) {
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      const [sj, sk, ej, ek] = [first[i]! + j, first[i]! + k, first[i + 1]! + j, first[i + 1]! + k];
      if (onAxis(i)) {
        faces.push([first[i]!, ek, ej]);
      } else if (onAxis(i + 1)) {
        faces.push([sj, sk, first[i + 1]!]);
      } else {
        faces.push([sj, sk, ek, ej]);
      }
    }
  }
  return { vertices, faces };
};
