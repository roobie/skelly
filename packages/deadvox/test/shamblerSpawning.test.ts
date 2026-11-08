import { describe, expect, it } from 'vitest';
import { bodyIsClear, placeShamblerRing } from '../src/bench/shamblerPlacement.ts';
import { actorAttackReachForDef, actorAttackReachMetres, actorBodyDimensions } from '../src/core/actorState.ts';
import { type Body, bodyOverlapsBlock } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { spawnActorType, spawnShamblers } from '../src/debug/shamblerSpawning.ts';
import type { Engine } from '../src/presentation/engine.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { createPlayerBody, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const SCALE = makeScale(0.5);
const player = () => createPlayerBody(SCALE, 0, 1, 0);

const footprint = (type: typeof registry.actors extends ReadonlyMap<string, infer T> ? T : never): number => {
  const body = actorBodyDimensions(type, SCALE.blockSize);
  return Math.max(body.halfWidth, body.halfDepth ?? body.halfWidth);
};
const largestType = [...registry.actors.values()].reduce((best, type) =>
  footprint(type) > footprint(best) ? type : best,
);

const testEngine = (isSolid: (x: number, y: number, z: number) => boolean, seed = 2026): Engine =>
  ({
    config: { seed, scale: SCALE },
    registry,
    spawn: { pos: [0, SCALE.blockSize, 0], yaw: 0 },
    groundAt: () => SCALE.blockSize,
    isSolid,
    isOpaque: isSolid,
  }) as unknown as Engine;

const actorsFor = (body: ReturnType<typeof player>, isSolid: (x: number, y: number, z: number) => boolean) =>
  new ActorSystem({
    isSolid,
    isOpaque: isSolid,
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
    player: () => ({
      pos: body.pos,
      body,
      facing: [0, 0, -1],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
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
    const actors = actorsFor(body, solid);

    expect(spawnShamblers(engine, body, actors, 25)).toBe(25);
    const bodies = [body, ...[...actors.store.entries()].map(([, actor]) => actor.body)];
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
    const actors = actorsFor(body, solid);

    expect(spawnShamblers(engine, body, actors, 10)).toBe(10);
    expect(spawnShamblers(engine, body, actors, 10)).toBe(10);
    const bodies = [body, ...[...actors.store.entries()].map(([, actor]) => actor.body)];
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        expect(horizontalOverlap(bodies[i]!, bodies[j]!)).toBe(false);
      }
    }
  });

  it('debug-spawned largest-envelope zombies pursue from beyond their scaled attack reach', () => {
    const body = player();
    const solid = (_x: number, y: number) => y === 0;
    const engine = testEngine(solid, 73);
    const actors = actorsFor(body, solid);

    expect(spawnActorType(engine, body, actors, { typeId: largestType.id, count: 1 })).toBe(1);
    const [id, actor] = [...actors.store.entries()][0]!;
    const initialDistance =
      Math.hypot(body.pos[0] - actor.body.pos[0], body.pos[2] - actor.body.pos[2]) * SCALE.blockSize;
    expect(bodyIsClear(actor.body, solid)).toBe(true);
    expect(initialDistance).toBeGreaterThan(actorAttackReachMetres(actor));
    for (let tick = 0; tick < 20 * 60; tick++) {
      actors.tick(1 / 60);
    }
    const remainingDistance =
      Math.hypot(body.pos[0] - actor.body.pos[0], body.pos[2] - actor.body.pos[2]) * SCALE.blockSize;

    expect(actors.store.get(id)!.agent!.mode).toBe('chase');
    expect(remainingDistance).toBeLessThan(initialDistance);
  });

  it('keeps the realized largest envelope clear when the debug path places it', () => {
    const type = largestType;
    const body = player();
    const floor = (_x: number, y: number) => y === 0;
    const openEngine = testEngine(floor, 73);
    const minRadiusMetres = Math.max(8, actorAttackReachForDef(type) + 1);
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
    const largeBody: Body = { ...smallBody, ...actorBodyDimensions(type, SCALE.blockSize) };
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
    const actors = actorsFor(body, solid);

    expect(spawnActorType(engine, body, actors, { typeId: type.id, count: 1 })).toBe(1);
    expect(bodyIsClear([...actors.store.entries()][0]![1].body, solid)).toBe(true);
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
    const actors = actorsFor(body, crowdedEngine.isSolid);
    expect(spawnShamblers(crowdedEngine, body, actors, 3)).toBe(1);
    expect(actors.store.size).toBe(1);
  });
});
