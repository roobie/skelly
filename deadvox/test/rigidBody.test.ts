import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import {
  angularVelocity,
  applyImpulse,
  applyImpulseAtClampedPoint,
  clampPointToRigidBody,
  type RigidBody,
  stepRigidBody,
} from '../src/core/rigidBody.ts';

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

const armBodyAtSpin = (omega: Vec3): RigidBody => {
  const mass = 3.5;
  const half: Vec3 = [0.05, 0.3, 0.05];
  const inertiaBody: RigidBody['inertiaBody'] = [
    [(mass / 3) * (half[1] ** 2 + half[2] ** 2), 0, 0],
    [0, (mass / 3) * (half[0] ** 2 + half[2] ** 2), 0],
    [0, 0, (mass / 3) * (half[0] ** 2 + half[1] ** 2)],
  ];
  return {
    ...body(),
    mass,
    inertiaBody,
    angularMomentum: [inertiaBody[0][0] * omega[0], inertiaBody[1][1] * omega[1], inertiaBody[2][2] * omega[2]],
    corners: boxCorners3D(half),
  };
};
const boxCorners3D = (half: Vec3): Vec3[] => {
  const result: Vec3[] = [];
  for (const x of [-half[0], half[0]]) {
    for (const y of [-half[1], half[1]]) {
      for (const z of [-half[2], half[2]]) {
        result.push([x, y, z]);
      }
    }
  }
  return result;
};
const rotationalEnergy = (b: RigidBody): number => {
  const omega = angularVelocity(b);
  return 0.5 * b.angularMomentum.reduce((sum, value, axis) => sum + value * omega[axis]!, 0);
};

