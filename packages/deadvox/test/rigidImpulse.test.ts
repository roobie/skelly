import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { rotateVector } from '../src/core/spatial.ts';
import {
  angularVelocity,
  applyImpulseAtClampedPoint,
  clampPointToRigidBody,
  type RigidBody,
} from '../src/render/rigidImpulse.ts';

const body = (): RigidBody => ({
  mass: 2,
  center: [0, 0, 0],
  orientation: [0, 0, 0, 1],
  velocity: [0, 0, 0],
  angularMomentum: [0, 0, 0],
  inertiaBody: [
    [2, 0.1, 0],
    [0.1, 3, 0.2],
    [0, 0.2, 4],
  ],
  corners: [
    [-0.2, -0.1, -0.3],
    [0.2, 0.1, 0.3],
  ],
  asleep: false,
});

describe('rigid launch impulse', () => {
  it('clamps impulse application points to the oriented OBB in body space', () => {
    const b = body();
    b.orientation = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
    const outsideLocal: Vec3 = [2, -2, 3];
    const outsideWorld = rotateVector(b.orientation, outsideLocal);
    const applied = clampPointToRigidBody(b, outsideWorld);
    const local = rotateVector([-b.orientation[0], -b.orientation[1], -b.orientation[2], b.orientation[3]], applied);
    expect(local[0]).toBeCloseTo(0.2, 12);
    expect(local[1]).toBeCloseTo(-0.1, 12);
    expect(local[2]).toBeCloseTo(0.3, 12);
    expect(applyImpulseAtClampedPoint(b, outsideWorld, [1, 0, 0])).toEqual(applied);
  });
  it('applies a COM impulse without angular velocity', () => {
    const b = body();
    applyImpulseAtClampedPoint(b, b.center, [2, 0, 0]);
    expect(Math.hypot(...angularVelocity(b))).toBeLessThan(1e-9);
  });
  it('changes linear velocity by J/m', () => {
    const b = body();
    applyImpulseAtClampedPoint(b, b.center, [2, 0, 0]);
    expect(b.velocity).toEqual([1, 0, 0]);
  });
  it('adds moment-arm angular momentum for an off-centre impulse', () => {
    const b = body();
    applyImpulseAtClampedPoint(b, [0, 0.1, 0], [2, 0, 0]);
    expect(b.angularMomentum[2]).toBeCloseTo(-0.2, 12);
  });
});
