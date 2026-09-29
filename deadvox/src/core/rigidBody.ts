import type { Vec3 } from './coords.ts';

export type Quaternion = readonly [number, number, number, number];
export type Tensor3 = readonly [Vec3, Vec3, Vec3];
export interface RigidBody {
  mass: number;
  center: Vec3;
  orientation: Quaternion;
  velocity: Vec3;
  angularMomentum: Vec3;
  inertiaBody: Tensor3;
  /** Vertices of the body's local-space OBB, relative to its COM (metres). */
  corners: readonly Vec3[];
  elapsed: number;
  quietTime: number;
  asleep: boolean;
}
export type SolidQuery = (x: number, y: number, z: number) => boolean;
export interface RigidWorld {
  isSolid: SolidQuery;
  blockSize: number;
}
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const qnorm = (q: Quaternion): Quaternion => {
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const qmul = (a: Quaternion, b: Quaternion): Quaternion => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotate = (q: Quaternion, v: Vec3): Vec3 => {
  const t = scale(cross([q[0], q[1], q[2]], v), 2);
  return add(v, add(scale(t, q[3]), cross([q[0], q[1], q[2]], t)));
};
const matVec = (m: Tensor3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const inverseSymmetric = (m: Tensor3): Tensor3 => {
  const [a, b, c] = m[0];
  const [, d, e] = m[1];
  const [, , f] = m[2];
  const A = d * f - e * e;
  const B = c * e - b * f;
  const C = b * e - c * d;
  const D = a * f - c * c;
  const E = b * c - a * e;
  const F = a * d - b * b;
  const det = a * A + b * B + c * C;
  if (!(det > 1e-24)) {
    return [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
  }
  return [
    [A / det, B / det, C / det],
    [B / det, D / det, E / det],
    [C / det, E / det, F / det],
  ];
};
const worldInertia = (body: RigidBody): Tensor3 => {
  const axes = [
    rotate(body.orientation, [1, 0, 0]),
    rotate(body.orientation, [0, 1, 0]),
    rotate(body.orientation, [0, 0, 1]),
  ];
  const result: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          result[i]![j]! += axes[a]![i]! * body.inertiaBody[a]![b]! * axes[b]![j]!;
        }
      }
    }
  }
  return result as unknown as Tensor3;
};
export const angularVelocity = (body: RigidBody): Vec3 =>
  matVec(inverseSymmetric(worldInertia(body)), body.angularMomentum);