describe('rigid body', () => {
  it('conserves free-flight arm spin energy and angular momentum at 200 rad/s for two seconds', () => {
    for (const omega of [
      [0, 200, 0],
      [120, 160, 0],
    ] as const) {
      const b = armBodyAtSpin([...omega]);
      const initialEnergy = rotationalEnergy(b);
      const initialMomentum = Math.hypot(...b.angularMomentum);
      for (let frame = 0; frame < 120; frame++) {
        stepRigidBody(b, 1 / 60, undefined, 0);
      }
      expect(Math.abs(rotationalEnergy(b) / initialEnergy - 1)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(Math.hypot(...b.angularMomentum) / initialMomentum - 1)).toBeLessThanOrEqual(0.01);
    }
  });

  it('clamps impulse application points to the oriented OBB in body space', () => {
    const b = body();
    b.orientation = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
    const outsideLocal: Vec3 = [2, -2, 3];
    const outsideWorld = [
      b.center[0] + rotate(b.orientation, outsideLocal)[0],
      b.center[1] + rotate(b.orientation, outsideLocal)[1],
      b.center[2] + rotate(b.orientation, outsideLocal)[2],
    ] as Vec3;
    const applied = clampPointToRigidBody(b, outsideWorld);
    const local = rotate(
      [-b.orientation[0], -b.orientation[1], -b.orientation[2], b.orientation[3]],
      [applied[0] - b.center[0], applied[1] - b.center[1], applied[2] - b.center[2]],
    );
    expect(local[0]).toBeCloseTo(0.2, 12);
    expect(local[1]).toBeCloseTo(-0.1, 12);
    expect(local[2]).toBeCloseTo(0.3, 12);
    expect(applyImpulseAtClampedPoint(b, outsideWorld, [1, 0, 0])).toEqual(applied);
  });

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
    b.mass = 2;
    b.inertiaBody = [
      [0.1, 0, 0],
      [0, 0.1, 0],
      [0, 0, 0.1],
    ];
    b.center = [0.25, 1.1, 0.25];
    applyImpulse(b, [0.25, 1.3, 0.35], [40, 0, 0]);
    expect(Math.hypot(...b.angularMomentum)).toBeGreaterThan(0);
    const worldCorners = (): Vec3[] =>
      b.corners.map((corner) => {
        const rotated = rotate(b.orientation, corner);
        return [b.center[0] + rotated[0], b.center[1] + rotated[1], b.center[2] + rotated[2]];
      });
    let previousCorners = worldCorners();
    let maxInnerCornerTravel = 0;
    const recordInnerPose = () => {
      const currentCorners = worldCorners();
      for (let i = 0; i < previousCorners.length; i++) {
        maxInnerCornerTravel = Math.max(
          maxInnerCornerTravel,
          Math.hypot(...currentCorners[i]!.map((value, axis) => value - previousCorners[i]![axis]!)),
        );
      }
      previousCorners = currentCorners;
    };
    const world = {
      blockSize: 0.5,
      isSolid: (_x: number, y: number, _z: number) => {
        recordInnerPose();
        return y === -1;
      },
    };
    stepRigidBody(b, 1 / 120, world);
    recordInnerPose();
    expect(maxInnerCornerTravel).toBeLessThanOrEqual(0.250_001);
    expect(b.velocity[0]).toBeCloseTo(20, 6);
    b.velocity = [0, 0, 0];
    b.angularMomentum = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
      stepRigidBody(b, 1 / 60, world, 0);
    }
    expect(b.asleep).toBe(true);
  });
  it('caps adaptive collision splitting at eight and only clamps the remaining excess speed', () => {
    const b = body();
    b.corners = boxCorners(0.1);
    b.center = [0, 10, 0];
    b.velocity = [500, 0, 0];
    const worldCorners = () =>
      b.corners.map((corner) => {
        const rotated = rotate(b.orientation, corner);
        return [b.center[0] + rotated[0], b.center[1] + rotated[1], b.center[2] + rotated[2]] as Vec3;
      });
    let previousCorners = worldCorners();
    let maxInnerCornerTravel = 0;
    const world = {
      blockSize: 0.5,
      isSolid: () => {
        const currentCorners = worldCorners();
        for (let i = 0; i < currentCorners.length; i++) {
          maxInnerCornerTravel = Math.max(
            maxInnerCornerTravel,
            Math.hypot(...currentCorners[i]!.map((value, axis) => value - previousCorners[i]![axis]!)),
          );
        }
        previousCorners = currentCorners;
        return false;
      },
    };
    stepRigidBody(b, 1 / 120, world, 0);
    expect(maxInnerCornerTravel).toBeLessThanOrEqual(0.250_001);
    expect(b.center[0]).toBeGreaterThan(1);
    expect(b.velocity[0]).toBeCloseTo(240, 6);
  });
  it('splits world-backed rotation at 0.1 rad and clamps only when eight parts are insufficient', () => {
    const b = armBodyAtSpin([0, 200, 0]);
    let previous = [...b.orientation] as [number, number, number, number];
    let maxAngle = 0;
    const world = {
      blockSize: 0.5,
      isSolid: () => {
        const current = b.orientation;
        const cosine = Math.abs(current.reduce((sum, value, i) => sum + value * previous[i]!, 0));
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, cosine)));
        maxAngle = Math.max(maxAngle, angle);
        previous = [...current];
        return false;
      },
    };
    stepRigidBody(b, 1 / 120, world, 0);
    expect(maxAngle).toBeLessThanOrEqual(0.100_001);
    expect(Math.hypot(...angularVelocity(b))).toBeLessThanOrEqual(96.000_001);
    expect(Math.hypot(...angularVelocity(b))).toBeGreaterThan(20); // no launch-only cap is applied by the stepper
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
  it('does not tunnel through a one-block floor under a 40 N·s downward hit', () => {
    const b = body();
    b.mass = 0.25;
    b.corners = boxCorners(0.1);
    b.center = [0.25, 2, 0.25];
    applyImpulse(b, b.center, [0, -40, 0]);
    const world = { blockSize: 0.5, isSolid: (_x: number, y: number, _z: number) => y === 0 };
    for (let i = 0; i < 120; i++) {
      stepRigidBody(b, 1 / 120, world);
      for (const local of b.corners) {
        expect(b.center[1] + local[1]).toBeGreaterThanOrEqual(-1e-5);
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
    const lowestPoint = points.reduce((lowest, point) => (point[1] < lowest[1] ? point : lowest));
    const lowestXBlock = Math.floor(lowestPoint[0] / 0.5);
    const belowY = Math.floor((lowestPoint[1] - 0.001) / 0.5);
    const lowestZBlock = Math.floor(lowestPoint[2] / 0.5);
    expect(world.isSolid(lowestXBlock, belowY, lowestZBlock)).toBe(true);
    expect(Math.abs(lowestPoint[1] - (belowY + 1) * 0.5)).toBeLessThanOrEqual(0.01);
    expect(lowestPoint[1]).toBeGreaterThanOrEqual(0);
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
