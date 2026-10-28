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
