import { describe, expect, it } from 'vitest';
import { bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { createPlayerBody } from '../src/game/player.ts';

const floor = (x: number, y: number, _z: number) => y < 10 || (x === 3 && y < 12);

describe('stepBody', () => {
  it('falls and comes to rest on top of the ground', () => {
    const body = createPlayerBody(0.5, 20, 0.5);
    for (let i = 0; i < 180; i++) stepBody(body, 1 / 60, floor);
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(10, 3);
    expect(body.vel[1]).toBe(0);
  });

  it('is stopped by a wall', () => {
    const body = createPlayerBody(0.5, 10.001, 0.5);
    body.vel[0] = 6;
    for (let i = 0; i < 60; i++) {
      body.vel[0] = 6;
      stepBody(body, 1 / 60, floor);
    }
    expect(body.pos[0] + body.halfWidth).toBeLessThanOrEqual(3);
    expect(body.pos[0] + body.halfWidth).toBeGreaterThan(2.99);
  });

  it('detects blocks inside the body', () => {
    const body = createPlayerBody(0.5, 10, 0.5);
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
