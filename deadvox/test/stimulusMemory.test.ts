import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '../src/core/canonicalJson.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { type PlayerSense, type VocalNoise, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const BLOCK_SIZE = makeScale(0.5).blockSize;
const PHYSICS = physicsFor(makeScale(0.5));
const FLOOR: SolidAt = (_x, y) => y === 0;
const player = (pos: Vec3): PlayerSense => ({
  pos,
  facing: [-1, 0, 0],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
  crouching: false,
});
const senses = (playerFn: () => PlayerSense, isSolid: SolidAt = FLOOR, hour = 12) => ({
  player: playerFn,
  isSolid,
  isOpaque: isSolid,
  hour: () => hour,
  blockSize: BLOCK_SIZE,
  physics: PHYSICS,
  jumpSpeed: PLAYER.jump,
  tuning: TEST_SENSE_TUNING,
  hurtPlayer: () => undefined,
});
const noiseAtPlayer = (id: number, expiresAt: number): VocalNoise => ({
  id,
  pos: [0, 1, 0],
  radiusMetres: 500,
  expiresAt,
});
const unreachableWall: SolidAt = (x, y) => y === 0 || (x === 100 && y > 0 && y < 5);

describe('stimulus memory', () => {
  const memorySeconds = SHAMBLER.stimulusMemorySimSeconds;

  it.each([
    { hour: 12, expected: 'home' },
    { hour: 23, expected: 'roam' },
  ] as const)('forgets an unreachable horde sound during $expected mode', ({ hour, expected }) => {
    const noise = noiseAtPlayer(1, 1);
    const target = () => ({ ...player([0, 1, 0]), vocalNoise: noise });
    const system = new ZombieSystem({ ...senses(target, unreachableWall, hour), isLoaded: () => true });
    system.addHorde('memory-fixture', SHAMBLER, [200, 1, 0], 1);
    let time = 0.5;
    system.tickBackground(0.5, time);
    expect(system.snapshotState().hordes[0]?.mode).toBe('noise');
    expect(system.snapshotState().hordes[0]?.stimulusAt).toBe(time);

    const steps = Math.ceil(memorySeconds / 0.5) + 2;
    for (let step = 0; step < steps; step++) {
      time += 0.5;
      system.tickBackground(0.5, time);
    }
    expect(system.store.get(1)?.body.pos[0]).toBeGreaterThan(100);
    expect(system.snapshotState().hordes[0]?.mode).toBe(expected);
    expect(system.snapshotState().hordes[0]?.stimulusAt).toBeUndefined();
  });

  it('restarts a horde’s memory when it hears a newer sound before forgetting the first', () => {
    let noise = noiseAtPlayer(1, 1);
    const target = () => ({ ...player([0, 1, 0]), vocalNoise: noise });
    const system = new ZombieSystem({ ...senses(target, unreachableWall), isLoaded: () => true });
    system.addHorde('memory-refresh-fixture', SHAMBLER, [200, 1, 0], 1);
    const firstTime = 0.5;
    system.tickBackground(0.5, firstTime);
    const firstStamp = system.snapshotState().hordes[0]?.stimulusAt;
    if (firstStamp === undefined) {
      throw new Error('Horde did not record the first sound time');
    }

    const oldDeadline = firstStamp + memorySeconds;
    const secondTime = firstStamp + memorySeconds / 2;
    noise = noiseAtPlayer(2, secondTime + 0.5);
    system.tickBackground(0.5, secondTime);
    expect(system.snapshotState().hordes[0]?.stimulusAt).toBe(secondTime);
    system.tickBackground(0.5, oldDeadline);
    expect(system.snapshotState().hordes[0]?.mode).toBe('noise');
    system.tickBackground(0.5, secondTime + memorySeconds);
    expect(system.snapshotState().hordes[0]?.mode).toBe('home');
  });

  it('returns a blocked active investigator to its home behavior after stimulus memory expires', () => {
    const noise = noiseAtPlayer(1, 1);
    const target = () => ({ ...player([0, 1, 0]), vocalNoise: noise });
    const type = { ...SHAMBLER, sight: 0.01, nightSight: 0.01 };
    const wall: SolidAt = (x, y) => y === 0 || (x === 10 && y > 0 && y < 5);
    const system = new ZombieSystem({ ...senses(target, wall), seed: 113 });
    const zombie = system.store.get(system.add(type, [20, 1, 0]))!;
    zombie.body.onGround = true;
    const dt = 1 / 20;
    let time = dt;
    system.tickActive(dt, time);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.body.pos[0]).toBeGreaterThan(10);
    const { stimulusAt } = zombie;
    if (stimulusAt === undefined) {
      throw new Error('Active zombie did not record the heard sound time');
    }
    const deadline = stimulusAt + type.stimulusMemorySimSeconds;
    const ticksBeforeExpiry = Math.ceil((deadline - time) / dt) - 1;
    for (let tick = 0; tick < ticksBeforeExpiry; tick++) {
      time += dt;
      system.tickActive(dt, time);
    }
    expect(zombie.mode).toBe('investigate');
    expect(zombie.body.pos[0]).toBeGreaterThan(10);
    time += dt;
    system.tickActive(dt, time);
    expect(zombie.mode).toBe('return');
    expect(zombie.lastPerceived).toBeUndefined();
  });

  it('round-trips forgotten zombie and horde state with a fresh zombie', () => {
    const noise = noiseAtPlayer(1, 1);
    const target = () => ({ ...player([0, 1, 0]), vocalNoise: noise });
    const type = { ...SHAMBLER, sight: 0.01, nightSight: 0.01 };
    const wall: SolidAt = (x, y) => y === 0 || (x === 10 && y > 0 && y < 5);
    const options = { ...senses(target, wall), seed: 113 };
    const system = new ZombieSystem(options);
    const zombie = system.store.get(system.add(type, [20, 1, 0]))!;
    system.addHorde('forgotten-memory-fixture', type, [200, 1, 0], 1);
    zombie.body.onGround = true;
    const dt = 1 / 20;
    let time = dt;
    system.tickActive(dt, time);
    system.tickBackground(dt, time);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.stimulusAt).toBeDefined();
    expect(zombie.lastPerceived).toBeDefined();
    expect(zombie.investigationTier).toBeDefined();
    expect(system.snapshotState().hordes[0]?.stimulusAt).toBe(time);
    const stimulusAt = zombie.stimulusAt!;
    const deadline = stimulusAt + type.stimulusMemorySimSeconds;
    while (time < deadline + dt) {
      time += dt;
      system.tickActive(dt, time);
      system.tickBackground(dt, time);
    }

    expect(zombie.mode).toBe('return');
    expect(zombie.stimulusAt).toBeUndefined();
    expect(zombie.lastPerceived).toBeUndefined();
    expect(zombie.investigationTier).toBeUndefined();
    expect(zombie.searchAnchor).toBeUndefined();
    expect(system.snapshotState().hordes[0]?.stimulusAt).toBeUndefined();

    system.add(type, [40, 1, 0]);
    const snapshot = system.snapshotState();
    const canonical = canonicalJsonBytes(snapshot);
    const restored = new ZombieSystem(options);
    restored.restoreState(snapshot, (id) => registry.zombies.get(id));
    expect(canonicalJsonBytes(restored.snapshotState())).toEqual(canonical);
  });
});
