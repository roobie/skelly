import { expect, it } from 'vitest';
import { amalgamFigureForType, amalgamStrikeOrigin } from '../src/core/amalgamFigure.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldMeleeBlocker, worldOpaque, worldSolid, worldSoundBlocking } from '../src/core/collision.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ZombieDef } from '../src/core/schema.ts';
import { soundOcclusion } from '../src/core/soundOcclusion.ts';
import { simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { type MeleeWeapon, PLAYER_CHEST_METRES, zombieAttackReachMetres } from '../src/core/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

const fixture = (reachMetres = 2.1, moves?: ZombieDef['attack']['moves']) => {
  const registry = baseRegistry();
  const fence = registry.blockIds.get('chain_link')!;
  registry.blocks[fence] = {
    ...registry.blocks[fence]!,
    meleePass: { motions: ['thrust'], minimumZombieReachMetres: 2 },
  };
  const world = new World();
  const entities = new BlockEntities(registry);
  const solid = worldSolid(world, registry, entities);
  const opaque = worldOpaque(world, registry, entities);
  const soundBlocking = worldSoundBlocking(world, registry, { entities });
  const wire = (block: number) => {
    for (let y = 1; y < 9; y++) {
      for (let z = -3; z < 4; z++) {
        world.setBlock(1, y, z, block);
      }
    }
  };
  for (let x = -4; x < 9; x++) {
    for (let z = -4; z < 5; z++) {
      world.setBlock(x, 0, z, registry.blockIds.get('stone')!);
    }
  }
  wire(fence);
  const hits: number[] = [];
  const system = new ZombieSystem({
    isSolid: solid,
    isOpaque: opaque,
    isSoundBlocking: soundBlocking,
    meleeBlocker: worldMeleeBlocker(world, registry, { entities }),
    player: () => ({
      pos: [0.5, 1, 0.5],
      facing: [1, 0, 0],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
    }),
    dayPhase: () => dayStateAtHour(12),
    blockSize: 0.5,
    physics: physicsFor(makeScale(0.5)),
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: (damage) => hits.push(damage),
  });
  const type = {
    ...registry.zombies.get('shambler')!,
    attack: {
      ...registry.zombies.get('shambler')!.attack,
      reach: reachMetres,
      windupSimSeconds: simSeconds(0.2),
      moves: moves ?? [
        { ...registry.zombies.get('shambler')!.attack.moves[0]!, id: 'fixture_thrust', motion: 'thrust' },
      ],
    },
  };
  const id = system.add(type, [3.5, 1, 0.5], [-1, 0, 0]);
  const zombie = system.store.get(id)!;
  const head = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, 0.5)).head[0]!.voxelCentroid;
  const origin: Vec3 = [0.5, head[1], 0.5];
  const delta = head.map((coordinate, axis) => coordinate - origin[axis]!) as Vec3;
  const direction = delta.map((coordinate) => coordinate / Math.hypot(...delta)) as Vec3;
  return { registry, entities, opaque, soundBlocking, wire, hits, system, id, zombie, origin, direction };
};

it('allows a player thrust through wire but rejects swing and wrestle regardless of damage kind', () => {
  for (const motion of ['thrust', 'swing', 'wrestle'] as const) {
    const { system, origin, direction, id } = fixture();
    const weapon: MeleeWeapon = {
      ...FISTS_MELEE,
      motion,
      reach: 3,
      damage: 1,
      cooldown: 0,
      type: motion === 'thrust' ? 'blunt' : 'pierce',
      damageVariance: 0,
    };
    expect(system.swing(origin, direction, weapon)).toBe(motion === 'thrust' ? id : undefined);
  }
});

it("a player's punch does not pass wire", () => {
  const { system, origin, direction } = fixture();
  const punch: MeleeWeapon = { ...FISTS_MELEE, reach: 3 };
  expect(system.swing(origin, direction, punch)).toBeUndefined();
});

it('keeps shots and their aim display blocked by wire even when thrusting melee can pass', () => {
  const { system, origin, direction, wire } = fixture();
  const weapon: MeleeWeapon = { ...FISTS_MELEE, motion: 'thrust', reach: 10, damage: 1, cooldown: 0, type: 'pierce' };
  const shot = { origin, directions: [direction], damage: 1, rangeMetres: 10, impulse: 0 };
  expect(system.aimAt(origin, direction, weapon)).toBeUndefined();
  expect(system.firePellets(shot).hits).toBe(0);
  wire(0);
  expect(system.aimAt(origin, direction, weapon)).toBeDefined();
  expect(system.firePellets(shot).hits).toBe(1);
});

it('requires enough content-defined zombie reach to start and land a thrust through wire', () => {
  for (const reach of [1.9, 2.1]) {
    const { system, zombie, hits } = fixture(reach);
    system.tick(1 / 60);
    expect(zombie.attackWindup > 0).toBe(reach >= 2);
    for (let tick = 0; tick < 20; tick++) {
      system.tick(1 / 60);
    }
    expect(hits.length > 0).toBe(reach >= 2);
  }
});

