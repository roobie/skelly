import { describe, expect, it } from 'vitest';
import { angularVelocity, applyImpulse, type RigidBody, stepRigidBody } from '../src/core/rigidBody.ts';

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
  elapsed: 0,
  quietTime: 0,
  asleep: false,
});

describe('rigid body', () => {
  it('applies linear and angular impulse at a point', () => {
    const b = body();
    applyImpulse(b, [0, 0, 0], [2, 0, 0]);
    expect(b.velocity).toEqual([1, 0, 0]);
    expect(Math.hypot(...angularVelocity(b))).toBe(0);
  });
  it('retains angular momentum in free flight', () => {
    const b = body();
    b.angularMomentum = [0.7, 1.3, 0.2];
    const initial = [...b.angularMomentum];
    for (let i = 0; i < 120; i++) {
      stepRigidBody(b, 1 / 60, undefined, 0);
    }
    expect(b.angularMomentum).toEqual(initial);
    expect(Math.hypot(...angularVelocity(b))).toBeGreaterThan(0);
  });
});