export const applyImpulse = (body: RigidBody, point: Vec3, impulse: Vec3): void => {
  if (body.asleep) {
    body.asleep = false;
  }
  body.velocity = add(body.velocity, scale(impulse, 1 / body.mass));
  body.angularMomentum = add(body.angularMomentum, cross(sub(point, body.center), impulse));
};
const contact = (body: RigidBody, point: Vec3, normal: Vec3, penetration: number): void => {
  const arm = sub(point, body.center);
  const omega = angularVelocity(body);
  const contactVel = add(body.velocity, cross(omega, arm));
  const vn = dot(contactVel, normal);
  // Penetration correction, then normal restitution impulse.
  body.center = add(body.center, scale(normal, penetration + 1e-5));
  if (vn >= 0) {
    return;
  }
  const invI = inverseSymmetric(worldInertia(body));
  const ra = cross(arm, normal);
  const angular = matVec(invI, ra);
  const denom = 1 / body.mass + dot(normal, cross(angular, arm));
  const j = (-(1 + 0.3) * vn) / denom;
  const impulse = scale(normal, j);
  body.velocity = add(body.velocity, scale(impulse, 1 / body.mass));
  body.angularMomentum = add(body.angularMomentum, cross(arm, impulse));
  const after = add(body.velocity, cross(angularVelocity(body), arm));
  const tangent = sub(after, scale(normal, dot(after, normal)));
  const tl = Math.hypot(...tangent);
  if (tl > 1e-10) {
    const t = scale(tangent, 1 / tl);
    const tr = cross(arm, t);
    const td = 1 / body.mass + dot(t, cross(matVec(invI, tr), arm));
    const jt = Math.max(-0.6 * j, Math.min(0.6 * j, -dot(after, t) / td));
    const fi = scale(t, jt);
    body.velocity = add(body.velocity, scale(fi, 1 / body.mass));
    body.angularMomentum = add(body.angularMomentum, cross(arm, fi));
  }
};
const chooseExitFace = (
  world: RigidWorld,
  cell: readonly [number, number, number],
  distances: readonly number[],
): number => {
  const [x, y, z] = cell;
  const adjacent: readonly (readonly [number, number, number])[] = [
    [x - 1, y, z],
    [x + 1, y, z],
    [x, y - 1, z],
    [x, y + 1, z],
    [x, y, z - 1],
    [x, y, z + 1],
  ];
  let best = -1;
  for (let i = 0; i < 6; i++) {
    if (!world.isSolid(...adjacent[i]!) && (best < 0 || distances[i]! < distances[best]!)) {
      best = i;
    }
  }
  if (best >= 0) {
    return best;
  }
  for (let i = 0; i < 6; i++) {
    if (best < 0 || distances[i]! < distances[best]!) {
      best = i;
    }
  }
  return best;
};
const collide = (body: RigidBody, world: RigidWorld): void => {
  const b = world.blockSize;
  for (const local of body.corners) {
    const p = add(body.center, rotate(body.orientation, local));
    const x = Math.floor(p[0] / b);
    const y = Math.floor(p[1] / b);
    const z = Math.floor(p[2] / b);
    if (!world.isSolid(x, y, z)) {
      continue;
    }
    const distances = [
      p[0] - x * b,
      (x + 1) * b - p[0],
      p[1] - y * b,
      (y + 1) * b - p[1],
      p[2] - z * b,
      (z + 1) * b - p[2],
    ];
    const normals: Vec3[] = [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ];
    const face = chooseExitFace(world, [x, y, z], distances);
    contact(body, p, normals[face]!, distances[face]!);
  }
};
const substep = (body: RigidBody, dt: number, world?: RigidWorld, gravity = 9.8): void => {
  body.velocity = [body.velocity[0], body.velocity[1] - gravity * dt, body.velocity[2]];
  body.center = add(body.center, scale(body.velocity, dt));
  const w = angularVelocity(body);
  const dq: Quaternion = [(w[0] * dt) / 2, (w[1] * dt) / 2, (w[2] * dt) / 2, 1];
  body.orientation = qnorm(qmul(dq, body.orientation));
  if (world) {
    collide(body, world);
  }
  const speed = Math.hypot(...body.velocity);
  const spin = Math.hypot(...angularVelocity(body));
  body.quietTime = speed < 0.05 && spin < 0.3 ? body.quietTime + dt : 0;
  body.elapsed += dt;
  if (body.quietTime >= 0.25 || body.elapsed >= 8) {
    body.velocity = [0, 0, 0];
    body.angularMomentum = [0, 0, 0];
    body.asleep = true;
  }
};
/** Deterministic fixed-step integration (1/120 s); excess time is dropped after 16 substeps. */
export const stepRigidBody = (body: RigidBody, dt: number, world?: RigidWorld, gravity = 9.8): void => {
  if (body.asleep || dt <= 0) {
    return;
  }
  const b = world?.blockSize;
  if (world && !(b! > 0)) {
    throw new RangeError('blockSize must be positive');
  }
  const full = Math.min(16, Math.floor(dt * 120 + 1e-10));
  // Bound displacement per corner even when the capped frame cannot keep up.
  if (b) {
    const maxSpeed = b * 60;
    const v = Math.hypot(...body.velocity);
    if (v > maxSpeed) {
      body.velocity = scale(body.velocity, maxSpeed / v);
    }
  }
  for (let i = 0; i < full && !body.asleep; i++) {
    substep(body, 1 / 120, world, gravity);
  }
};
