import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import { stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { stepNoclip } from '../src/debug/noclip.ts';
import { createPlayerBody, physicsFor } from '../src/game/player.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SCALE = makeScale(0.5);
const INTENT = { forward: 1, right: 0, jump: false, sprint: false, walk: false };
const IDLE = { forward: 0, right: 0, jump: false, sprint: false, walk: false };
const RISE = { ...IDLE, jump: true };

const fly = (
  body: ReturnType<typeof createPlayerBody>,
  intent: typeof IDLE | typeof INTENT | typeof RISE,
  descend = false,
) => stepNoclip({ body, scale: SCALE, yaw: -Math.PI / 2, pitch: 0, intent, descend, dt: 1 / 60 });

const makeDoorWorld = () => {
  const entities = new BlockEntities(registry);
  const door = entities.add({ type: 'wood_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const wall = (x: number, y: number) => x === 2 && y >= 1 && y <= 4;
  const solid = (x: number, y: number, z: number) => y === 0 || wall(x, y) || entities.isSolid(x, y, z);
  return { door, entities, solid, wall };
};

describe('debug god mode and noclip', () => {
  it('noclip passes through a solid wall and closed real wood door and stays aloft without ground', () => {
    const { door, entities, solid } = makeDoorWorld();
    expect(door.open).toBe(false);
    expect(solid(2, 1, 0)).toBe(true);
    expect(entities.isSolid(4, 1, 0)).toBe(true);
    const body = createPlayerBody(SCALE, 0, 1, 0.5);
    for (let frame = 0; frame < 5 * 60; frame++) {
      fly(body, INTENT);
    }
    expect(body.pos[0]).toBeGreaterThan(6);
    expect(body.pos[1]).toBe(1);

    const airborne = createPlayerBody(SCALE, 10, 20, 10);
    for (let frame = 0; frame < 5 * 60; frame++) {
      fly(airborne, IDLE);
    }
    expect(airborne.pos[1]).toBe(20);
    expect(airborne.vel).toEqual([0, 0, 0]);

    const lift = createPlayerBody(SCALE, 10, 10, 10);
    for (let frame = 0; frame < 60; frame++) {
      fly(lift, RISE);
    }
    expect(lift.pos[1]).toBeGreaterThan(10);
    for (let frame = 0; frame < 60; frame++) {
      fly(lift, IDLE, true);
    }
    expect(lift.pos[1]).toBeCloseTo(10, 6);
  });

  it('normal physics blocks the same wall/door moves and restores falling without crashing inside a door', () => {
    const { door, solid, wall } = makeDoorWorld();
    expect(door.open).toBe(false);
    const wallBody = createPlayerBody(SCALE, 0, 1, 0.5);
    wallBody.onGround = true;
    for (let frame = 0; frame < 5 * 60; frame++) {
      wallBody.vel[0] = 4.3 / SCALE.blockSize;
      stepBody(wallBody, 1 / 60, solid, physicsFor(SCALE));
    }
    expect(wall(2, 1)).toBe(true);
    expect(wallBody.pos[0] + wallBody.halfWidth).toBeLessThanOrEqual(2.001);

    const doorBody = createPlayerBody(SCALE, 3, 1, 0.5);
    doorBody.onGround = true;
    for (let frame = 0; frame < 5 * 60; frame++) {
      doorBody.vel[0] = 4.3 / SCALE.blockSize;
      stepBody(doorBody, 1 / 60, solid, physicsFor(SCALE));
    }
    expect(doorBody.pos[0] + doorBody.halfWidth).toBeLessThanOrEqual(4.001);

    const falling = createPlayerBody(SCALE, 10, 20, 10);
    for (let frame = 0; frame < 5 * 60; frame++) {
      stepBody(falling, 1 / 60, () => false, physicsFor(SCALE));
    }
    expect(falling.pos[1]).toBeLessThan(20);

    const embedded = createPlayerBody(SCALE, 5, 1, 0.5);
    embedded.onGround = false;
    expect(() => stepBody(embedded, 1 / 60, solid, physicsFor(SCALE))).not.toThrow();
  });
});
