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

import type { TriangleMesh } from './mesh.ts';
import type { RevolvedSolid, Vec2 } from './schema.ts';

export const DEFAULT_CREASE_DEGREES = 40;
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
