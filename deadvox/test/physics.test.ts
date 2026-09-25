import { describe, expect, it } from 'vitest';
import { bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { createPlayerBody, physicsFor } from '../src/game/player.ts';

const metre = makeScale(1);
const half = makeScale(0.5);
const floor = (x: number, y: number, _z: number) => y < 10 || (x === 3 && y < 12);
const run = (steps: number, fn: () => void) => {
  for (let i = 0; i < steps; i++) {
    fn();
  }
};

describe('stepBody', () => {
  it('falls and comes to rest on top of the ground', () => {
    const body = createPlayerBody(metre, 0.5, 20, 0.5);
    run(180, () => stepBody(body, 1 / 60, floor, physicsFor(metre)));
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(10, 3);
    expect(body.vel[1]).toBe(0);
  });

  it('is stopped by a wall', () => {
    const body = createPlayerBody(metre, 0.5, 10.001, 0.5);
    run(60, () => {
      body.vel[0] = 6;
      stepBody(body, 1 / 60, floor, physicsFor(metre));
    });
    expect(body.pos[0] + body.halfWidth).toBeLessThanOrEqual(3);
    expect(body.pos[0] + body.halfWidth).toBeGreaterThan(2.99);
  });

  describe('step-up (0.5 m)', () => {
    const ledge = (height: number) => (x: number, y: number, _z: number) => y < 10 || (x >= 3 && y < 10 + height);
    const walkEast = (scale: typeof half, height: number) => {
      const body = createPlayerBody(scale, 0.5, 10.001, 0.5);
      body.onGround = true;
      run(60, () => {
        body.vel[0] = 8;
        stepBody(body, 1 / 60, ledge(height), physicsFor(scale));
      });
      return body;
    };

    it('walks up a one-block ledge when blocks are 0.5 m', () => {
      const body = walkEast(half, 1);
      expect(body.pos[0]).toBeGreaterThan(4);
      expect(body.pos[1]).toBeCloseTo(11, 2);
    });

    it('does not climb two 0.5 m blocks without jumping', () => {
      const body = walkEast(half, 2);
      expect(body.pos[0] + body.halfWidth).toBeLessThanOrEqual(3);
    });

    it('does not climb a 1 m block without jumping', () => {
      const body = walkEast(metre, 1);
      expect(body.pos[0] + body.halfWidth).toBeLessThanOrEqual(3);
    });
  });

  it('detects blocks inside the body', () => {
    const body = createPlayerBody(metre, 0.5, 10, 0.5);
    expect(bodyOverlapsBlock(body, [0, 11, 0])).toBe(true);
    expect(bodyOverlapsBlock(body, [0, 12, 0])).toBe(false);
    expect(bodyOverlapsBlock(body, [1, 10, 0])).toBe(false);
  });
});

describe('raycast', () => {
  it('hits the first solid block and reports the face it entered', () => {
    const hit = raycast([0.5, 15.5, 0.5], [0, -1, 0], 10, floor);
    expect(hit).toEqual({ block: [0, 9, 0], normal: [0, 1, 0], distance: 5.5 });
    const side = raycast([0.5, 11.5, 0.5], [1, 0, 0], 10, floor);
    expect(side?.block).toEqual([3, 11, 0]);
    expect(side?.normal).toEqual([-1, 0, 0]);
  });

  it('gives up beyond max distance', () => {
    expect(raycast([0.5, 15.5, 0.5], [0, -1, 0], 5, floor)).toBeUndefined();
  });
});
