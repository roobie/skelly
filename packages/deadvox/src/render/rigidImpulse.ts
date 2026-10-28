import type { Vec3 } from '../core/coords.ts';
import { add, cross, dot, type Quaternion, rotateVector as rotate, scale, sub } from '../core/spatial.ts';

export type Tensor3 = readonly [Vec3, Vec3, Vec3];
export interface RigidBody {
  mass: number;
  center: Vec3;
  orientation: Quaternion;
  velocity: Vec3;
  angularMomentum: Vec3;
  inertiaBody: Tensor3;
  corners: readonly Vec3[];
  asleep: boolean;
}
export interface RigidWorld {
  isSolid: (x: number, y: number, z: number) => boolean;
  blockSize: number;
}

const inverseRotate = (q: Quaternion, v: Vec3): Vec3 => rotate([-q[0], -q[1], -q[2], q[3]], v);
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
const applyImpulse = (body: RigidBody, point: Vec3, impulse: Vec3): void => {
  body.asleep = false;
  body.velocity = add(body.velocity, scale(impulse, 1 / body.mass));
  body.angularMomentum = add(body.angularMomentum, cross(sub(point, body.center), impulse));
};

export const clampPointToRigidBody = (body: RigidBody, point: Vec3): Vec3 => {
  const localPoint = inverseRotate(body.orientation, sub(point, body.center));
  const halfExtents: Vec3 = [0, 0, 0];
  for (const corner of body.corners) {
    for (let axis = 0; axis < 3; axis++) {
      halfExtents[axis] = Math.max(halfExtents[axis]!, Math.abs(corner[axis]!));
    }
  }
  const clamped: Vec3 = [
    Math.max(-halfExtents[0], Math.min(halfExtents[0], localPoint[0])),
    Math.max(-halfExtents[1], Math.min(halfExtents[1], localPoint[1])),
    Math.max(-halfExtents[2], Math.min(halfExtents[2], localPoint[2])),
  ];
  return add(body.center, rotate(body.orientation, clamped));
};
export const applyImpulseAtClampedPoint = (body: RigidBody, point: Vec3, impulse: Vec3): Vec3 => {
  const appliedPoint = clampPointToRigidBody(body, point);
  applyImpulse(body, appliedPoint, impulse);
  return appliedPoint;
};
