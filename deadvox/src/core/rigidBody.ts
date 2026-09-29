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
  const result = [
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
  body.asleep = false;
  body.quietTime = 0;
  body.velocity = add(body.velocity, scale(impulse, 1 / body.mass));
  body.angularMomentum = add(body.angularMomentum, cross(sub(point, body.center), impulse));
};
const contact = (body: RigidBody, point: Vec3, normal: Vec3, penetration: number): void => {
  const arm = sub(point, body.center);
  const contactVelocity = add(body.velocity, cross(angularVelocity(body), arm));
  const normalSpeed = dot(contactVelocity, normal);
  body.center = add(body.center, scale(normal, penetration + 1e-5));
  if (normalSpeed >= 0) {
    return;
  }
  const inverseInertia = inverseSymmetric(worldInertia(body));
  const angularArm = matVec(inverseInertia, cross(arm, normal));
  const denominator = 1 / body.mass + dot(normal, cross(angularArm, arm));
  const normalImpulseMagnitude = (-(1 + 0.3) * normalSpeed) / denominator;
  const normalImpulse = scale(normal, normalImpulseMagnitude);
  body.velocity = add(body.velocity, scale(normalImpulse, 1 / body.mass));
  body.angularMomentum = add(body.angularMomentum, cross(arm, normalImpulse));
  const afterNormal = add(body.velocity, cross(angularVelocity(body), arm));
  const tangentVelocity = sub(afterNormal, scale(normal, dot(afterNormal, normal)));
  const tangentSpeed = Math.hypot(...tangentVelocity);
  if (tangentSpeed > 1e-10) {
    const tangent = scale(tangentVelocity, 1 / tangentSpeed);
    const tangentArm = cross(arm, tangent);
    const tangentDenominator = 1 / body.mass + dot(tangent, cross(matVec(inverseInertia, tangentArm), arm));
    const tangentImpulseMagnitude = Math.max(
      -0.6 * normalImpulseMagnitude,
      Math.min(0.6 * normalImpulseMagnitude, -dot(afterNormal, tangent) / tangentDenominator),
    );
    const frictionImpulse = scale(tangent, tangentImpulseMagnitude);
    body.velocity = add(body.velocity, scale(frictionImpulse, 1 / body.mass));
    body.angularMomentum = add(body.angularMomentum, cross(arm, frictionImpulse));
  }
};

const FACE_DIRECTIONS: readonly { axis: 0 | 1 | 2; sign: -1 | 1; normal: Vec3 }[] = [
  { axis: 0, sign: -1, normal: [-1, 0, 0] },
  { axis: 0, sign: 1, normal: [1, 0, 0] },
  { axis: 1, sign: -1, normal: [0, -1, 0] },
  { axis: 1, sign: 1, normal: [0, 1, 0] },
  { axis: 2, sign: -1, normal: [0, 0, -1] },
  { axis: 2, sign: 1, normal: [0, 0, 1] },
];
interface ExitContact {
  readonly normal: Vec3;
  readonly depth: number;
}
/** Search each axis for the nearest face that actually exits solid space; never correct into a solid neighbour. */
const nearestExit = (
  world: RigidWorld,
  point: Vec3,
  cell: readonly [number, number, number],
): ExitContact | undefined => {
  let nearest: ExitContact | undefined;
  for (const direction of FACE_DIRECTIONS) {
    const cursor = [...cell] as [number, number, number];
    let blocks = 0;
    while (blocks < 256 && world.isSolid(cursor[0], cursor[1], cursor[2])) {
      cursor[direction.axis] += direction.sign;
      blocks += 1;
    }
    if (blocks === 256) {
      continue;
    }
    const boundaryBlock = direction.sign > 0 ? cell[direction.axis]! + blocks : cell[direction.axis]! - blocks + 1;
    const boundary = boundaryBlock * world.blockSize;
    const depth = direction.sign > 0 ? boundary - point[direction.axis]! : point[direction.axis]! - boundary;
    if (depth >= 0 && (!nearest || depth < nearest.depth)) {
      nearest = { normal: direction.normal, depth };
    }
  }
  return nearest;
};
const cornerRadius = (body: RigidBody): number => Math.max(0, ...body.corners.map((corner) => Math.hypot(...corner)));
const collide = (body: RigidBody, world: RigidWorld): void => {
  const b = world.blockSize;
  for (const local of body.corners) {
    const point = add(body.center, rotate(body.orientation, local));
    const cell: [number, number, number] = [
      Math.floor(point[0] / b),
      Math.floor(point[1] / b),
      Math.floor(point[2] / b),
    ];
    if (!world.isSolid(...cell)) {
      continue;
    }
    const exit = nearestExit(world, point, cell);
    if (exit) {
      contact(body, point, exit.normal, exit.depth);
    }
  }
};
const limitCornerSpeed = (body: RigidBody, blockSize: number, gravity: number): void => {
  const maxCornerSpeed = Math.max(0, blockSize * 60 - Math.abs(gravity) / 120);
  const total = Math.hypot(...body.velocity) + cornerRadius(body) * Math.hypot(...angularVelocity(body));
  if (total > maxCornerSpeed) {
    const factor = maxCornerSpeed / total;
    body.velocity = scale(body.velocity, factor);
    body.angularMomentum = scale(body.angularMomentum, factor);
  }
};
const substep = (body: RigidBody, dt: number, world: RigidWorld | undefined, gravity: number): void => {
  body.velocity = [body.velocity[0], body.velocity[1] - gravity * dt, body.velocity[2]];
  body.center = add(body.center, scale(body.velocity, dt));
  const omega = angularVelocity(body);
  const dq: Quaternion = [(omega[0] * dt) / 2, (omega[1] * dt) / 2, (omega[2] * dt) / 2, 1];
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
  const blockSize = world?.blockSize;
  if (world && !(blockSize! > 0)) {
    throw new RangeError('blockSize must be positive');
  }
  const count = Math.min(16, Math.floor(dt * 120 + 1e-10));
  for (let step = 0; step < count && !body.asleep; step++) {
    if (blockSize) {
      limitCornerSpeed(body, blockSize, gravity);
    }
    substep(body, 1 / 120, world, gravity);
  }
};