it('chooses only motion-clear moves at contact when a zombie also has a blocked high-weight move', () => {
  const template = baseRegistry().zombies.get('shambler')!.attack.moves[0]!;
  const thrust = { ...template, id: 'fixture_thrust', motion: 'thrust' as const, damage: 1, weight: 1 };
  const wrestle = { ...template, id: 'fixture_wrestle', motion: 'wrestle' as const, damage: 5, weight: 1000 };
  const { system, zombie, hits } = fixture(2.1, [wrestle, thrust]);
  system.tick(1 / 60);
  expect(zombie.attackWindup).toBeGreaterThan(0);
  for (let tick = 0; tick < 20; tick++) {
    system.tick(1 / 60);
  }
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every((damage) => damage === thrust.damage)).toBe(true);
});

it('rechecks the blocker at zombie contact when a solid wall replaces the wire during windup', () => {
  const { system, zombie, hits, wire, registry } = fixture();
  system.tick(1 / 60);
  expect(zombie.attackWindup).toBeGreaterThan(0);
  wire(registry.blockIds.get('stone')!);
  for (let tick = 0; tick < 20; tick++) {
    system.tick(1 / 60);
  }
  expect(zombie.attackWindup).toBe(0);
  expect(hits).toEqual([]);
});

it('blocks the shambler swing and piercing bite through wire even when their reach is sufficient', () => {
  const { moves } = baseRegistry().zombies.get('shambler')!.attack;
  expect(moves.length).toBeGreaterThan(0);
  for (const move of moves) {
    const { system, zombie, hits, wire } = fixture(2.1, [move]);
    system.tick(1 / 60);
    expect(zombie.attackWindup).toBe(0);
    for (let tick = 0; tick < 20; tick++) {
      system.tick(1 / 60);
    }
    expect(hits).toEqual([]);
    wire(0);
    system.tick(1 / 60);
    expect(zombie.attackWindup).toBeGreaterThan(0);
  }
});

it('admits the amalgam tentacle thrust only when its reach clears the wire threshold', () => {
  for (const admits of [false, true]) {
    const registry = baseRegistry();
    const world = new World();
    const entities = new BlockEntities(registry);
    const movement = worldSolid(world, registry, entities);
    const physical = (x: number, y: number, z: number) => y === 0 || movement(x, y, z);
    let playerPos: Vec3 = [0, 1, 8];
    const hits: number[] = [];
    const system = new ZombieSystem({
      isSolid: physical,
      isOpaque: worldOpaque(world, registry, entities),
      meleeBlocker: worldMeleeBlocker(world, registry, { entities, physical }),
      player: () => ({
        pos: playerPos,
        facing: [0, 0, -1],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      }),
      dayPhase: () => dayStateAtHour(12),
      blockSize: 0.5,
      physics: physicsFor(makeScale(0.5)),
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: (damage) => hits.push(damage),
    });
    const type = registry.zombies.get('amalgam')!;
    const id = system.add(type, [0, 1, 0], [0, 0, 1]);
    const zombie = system.store.get(id)!;
    const reach = zombieAttackReachMetres(zombie);
    const origin = amalgamStrikeOrigin(amalgamFigureForType(type, zombie.figureSeed), zombie.facing).map(
      (value, axis) => value / 0.5 + zombie.body.pos[axis]!,
    ) as Vec3;
    playerPos = [origin[0], origin[1] - PLAYER_CHEST_METRES / 0.5, origin[2] + (reach * 0.9) / 0.5];
    const fence = registry.blockIds.get('chain_link')!;
    registry.blocks[fence] = {
      ...registry.blocks[fence]!,
      meleePass: {
        motions: ['thrust'],
        minimumZombieReachMetres: reach + (admits ? -0.1 : 0.1),
      },
    };
    const plane = Math.floor((origin[2] + playerPos[2]) / 2);
    for (let x = -16; x <= 16; x++) {
      for (let y = 1; y < 24; y++) {
        world.setBlock(x, y, plane, fence);
      }
    }
    system.tick(1 / 60);
    expect(zombie.attackWindup > 0).toBe(admits);
    for (let tick = 0; tick <= Math.ceil(type.attack.windupSimSeconds * 60); tick++) {
      system.tick(1 / 60);
    }
    expect(hits.length > 0).toBe(admits);
  }
});

it('uses sound blocking independently of sight for wire, foliage and closed furniture', () => {
  const { registry, soundBlocking, opaque, wire, entities } = fixture();
  const fence = registry.blockIds.get('chain_link')!;
  registry.blocks[fence] = { ...registry.blocks[fence]!, opaque: true };
  const sound = () =>
    soundOcclusion({
      listener: [0.5, 3, 0.5],
      source: [3.5, 3, 0.5],
      isSolid: soundBlocking,
      globalWall: TEST_SENSE_TUNING.wall,
    });
  expect(opaque(1, 3, 0)).toBe(true);
  expect(sound().occluded).toBe(false);
  wire(registry.blockIds.get('leaves')!);
  expect(opaque(1, 3, 0)).toBe(true);
  expect(sound().occluded).toBe(false);
  wire(registry.blockIds.get('stone')!);
  expect(sound().occluded).toBe(true);
  wire(0);
  const door = entities.add({ type: 'wood_door', pos: [1, 1, 0], size: [1, 4, 1], facing: 'n' })!;
  expect(sound().occluded).toBe(true);
  entities.setOpen(door, true);
  expect(sound().occluded).toBe(false);
});
