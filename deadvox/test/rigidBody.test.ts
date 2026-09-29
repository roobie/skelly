import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { angularVelocity, applyImpulse, type RigidBody, stepRigidBody } from '../src/core/rigidBody.ts';

const rotate = (q: RigidBody['orientation'], v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  return [
    (1 - 2 * (y * y + z * z)) * vx + 2 * (x * y - z * w) * vy + 2 * (x * z + y * w) * vz,
    2 * (x * y + z * w) * vx + (1 - 2 * (x * x + z * z)) * vy + 2 * (y * z - x * w) * vz,
    2 * (x * z - y * w) * vx + 2 * (y * z + x * w) * vy + (1 - 2 * (x * x + y * y)) * vz,
  ];
};

const boxCorners = (half: number): [number, number, number][] => {
  const result: [number, number, number][] = [];
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      for (const z of [-half, half]) {
        result.push([x, y, z]);
      }
    }
  }
  return result;
};
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
  it('applies an impulse through the COM without angular velocity', () => {
    const b = body();
    applyImpulse(b, b.center, [2, 0, 0]);
    expect(Math.hypot(...angularVelocity(b))).toBeLessThan(1e-9);
  });
  it('changes linear velocity by J/m for an impulse', () => {
    const b = body();
    applyImpulse(b, b.center, [2, 0, 0]);
    expect(b.velocity).toEqual([1, 0, 0]);
  });
  it('adds moment-arm angular momentum for an off-centre impulse', () => {
    const b = body();
    applyImpulse(b, [0, 1, 0], [2, 0, 0]);
    expect(b.velocity[0]).toBeCloseTo(1, 12);
    expect(b.angularMomentum[2]).toBeCloseTo(-2, 12);
  });
  it('keeps OBB corner displacement within half a block and sleeps after a quiet interval', () => {
    const b = body();
    b.center = [0.25, 1.1, 0.25];
    b.velocity = [80, -80, 0];
    b.angularMomentum = [0, 10_000, 0];
    const world = { blockSize: 0.5, isSolid: (_x: number, y: number, _z: number) => y === -1 };
    const worldCorners = (): Vec3[] =>
      b.corners.map((corner) => {
        const rotated = rotate(b.orientation, corner);
        return [b.center[0] + rotated[0], b.center[1] + rotated[1], b.center[2] + rotated[2]];
      });
    const before = worldCorners();
    stepRigidBody(b, 1 / 120, world);
    const after = worldCorners();
    for (let i = 0; i < before.length; i++) {
      expect(Math.hypot(...after[i]!.map((v, axis) => v - before[i]![axis]!))).toBeLessThanOrEqual(0.250_001);
    }
    b.velocity = [0, 0, 0];
    b.angularMomentum = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
      stepRigidBody(b, 1 / 60, world, 0);
    }
    expect(b.asleep).toBe(true);
  });
  it('sleeps on a flat block floor within three seconds', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [0.25, 1.1, 0.25];
    const world = { blockSize: 0.5, isSolid: (_x: number, y: number, _z: number) => y === -1 };
    for (let i = 0; i < 180 && !b.asleep; i++) {
      stepRigidBody(b, 1 / 60, world);
    }
    expect(b.asleep).toBe(true);
  });
  it('keeps a settled OBB above the flat floor', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [0.25, 1.1, 0.25];
    const world = { blockSize: 0.5, isSolid: (_x: number, y: number, _z: number) => y === -1 };
    for (let i = 0; i < 600 && !b.asleep; i++) {
      stepRigidBody(b, 1 / 60, world);
    }
    expect(b.asleep).toBe(true);
    for (const local of b.corners) {
      expect(b.center[1] + local[1]).toBeGreaterThanOrEqual(-0.01);
    }
  });
  it('keeps the first flat-floor bounce below 0.2 m', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [0.25, 1.1, 0.25];
    const world = { blockSize: 0.5, isSolid: (_x: number, y: number, _z: number) => y === -1 };
    let bounced = false;
    let apex = 0;
    for (let i = 0; i < 240 && !b.asleep; i++) {
      stepRigidBody(b, 1 / 60, world);
      if (b.velocity[1] > 0) {
        bounced = true;
        apex = Math.max(apex, b.center[1] - 0.1);
      }
    }
    expect(bounced).toBe(true);
    expect(apex).toBeLessThanOrEqual(0.2);
  });
  it('caps calls at sixteen fixed substeps', () => {
    const b = body();
    b.velocity = [1, 0, 0];
    stepRigidBody(b, 1, undefined, 0);
    expect(b.center[0]).toBeCloseTo(16 / 120, 12);
    expect(b.elapsed).toBeCloseTo(16 / 120, 12);
  });
  it('forces an airborne body to sleep after eight seconds', () => {
    const b = body();
    b.velocity = [1, 2, 3];
    for (let i = 0; i < 480; i++) {
      stepRigidBody(b, 1 / 60, undefined, 0);
    }
    expect(b.asleep).toBe(true);
  });
  it('replays bitwise-identical poses at every deterministic step', () => {
    const a = body();
    const b = body();
    a.velocity = [1, 2, 3];
    b.velocity = [1, 2, 3];
    for (let i = 0; i < 120; i++) {
      stepRigidBody(a, 1 / 60, undefined, 0);
      stepRigidBody(b, 1 / 60, undefined, 0);
      expect([a.center, a.orientation, a.velocity, a.asleep]).toEqual([b.center, b.orientation, b.velocity, b.asleep]);
    }
  });
  it('does not tunnel through a one-block floor at 15 m/s', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [0.25, 2, 0.25];
    b.velocity = [0, -15, 0];
    const world = { blockSize: 0.5, isSolid: (_x: number, y: number, _z: number) => y === -1 };
    for (let i = 0; i < 120; i++) {
      stepRigidBody(b, 1 / 120, world);
      for (const local of b.corners) {
        expect(b.center[1] + local[1]).toBeGreaterThanOrEqual(-0.51);
      }
    }
  });
  it('rests on 1-block stairs without floating or penetrating', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [1.25, 1.5, 0.25];
    b.velocity = [1.5, 0, 0];
    const world = {
      blockSize: 0.5,
      isSolid: (x: number, y: number, _z: number) =>
        y === -1 || (x === 2 && y === 0) || (x === 3 && y >= 0 && y <= 1) || (x === 4 && y >= 0 && y <= 2),
    };
    for (let i = 0; i < 1200 && !b.asleep; i++) {
      stepRigidBody(b, 1 / 120, world);
    }
    expect(b.asleep).toBe(true);
    const points = b.corners.map((corner) => {
      const rotated = rotate(b.orientation, corner);
      return [b.center[0] + rotated[0], b.center[1] + rotated[1], b.center[2] + rotated[2]] as const;
    });
    for (const point of points) {
      expect(world.isSolid(Math.floor(point[0] / 0.5), Math.floor(point[1] / 0.5), Math.floor(point[2] / 0.5))).toBe(
        false,
      );
    }
    const lowest = Math.min(...points.map((point) => point[1]));
    const supported = points.some((point) => {
      const x = Math.floor(point[0] / 0.5);
      const belowY = Math.floor((point[1] - 0.001) / 0.5);
      const z = Math.floor(point[2] / 0.5);
      return world.isSolid(x, belowY, z) && Math.abs(point[1] - (belowY + 1) * 0.5) <= 0.01;
    });
    expect(supported).toBe(true);
    expect(lowest).toBeGreaterThanOrEqual(0);
  });
  it('keeps every corner before a wall face while moving at 6 m/s', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [0.5, 0.25, 0.25];
    b.velocity = [6, 0, 0];
    const world = { blockSize: 0.5, isSolid: (x: number) => x >= 2 };
    for (let i = 0; i < 120; i++) {
      stepRigidBody(b, 1 / 120, world, 0);
      for (const local of b.corners) {
        expect(b.center[0] + local[0]).toBeLessThanOrEqual(1.01);
      }
    }
  });
  it('conserves kinetic plus potential energy in a one-second gravity-only flight', () => {
    const b = body();
    b.center = [0, 5, 0];
    b.velocity = [2, 3, -1];
    b.angularMomentum = [0.7, 1.3, 0.2];
    const energy = () =>
      0.5 * b.mass * (b.velocity[0] ** 2 + b.velocity[1] ** 2 + b.velocity[2] ** 2) +
      0.5 *
        (b.angularMomentum[0] * angularVelocity(b)[0] +
          b.angularMomentum[1] * angularVelocity(b)[1] +
          b.angularMomentum[2] * angularVelocity(b)[2]) +
      b.mass * 9.8 * b.center[1];
    const initial = energy();
    for (let i = 0; i < 60; i++) {
      stepRigidBody(b, 1 / 60, undefined, 9.8);
    }
    expect(Math.abs(energy() / initial - 1)).toBeLessThan(0.01);
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
