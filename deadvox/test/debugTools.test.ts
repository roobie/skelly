import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, ZombieSystem } from '../src/core/zombies.ts';
import { equipDebugStartWeapon, formatMeleeResult } from '../src/debug/index.ts';
import { stepNoclip } from '../src/debug/noclip.ts';
import { startingLoadout } from '../src/game/loadout.ts';
import { createPlayerBody, PLAYER, physicsFor } from '../src/game/player.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SCALE = makeScale(0.5);
const FLOOR = (_x: number, y: number) => y === 0;
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

const playerEye: Vec3 = [0, (SCALE.blockSize + PLAYER.eye) / SCALE.blockSize, 0];

describe('debug starting equipment', () => {
  it('formats actual melee hit outcomes for the debug panel', () => {
    expect(
      formatMeleeResult({
        id: 1,
        region: 'head',
        damage: 15,
        healthBefore: 15,
        healthAfter: 0,
        outcome: 'decapitated',
      }),
    ).toBe('head 15 damage (15→0) · decapitated');
    expect(
      formatMeleeResult({
        id: 2,
        region: 'torso',
        damage: 15,
        healthBefore: 15,
        healthAfter: 0,
        outcome: 'incapacitated',
      }),
    ).toBe('torso 15 damage (15→0) · incapacitated');
    expect(formatMeleeResult({ damage: 0, outcome: 'nothing' })).toBe('nothing · no region hit');
  });
  it('attaches a bat to a fresh debug game and swings with its damage, reach, and 10 N·s impulse', () => {
    const inventory = new Inventory(registry);
    startingLoadout(inventory);
    equipDebugStartWeapon({ inventory, debugMode: true, newGame: true });
    const bat = inventory.hands.right;
    expect(bat?.type).toBe('baseball_bat');

    const weapon = registry.items.get(bat!.type)!.weapon!.melee!;
    expect(weapon).toMatchObject({ damage: 15, reach: 0.8, impulse: 10 });
    let launchImpulse: number | undefined;
    const system = new ZombieSystem({
      player: () => ({
        pos: [0, playerEye[1] - PLAYER.eye / SCALE.blockSize, 0],
        facing: [1, 0, 0],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
      }),
      isSolid: FLOOR,
      hour: () => 12,
      blockSize: SCALE.blockSize,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
      onSever: (_id, _zombie, _part, hit) => {
        launchImpulse = hit.impulse;
      },
    });
    const shambler = {
      ...registry.zombies.get('shambler')!,
      dismember: { chance: 0, headOnKillChance: 1 },
    };
    const id = system.add(shambler, [1.85 / SCALE.blockSize, 1, 0], [-1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.figureSeed = 1;
    zombie.regions.head = weapon.damage;
    const boxes = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, SCALE.blockSize)).head;
    const target = boxes
      .map((box) => box.voxelCentroid)
      .find((candidate) => {
        const direction = candidate.map((value, axis) => value - playerEye[axis]!) as Vec3;
        const length = Math.hypot(...direction);
        const ray = direction.map((value) => value / length) as Vec3;
        return system.aimAt(playerEye, ray, weapon)?.region === 'head';
      })!;
    const direction = target.map((value, axis) => value - playerEye[axis]!) as Vec3;
    const length = Math.hypot(...direction);
    const ray = direction.map((value) => value / length) as Vec3;
    expect(system.swing(playerEye, ray, FISTS_MELEE)).toBeUndefined();
    expect(system.swing(playerEye, ray, weapon)).toBe(id);
    expect(zombie.regions.head).toBe(0);
    expect(launchImpulse).toBe(10);
  });

  it('does not replace occupied hands or add equipment to a restored or non-debug game', () => {
    const inventory = new Inventory(registry);
    const flashlight = inventory.create('flashlight');
    expect(inventory.add(flashlight, { kind: 'hand', side: 'right' })).toBe(true);
    equipDebugStartWeapon({ inventory, debugMode: true, newGame: true });
    expect(inventory.hands.right).toBe(flashlight);
    expect(inventory.hands.left).toBeUndefined();

    const restored = new Inventory(registry);
    const savedBat = restored.create('baseball_bat');
    expect(restored.add(savedBat, { kind: 'hand', side: 'right' })).toBe(true);
    equipDebugStartWeapon({ inventory: restored, debugMode: true, newGame: false });
    expect(restored.hands.right).toBe(savedBat);
    expect(restored.hands.left).toBeUndefined();

    const nonDebug = new Inventory(registry);
    equipDebugStartWeapon({ inventory: nonDebug, debugMode: false, newGame: true });
    expect(nonDebug.hands).toEqual({});
  });

  it('keeps ordinary starting hands empty', () => {
    const inventory = new Inventory(registry);
    startingLoadout(inventory);
    expect(inventory.hands).toEqual({});
  });
});

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
