import { describe, expect, it } from 'vitest';
import { type Body, bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
import { StepOffset } from '../src/render/stepOffset.ts';

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

  it('stops at a body face when moving from either side', () => {
    const obstacle = createPlayerBody(metre, 0, 10.001, 0.5);
    obstacle.onGround = true;
    const body = createPlayerBody(metre, 2, 10.001, 0.5);
    body.onGround = true;
    run(60, () => {
      body.vel[0] = -6;
      stepBody(body, 1 / 60, floor, { ...physicsFor(metre), obstacles: [obstacle] });
    });
    expect(body.pos[0] - body.halfWidth).toBeGreaterThanOrEqual(obstacle.pos[0] + obstacle.halfWidth - 0.001);
    expect(body.pos[0]).toBeCloseTo(0.6, 3);
  });

  it('does not land a jumping player on a shambler instead of terrain', () => {
    const shambler: Body = {
      pos: [0, 10, 0],
      vel: [0, 0, 0],
      halfWidth: 0.56,
      height: 3.4,
      onGround: true,
    };
    const body = createPlayerBody(metre, 0, 14, 0);
    body.vel[1] = PLAYER.jump;
    let [, highest] = body.pos;
    run(120, () => {
      stepBody(body, 1 / 60, floor, { ...physicsFor(metre), obstacles: [shambler] });
      highest = Math.max(highest, body.pos[1]);
    });
    expect(highest).toBeGreaterThan(14);
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(10, 3);
    expect(body.pos[1]).toBeLessThan(shambler.pos[1] + shambler.height);
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

  it('smooths the player camera over grounded step snaps but not a jump', () => {
    const ledge = (x: number, y: number) => y === 0 || (x === 3 && y === 1);
    const body = createPlayerBody(half, 2.4, 1, 0.5);
    body.onGround = true;
    body.vel[0] = PLAYER.walk / half.blockSize;
    const visual = new StepOffset(PLAYER.stepHeight);
    const position = () =>
      [body.pos[0] * half.blockSize, body.pos[1] * half.blockSize, body.pos[2] * half.blockSize] as [
        number,
        number,
        number,
      ];
    const cameraY = (verticalOffset: number) => body.pos[1] * half.blockSize + PLAYER.eye + verticalOffset;
    visual.update(position(), body.onGround, 0);

    const beforeStep = cameraY(0);
    stepBody(body, 1 / 60, ledge, physicsFor(half));
    expect(body.pos[1]).toBeCloseTo(2, 3);
    let offset = visual.update(position(), body.onGround, 1 / 60);
    let previousDrawnY = cameraY(offset);
    expect(Math.abs(previousDrawnY - beforeStep)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(offset)).toBeLessThanOrEqual(PLAYER.stepHeight);
    expect(body.pos[0] * half.blockSize).toBeCloseTo(1.23, 3);
    for (let frame = 1; frame < 15; frame++) {
      offset = visual.update(position(), body.onGround, 1 / 60);
      const drawnY = cameraY(offset);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(offset)).toBeLessThanOrEqual(PLAYER.stepHeight);
      expect(body.pos[0] * half.blockSize).toBeCloseTo(1.23, 3);
      previousDrawnY = drawnY;
    }
    expect(offset).toBe(0);
    expect(cameraY(offset)).toBeCloseTo(body.pos[1] * half.blockSize + PLAYER.eye);

    // A grounded snap down one block gets the opposite compensation.
    const beforeDescent = cameraY(0);
    body.pos[1] -= 1;
    offset = visual.update(position(), body.onGround, 1 / 60);
    previousDrawnY = cameraY(offset);
    expect(Math.abs(previousDrawnY - beforeDescent)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      offset = visual.update(position(), body.onGround, 1 / 60);
      const drawnY = cameraY(offset);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(offset).toBe(0);

    body.pos[1] += 1;
    offset = visual.update(position(), true, 1 / 60);
    expect(Math.abs(offset)).toBeGreaterThan(0);
    expect(visual.update(position(), true, 1 / 60, true)).toBe(0);
    body.pos[1] -= 1;

    body.onGround = true;
    body.vel[1] = PLAYER.jump / half.blockSize;
    stepBody(body, 1 / 60, ledge, physicsFor(half));
    expect(body.onGround).toBe(false);
    offset = visual.update(position(), body.onGround, 1 / 60);
    expect(offset).toBe(0);
    expect(cameraY(offset)).toBeCloseTo(body.pos[1] * half.blockSize + PLAYER.eye);
  });

  it('detects blocks inside the body', () => {
    const body = createPlayerBody(metre, 0.5, 10, 0.5);
    expect(bodyOverlapsBlock(body, [0, 11, 0])).toBe(true);
    expect(bodyOverlapsBlock(body, [0, 12, 0])).toBe(false);
    expect(bodyOverlapsBlock(body, [1, 10, 0])).toBe(false);
  });
});

describe('steer', () => {
  it('walks, jogs and sprints at the speeds in metres per second', () => {
    const speed = (intent: { sprint: boolean; walk: boolean }) => {
      const body = createPlayerBody(half, 0, 0, 0);
      steer(body, half, 0, { forward: 1, right: 0, jump: false, ...intent });
      return Math.hypot(body.vel[0], body.vel[2]) * half.blockSize;
    };
    expect(speed({ sprint: false, walk: true })).toBeCloseTo(PLAYER.walk);
    expect(speed({ sprint: false, walk: false })).toBeCloseTo(PLAYER.jog);
    expect(speed({ sprint: true, walk: true })).toBeCloseTo(PLAYER.sprint);
  });

  it('keeps a crouching sprint slower than walking', () => {
    const body = createPlayerBody(half, 0, 0, 0);
    steer(body, half, 0, { forward: 1, right: 0, jump: false, sprint: true, walk: false, crouch: true });
    const crouchSpeed = Math.hypot(body.vel[0], body.vel[2]) * half.blockSize;
    const walking = createPlayerBody(half, 0, 0, 0);
    steer(walking, half, 0, { forward: 1, right: 0, jump: false, sprint: false, walk: true });
    const walkingSpeed = Math.hypot(walking.vel[0], walking.vel[2]) * half.blockSize;
    expect(crouchSpeed).toBeLessThan(walkingSpeed);
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
