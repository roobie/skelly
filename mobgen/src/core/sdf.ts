// Signed distance shapes in world (rest-pose) coordinates. Negative is
// inside. Exactness is not required — these are close approximations, fast
// enough to evaluate per voxel, per bone (see voxelize.ts).

import type { Mat3, Vec3 } from './math.ts';
import { mulMV, sub, transpose } from './math.ts';

export interface Capsule {
  readonly kind: 'capsule';
  readonly a: Vec3;
  readonly b: Vec3;
  readonly ra: number;
  readonly rb: number;
}

export interface Ellipsoid {
  readonly kind: 'ellipsoid';
  readonly center: Vec3;
  readonly radii: Vec3;
  readonly rot?: Mat3;
}

export interface RoundBox {
  readonly kind: 'box';
  readonly center: Vec3;
  readonly half: Vec3;
  readonly round: number;
  readonly rot?: Mat3;
}

export type Shape = Capsule | Ellipsoid | RoundBox;

/** World point into a shape's local frame (rotation is orthonormal, so its inverse is its transpose). */
const toLocal = (p: Vec3, center: Vec3, rot: Mat3 | undefined): Vec3 =>
  rot ? mulMV(transpose(rot), sub(p, center)) : sub(p, center);

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Tapered capsule: project onto the a-b segment, lerp the radius. Not an exact cone/frustum SDF. */
const sdCapsule = (shape: Capsule, p: Vec3): number => {
  const { a, b, ra, rb } = shape;
  const pa = sub(p, a);
  const ba = sub(b, a);
  const babaLen2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const h = babaLen2 > 0 ? clamp01((pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / babaLen2) : 0;
  const r = ra + (rb - ra) * h;
  const d = [pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h] as const;
  return Math.hypot(d[0], d[1], d[2]) - r;
};

/**
 * Ellipsoid SDF approximation. iq's usual bound (k0*(k0-1)/k1) is exact at the surface but unstable
 * deep inside — k1 shrinks toward 0 near the center, so an interior voxel can read as a large
 * *positive* distance (this broke smin combination with a bone's other features: see mobgen's
 * `attached`/`floaters` tuning). We sample plenty of interior points (every voxel), not just near the
 * surface, so instead use k0 (0 at the centre, 1 at the surface, monotonic everywhere) scaled by the
 * smallest radius: exact for a sphere, a reasonable and always-well-behaved bound otherwise.
 */
const sdEllipsoid = (shape: Ellipsoid, p: Vec3): number => {
  const lp = toLocal(p, shape.center, shape.rot);
  const [rx, ry, rz] = shape.radii;
  const k0 = Math.hypot(lp[0] / rx, lp[1] / ry, lp[2] / rz);
  return (k0 - 1) * Math.min(rx, ry, rz);
};

const sdRoundBox = (shape: RoundBox, p: Vec3): number => {
  const lp = toLocal(p, shape.center, shape.rot);
  const { half, round } = shape;
  const qx = Math.abs(lp[0]) - (half[0] - round);
  const qy = Math.abs(lp[1]) - (half[1] - round);
  const qz = Math.abs(lp[2]) - (half[2] - round);
  const outsideLen = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const insideMax = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outsideLen + insideMax - round;
};

export const evalShape = (shape: Shape, p: Vec3): number => {
  switch (shape.kind) {
    case 'capsule':
      return sdCapsule(shape, p);
    case 'ellipsoid':
      return sdEllipsoid(shape, p);
    case 'box':
      return sdRoundBox(shape, p);
    default:
      throw new Error(`unknown shape kind "${(shape as Shape).kind}"`);
  }
};

/** Polynomial (quadratic) smooth minimum: smin(a, b, k) <= min(a, b) always; k <= 0 falls back to a hard min. */
export const smin = (a: number, b: number, k: number): number => {
  if (k <= 0) {
    return Math.min(a, b);
  }
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

const boxAabb = (center: Vec3, half: Vec3, rot: Mat3 | undefined): Aabb => {
  if (!rot) {
    return { min: sub(center, half), max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]] };
  }
  // Support function of a rotated box: world extent along axis i is sum_j |R_ij * half_j|.
  const worldHalf: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    worldHalf[i] =
      Math.abs(rot[i * 3]! * half[0]) + Math.abs(rot[i * 3 + 1]! * half[1]) + Math.abs(rot[i * 3 + 2]! * half[2]);
  }
  return {
    min: sub(center, worldHalf),
    max: [center[0] + worldHalf[0], center[1] + worldHalf[1], center[2] + worldHalf[2]],
  };
};

/** Axis-aligned bounding box, in world space, that fully contains the shape. */
export const aabbOf = (shape: Shape): Aabb => {
  switch (shape.kind) {
    case 'capsule': {
      const r = Math.max(shape.ra, shape.rb);
      const min: Vec3 = [
        Math.min(shape.a[0], shape.b[0]) - r,
        Math.min(shape.a[1], shape.b[1]) - r,
        Math.min(shape.a[2], shape.b[2]) - r,
      ];
      const max: Vec3 = [
        Math.max(shape.a[0], shape.b[0]) + r,
        Math.max(shape.a[1], shape.b[1]) + r,
        Math.max(shape.a[2], shape.b[2]) + r,
      ];
      return { min, max };
    }
    case 'ellipsoid':
      return boxAabb(shape.center, shape.radii, shape.rot);
    case 'box':
      return boxAabb(shape.center, shape.half, shape.rot);
    default:
      throw new Error(`unknown shape kind "${(shape as Shape).kind}"`);
  }
};

export const union = (boxes: readonly Aabb[]): Aabb => {
  if (boxes.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  let min: Vec3 = boxes[0]!.min;
  let max: Vec3 = boxes[0]!.max;
  for (const box of boxes.slice(1)) {
    min = [Math.min(min[0], box.min[0]), Math.min(min[1], box.min[1]), Math.min(min[2], box.min[2])];
    max = [Math.max(max[0], box.max[0]), Math.max(max[1], box.max[1]), Math.max(max[2], box.max[2])];
  }
  return { min, max };
};

export const expand = (box: Aabb, margin: number): Aabb => ({
  min: [box.min[0] - margin, box.min[1] - margin, box.min[2] - margin],
  max: [box.max[0] + margin, box.max[1] + margin, box.max[2] + margin],
});
