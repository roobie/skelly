import type { Vec3 } from './coords.ts';

export type Quaternion = readonly [number, number, number, number];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, value: number): Vec3 => [a[0] * value, a[1] * value, a[2] * value];
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
const normalizeRotation = (q: Quaternion): Quaternion => {
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
export const multiplyRotation = (a: Quaternion, b: Quaternion): Quaternion => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const rotateVector = (q: Quaternion, v: Vec3): Vec3 => {
  const axis: Vec3 = [q[0], q[1], q[2]];
  const t = scale(cross(axis, v), 2);
  return add(v, add(scale(t, q[3]), cross(axis, t)));
};
export const inverseRotation = (q: Quaternion): Quaternion => [-q[0], -q[1], -q[2], q[3]];
export const axisRotation = (axis: Vec3, angle: number): Quaternion => {
  const turn = scale(normalize(axis), Math.sin(angle / 2));
  return [...turn, Math.cos(angle / 2)];
};
export const rotationBetween = (from: Vec3, to: Vec3): Quaternion => {
  const a = normalize(from);
  const b = normalize(to);
  const w = dot(a, b) + 1;
  if (w < Number.EPSILON) {
    return normalizeRotation(Math.abs(a[0]) > Math.abs(a[2]) ? [-a[1], a[0], 0, 0] : [0, -a[2], a[1], 0]);
  }
  return normalizeRotation([...cross(a, b), w]);
};

/** The rotation of an orthonormal right-handed basis, read from its columns. */
export const basisRotation = ([right, up, back]: readonly [Vec3, Vec3, Vec3]): Quaternion => {
  const trace = right[0] + up[1] + back[2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return normalizeRotation([(up[2] - back[1]) / s, (back[0] - right[2]) / s, (right[1] - up[0]) / s, s / 4]);
  }
  if (right[0] > up[1] && right[0] > back[2]) {
    const s = Math.sqrt(1 + right[0] - up[1] - back[2]) * 2;
    return normalizeRotation([s / 4, (up[0] + right[1]) / s, (back[0] + right[2]) / s, (up[2] - back[1]) / s]);
  }
  if (up[1] > back[2]) {
    const s = Math.sqrt(1 + up[1] - right[0] - back[2]) * 2;
    return normalizeRotation([(right[1] + up[0]) / s, s / 4, (back[1] + up[2]) / s, (back[0] - right[2]) / s]);
  }
  const s = Math.sqrt(1 + back[2] - right[0] - up[1]) * 2;
  return normalizeRotation([(right[2] + back[0]) / s, (up[2] + back[1]) / s, s / 4, (right[1] - up[0]) / s]);
};

/** The orthonormal right-handed basis a rotation carries the unit axes to, as columns. */
export const rotationBasis = (q: Quaternion): readonly [Vec3, Vec3, Vec3] => [
  rotateVector(q, [1, 0, 0]),
  rotateVector(q, [0, 1, 0]),
  rotateVector(q, [0, 0, 1]),
];

/**
 * Shortest-path normalized blend of two rotations: defined for every pair, half-turns included,
 * where plain component interpolation can cancel to a zero vector.
 */
export const blendRotation = (from: Quaternion, to: Quaternion, share: number): Quaternion => {
  const flipped =
    from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3] < 0
      ? ([-to[0], -to[1], -to[2], -to[3]] as Quaternion)
      : to;
  return normalizeRotation([
    from[0] + (flipped[0] - from[0]) * share,
    from[1] + (flipped[1] - from[1]) * share,
    from[2] + (flipped[2] - from[2]) * share,
    from[3] + (flipped[3] - from[3]) * share,
  ]);
};

/**
 * Shortest-swing blend of two directions: defined for antiparallel pairs, where lerping the
 * vectors cancels to zero, and exact at both endpoints.
 */
export const blendDirection = (from: Vec3, to: Vec3, share: number): Vec3 => {
  const a = normalize(from);
  const b = normalize(to);
  if (dot(a, b) > 1 - Number.EPSILON) {
    return a;
  }
  return rotateVector(blendRotation([0, 0, 0, 1], rotationBetween(a, b), share), a);
};
