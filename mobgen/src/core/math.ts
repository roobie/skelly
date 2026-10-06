// Minimal 3D math for the core. Kept dependency-free so the core never needs
// a renderer; the viewer (phase B) converts these to three.js types at the edge.

export type Vec3 = readonly [number, number, number];

/** 3x3 rotation matrix, row-major. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Rigid transform: p' = r * p + t. */
export interface Transform {
  readonly r: Mat3;
  readonly t: Vec3;
}

const ZERO: Vec3 = [0, 0, 0];
export const IDENTITY_M: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), scale(b, t));
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
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Rotation about the local X axis. A hanging (-Y) vector swinging by a small
 * positive angle moves toward -Z: see mob/gait.ts for why that matters. */
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

/** Rotation about an arbitrary axis (Rodrigues' formula); axis need not be a unit vector. */
export const rotAxis = (axis: Vec3, deg: number): Mat3 => {
  const [x, y, z] = normalize(axis);
  const t = rad(deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  return [
    x * x * k + c,
    x * y * k - z * s,
    x * z * k + y * s,
    y * x * k + z * s,
    y * y * k + c,
    y * z * k - x * s,
    z * x * k - y * s,
    z * y * k + x * s,
    z * z * k + c,
  ];
};

export const rotation = (r: Mat3): Transform => ({ r, t: ZERO });
export const translation = (t: Vec3): Transform => ({ r: IDENTITY_M, t });

/** a ∘ b: apply b first, then a. */
export const compose = (a: Transform, b: Transform): Transform => ({
  r: mulMM(a.r, b.r),
  t: add(mulMV(a.r, b.t), a.t),
});

export const applyPoint = (a: Transform, p: Vec3): Vec3 => add(mulMV(a.r, p), a.t);
export const applyDir = (a: Transform, d: Vec3): Vec3 => mulMV(a.r, d);

// ---- quaternions: only for blending rotations (mob/idle.ts's walk<->idle cross-fades, core/pose.ts's
// blendPose) — everything else in this codebase poses with plain Mat3s. (x, y, z, w). ----

export type Quat = readonly [number, number, number, number];

/** Shepperd's method: numerically stable for any proper rotation, picking whichever of w/x/y/z has the
 * largest magnitude as the "pivot" component to divide by (a naive formula divides by w, which is near 0
 * for a near-180° rotation). Assumes `m` is a proper (orthonormal, det +1) rotation matrix. */
export const mat3ToQuat = (m: Mat3): Quat => {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
};

export const quatToMat3 = ([x, y, z, w]: Quat): Mat3 => {
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [1 - (yy + zz), xy - wz, xz + wy, xy + wz, 1 - (xx + zz), yz - wx, xz - wy, yz + wx, 1 - (xx + yy)];
};

/** Spherical linear interpolation, `a` at t=0 and `b` at t=1, always the shorter arc (negates `b` first if
 * the two are more than 90° apart — quaternions q and -q represent the same rotation, and interpolating
 * toward the "wrong" copy of `b` would spin the long way round). Falls back to normalized lerp when `a`
 * and `b` are nearly identical (sin(angle) too small to divide by safely) — indistinguishable from true
 * slerp at that point anyway. */
export const slerpQuat = (a: Quat, b: Quat, t: number): Quat => {
  let [bx, by, bz, bw] = b;
  let cosHalfTheta = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cosHalfTheta > 0.9995) {
    const x = a[0] + (bx - a[0]) * t;
    const y = a[1] + (by - a[1]) * t;
    const z = a[2] + (bz - a[2]) * t;
    const w = a[3] + (bw - a[3]) * t;
    const n = Math.hypot(x, y, z, w) || 1;
    return [x / n, y / n, z / n, w / n];
  }
  const halfTheta = Math.acos(clamp(cosHalfTheta, -1, 1));
  const sinHalfTheta = Math.sin(halfTheta);
  const wa = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const wb = Math.sin(t * halfTheta) / sinHalfTheta;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
};
