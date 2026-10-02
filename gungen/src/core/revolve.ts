// Revolved solids (roobie/skelly#109, spike): a profile of (z, r) points turned about the local Z axis.
// Domain-neutral and kept beside the `Solid` union rather than in it: the union's consumers (collision,
// keep-outs, export, the viewer's bevel path) all assume boxes and convex extrusions, and none of them
// is wired for a round solid yet. The mesh here has smooth normals around the circumference and hard
// edges where the profile bends sharply, so a shoulder, a rim edge or a case mouth still reads as a
// corner while the neck, body taper and ogive read as one curved surface.
//
// The profile is traversed so the material lies to the left of travel in the (z, r) plane: a closed
// round runs from the axis at its base, out along the base face, along the outside to the tip, and back
// down to the axis. A hollow part (a fired case) goes out the outside, across the mouth, and back along
// the inside. The outward normal of a segment with direction (dz, dr) is (-dr, dz).

import type { TriangleMesh } from './mesh.ts';
import type { Vec2 } from './schema.ts';

export interface RevolvedSolid {
  readonly id: string;
  readonly kind: 'revolved';
  /** (z, r) points, r >= 0, in the profile order described above. */
  readonly profile: readonly Vec2[];
  /** Facets around the axis; at about one gun unit across, 16-24 reads as round. */
  readonly facets: number;
  /** Profile bends sharper than this keep a hard edge; softer ones are smoothed. Defaults to 40 degrees. */
  readonly creaseDegrees?: number;
}

export const DEFAULT_CREASE_DEGREES = 40;
const MIN_FACETS = 3;
const EPSILON = 1e-9;

/** Multiplies both coordinates of every profile point, e.g. millimetres to gun units. */
export const scaleProfile = (profile: readonly Vec2[], factor: number): Vec2[] =>
  profile.map(([z, r]) => [z * factor, r * factor]);

const dropRepeats = (profile: readonly Vec2[]): Vec2[] =>
  profile.filter((p, i) => i === 0 || Math.hypot(p[0] - profile[i - 1]![0], p[1] - profile[i - 1]![1]) > EPSILON);

const validate = (solid: RevolvedSolid): Vec2[] => {
  if (!Number.isInteger(solid.facets) || solid.facets < MIN_FACETS) {
    throw new RangeError(`revolved solid '${solid.id}': facets must be an integer >= ${MIN_FACETS}`);
  }
  const profile = dropRepeats(solid.profile);
  if (profile.length < 2) {
    throw new RangeError(`revolved solid '${solid.id}': profile needs at least two distinct points`);
  }
  if (profile.some(([z, r]) => !(Number.isFinite(z) && Number.isFinite(r) && r >= 0))) {
    throw new RangeError(`revolved solid '${solid.id}': profile points must be finite with r >= 0`);
  }
  return profile;
};

/** Unit outward normal of the profile segment from `a` to `b`, as (nz, nr). */
const segmentNormal = (a: Vec2, b: Vec2): Vec2 => {
  const dz = b[0] - a[0];
  const dr = b[1] - a[1];
  const length = Math.hypot(dz, dr);
  return [-dr / length, dz / length];
};

/**
 * The normal (nz, nr) used at one end of a segment. A neighbouring segment within the crease angle
 * shares an averaged normal with it; a sharper bend or a profile end keeps the segment's own normal. A
 * point on the axis has no circumferential direction, so its normal points along the axis.
 */
const endNormal = (own: Vec2, other: Vec2 | undefined, creaseCos: number, onAxis: boolean): Vec2 => {
  if (onAxis) {
    return [own[0] >= 0 ? 1 : -1, 0];
  }
  if (other === undefined || own[0] * other[0] + own[1] * other[1] < creaseCos) {
    return own;
  }
  const z = own[0] + other[0];
  const r = own[1] + other[1];
  const length = Math.hypot(z, r);
  return length < EPSILON ? own : [z / length, r / length];
};

/** Turns a revolved solid into a triangle mesh in its own frame: the axis is local Z. */
export const meshForRevolved = (solid: RevolvedSolid): TriangleMesh => {
  const profile = validate(solid);
  const { facets } = solid;
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
