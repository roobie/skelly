// Minimal 3D math for the core. Kept dependency-free so the core never needs
// a renderer; the viewer converts these to three.js types at the edge.

export type Vec3 = readonly [number, number, number];

/** 3x3 rotation matrix, row-major. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Rigid transform: p' = r * p + t. */
export interface Transform {
  readonly r: Mat3;
  readonly t: Vec3;
}

export const ZERO: Vec3 = [0, 0, 0];
export const IDENTITY_M: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const IDENTITY: Transform = { r: IDENTITY_M, t: ZERO };

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  if (l === 0) {
    throw new Error('cannot normalize a zero vector');
  }
  return scale(a, 1 / l);
};

/** Matrix whose columns are x, y, z. */
export const fromColumns = (x: Vec3, y: Vec3, z: Vec3): Mat3 => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];

export const column = (m: Mat3, i: 0 | 1 | 2): Vec3 => [m[i], m[3 + i]!, m[6 + i]!];

export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

export const mulMV = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

export const mulMM = (a: Mat3, b: Mat3): Mat3 => {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
    }
  }
  return out as unknown as Mat3;
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Rotation about the local X axis. */
export const rotX = (deg: number): Mat3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [1, 0, 0, 0, c, -s, 0, s, c];
};

/** Rotation about the local Y axis. */
export const rotY = (deg: number): Mat3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};

/** Rotation about the local Z axis. */
export const rotZ = (deg: number): Mat3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

export const rotation = (r: Mat3): Transform => ({ r, t: ZERO });
export const translation = (t: Vec3): Transform => ({ r: IDENTITY_M, t });

/** a ∘ b: apply b first, then a. */
export const compose = (a: Transform, b: Transform): Transform => ({
  r: mulMM(a.r, b.r),
  t: add(mulMV(a.r, b.t), a.t),
});

export const invert = (a: Transform): Transform => {
  const rt = transpose(a.r);
  return { r: rt, t: scale(mulMV(rt, a.t), -1) };
};

export const applyPoint = (a: Transform, p: Vec3): Vec3 => add(mulMV(a.r, p), a.t);
export const applyDir = (a: Transform, d: Vec3): Vec3 => mulMV(a.r, d);

/** Angle in degrees between two unit vectors. */
export const angleBetween = (a: Vec3, b: Vec3): number =>
  (Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * 180) / Math.PI;

/** Angle in degrees of the rotation that takes a to b. */
export const rotationAngle = (a: Mat3, b: Mat3): number => {
  const m = mulMM(transpose(a), b);
  const cos = (m[0] + m[4] + m[8] - 1) / 2;
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
};
