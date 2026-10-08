import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyIsClear, placeShamblerRing } from '../src/bench/shamblerPlacement.ts';
import { buildRegistry } from '../src/core/content.ts';
import { type Body, bodyOverlapsBlock } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import {
  ZombieSystem,
  zombieAttackReachForType,
  zombieAttackReachMetres,
  zombieBodyDimensions,
} from '../src/core/zombies.ts';
import { spawnShamblers, spawnZombieType } from '../src/debug/shamblerSpawning.ts';
import type { Engine } from '../src/game/engine.ts';
import { createPlayerBody, PLAYER, physicsFor } from '../src/game/player.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SCALE = makeScale(0.5);
const player = () => createPlayerBody(SCALE, 0, 1, 0);

const testEngine = (isSolid: (x: number, y: number, z: number) => boolean, seed = 2026): Engine =>
  ({
    config: { seed, scale: SCALE },
    registry,
    spawn: { pos: [0, SCALE.blockSize, 0], yaw: 0 },
    groundAt: () => SCALE.blockSize,
    isSolid,
    isOpaque: isSolid,
  }) as unknown as Engine;

const zombiesFor = (body: ReturnType<typeof player>, isSolid: (x: number, y: number, z: number) => boolean) =>
  new ZombieSystem({
    isSolid,
    isOpaque: isSolid,
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    player: () => ({
      pos: body.pos,
      body,
      facing: [0, 0, -1],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
    }),
    dayPhase: () => dayStateAtHour(12),
    hurtPlayer: () => undefined,
  });

const horizontalOverlap = (a: ReturnType<typeof player>, b: ReturnType<typeof player>): boolean =>
  Math.abs(a.pos[0] - b.pos[0]) < a.halfWidth + b.halfWidth &&
  Math.abs(a.pos[2] - b.pos[2]) < a.halfWidth + b.halfWidth;

describe('debug shambler spawning', () => {
  it('spawns 25 clear, non-overlapping bodies using the shared ring placement', () => {
    const solid = (x: number, y: number, z: number) =>
      y === 0 || (x >= 15 && x <= 18 && y >= 1 && y <= 4 && z >= -2 && z <= 2);
    const engine = testEngine(solid);
    const body = player();
    const zombies = zombiesFor(body, solid);

    expect(spawnShamblers(engine, body, zombies, 25)).toBe(25);
    const bodies = [body, ...[...zombies.store.entries()].map(([, zombie]) => zombie.body)];
    expect(bodies).toHaveLength(26);
    for (let i = 0; i < bodies.length; i++) {
      expect(bodyIsClear(bodies[i]!, solid)).toBe(true);
      for (let j = i + 1; j < bodies.length; j++) {
        expect(horizontalOverlap(bodies[i]!, bodies[j]!)).toBe(false);
      }
    }
  });

  it('keeps later V spawns separate from already-active shamblers', () => {
    const solid = (_x: number, y: number) => y === 0;
    const engine = testEngine(solid);
    const body = player();
    const zombies = zombiesFor(body, solid);

    expect(spawnShamblers(engine, body, zombies, 10)).toBe(10);
    expect(spawnShamblers(engine, body, zombies, 10)).toBe(10);
    const bodies = [body, ...[...zombies.store.entries()].map(([, zombie]) => zombie.body)];
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        expect(horizontalOverlap(bodies[i]!, bodies[j]!)).toBe(false);
      }
    }
  });

  it('debug-spawned amalgams pursue from beyond their scaled attack reach', () => {
    const body = player();
    const solid = (_x: number, y: number) => y === 0;
    const engine = testEngine(solid, 73);
    const zombies = zombiesFor(body, solid);

    expect(spawnZombieType(engine, body, zombies, { typeId: 'amalgam', count: 1 })).toBe(1);
    const [id, zombie] = [...zombies.store.entries()][0]!;
    const initialDistance =
      Math.hypot(body.pos[0] - zombie.body.pos[0], body.pos[2] - zombie.body.pos[2]) * SCALE.blockSize;
    expect(bodyIsClear(zombie.body, solid)).toBe(true);
    expect(initialDistance).toBeGreaterThan(zombieAttackReachMetres(zombie));
    for (let tick = 0; tick < 20 * 60; tick++) {
      zombies.tick(1 / 60);
    }
    const remainingDistance =
      Math.hypot(body.pos[0] - zombie.body.pos[0], body.pos[2] - zombie.body.pos[2]) * SCALE.blockSize;

    expect(zombies.store.get(id)!.mode).toBe('chase');
    expect(remainingDistance).toBeLessThan(initialDistance);
  });

  it('keeps the realized amalgam envelope clear when the debug path places it', () => {
    const type = registry.zombies.get('amalgam')!;
    const body = player();
    const floor = (_x: number, y: number) => y === 0;
    const openEngine = testEngine(floor, 73);
    const minRadiusMetres = Math.max(8, zombieAttackReachForType(type) + 1);
    const [position] = placeShamblerRing({
      count: 1,
      seed: openEngine.config.seed,
      player: body,
      engine: openEngine,
      minRadiusMetres,
    });
    expect(position).toBeDefined();

    const smallBody: Body = {
      pos: position!,
      vel: [0, 0, 0],
      halfWidth: 0.28 / SCALE.blockSize,
      height: 1.7 / SCALE.blockSize,
      onGround: true,
    };
    const largeBody: Body = { ...smallBody, ...zombieBodyDimensions(type, SCALE.blockSize) };
    const blocks: [number, number, number][] = [];
    for (
      let x = Math.floor(position![0] - largeBody.halfWidth);
      x <= Math.ceil(position![0] + largeBody.halfWidth);
      x++
    ) {
      for (
        let z = Math.floor(position![2] - (largeBody.halfDepth ?? largeBody.halfWidth));
        z <= Math.ceil(position![2] + (largeBody.halfDepth ?? largeBody.halfWidth));
        z++
      ) {
        blocks.push([x, 1, z]);
      }
    }
    const obstacle = blocks.find(
      (block) => bodyOverlapsBlock(largeBody, block) && !bodyOverlapsBlock(smallBody, block),
    );
    expect(obstacle).toBeDefined();
    const solid = (x: number, y: number, z: number) =>
      y === 0 || (obstacle?.every((coordinate, axis) => coordinate === [x, y, z][axis]) ?? false);
    const engine = testEngine(solid, 73);
    const zombies = zombiesFor(body, solid);

    expect(spawnZombieType(engine, body, zombies, { typeId: 'amalgam', count: 1 })).toBe(1);
    expect(bodyIsClear([...zombies.store.entries()][0]![1].body, solid)).toBe(true);
  });

  it('returns the partial placement count when the ring runs out of clear space', () => {
    let measuredCalls = 0;
    const openEngine = testEngine(() => {
      measuredCalls += 1;
      return false;
    });
    const foothold = player();
    expect(
      placeShamblerRing({ count: 1, seed: openEngine.config.seed, player: foothold, engine: openEngine }),
    ).toHaveLength(1);

    let calls = 0;
    const crowdedEngine = testEngine(() => {
      calls += 1;
      return calls > measuredCalls;
    });
    const body = player();
    const zombies = zombiesFor(body, crowdedEngine.isSolid);
    expect(spawnShamblers(crowdedEngine, body, zombies, 3)).toBe(1);
    expect(zombies.store.size).toBe(1);
  });
});
