import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { defaultClock, simSecondsPerHour } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { NEED_RATES, REST, SPAWN_NEEDS, stepNeeds } from '../src/core/needs.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { type SimOptions, Simulation } from '../src/core/sim.ts';
import { World } from '../src/core/world.ts';
import { type PlayerSense, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { RestController, type RestHooks, restKindForFurniture } from '../src/game/rest.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const HOUR = simSecondsPerHour(defaultClock);
const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const PHYSICS = physicsFor(SCALE);
const FLOOR: SolidAt = (_x, y) => y === 0;

/** A Simulation wired to a RestController, the way play.ts wires them: the sim's fatigue rate
 * comes from whatever the controller's action asks for. */
const REST_ANCHOR = 1;
const makeRest = (
  simOptions: Partial<SimOptions> = {},
  hooks: Partial<RestHooks> = {},
): { sim: Simulation; rest: RestController } => {
  let rest: RestController | undefined;
  const sim = new Simulation({ seed: 1, ...simOptions, restRate: () => rest?.action?.rate });
  rest = new RestController(sim, {
    furniture: hooks.furniture ?? ((uid) => (uid === REST_ANCHOR ? { quality: 1, sleepable: true } : undefined)),
    withinReach: hooks.withinReach ?? (() => true),
    notice: hooks.notice ?? (() => undefined),
  });
  return { sim, rest };
};

/** A ZombieSystem with a fixed player sense and a flat floor, for the scenarios below. */
const zombieHooks = (player: PlayerSense, hour = 23) => ({
  isSolid: FLOOR,
  isOpaque: FLOOR,
  blockSize: BLOCK_SIZE,
  physics: PHYSICS,
  jumpSpeed: PLAYER.jump,
  player: () => player,
  hour: () => hour,
  hurtPlayer: () => undefined,
});

describe('restKindForFurniture', () => {
  it('maps restable furniture to rest or sleep and leaves ordinary furniture unchanged', () => {
    const chair = { rest: { quality: 1 } };
    const bed = { rest: { quality: 1, sleep: true as const } };
    const sofa = { rest: { quality: 0.5, sleep: true as const } };
    expect(restKindForFurniture(chair)).toBe('rest');
    expect(restKindForFurniture(bed)).toBe('sleep');
    expect(restKindForFurniture(sofa)).toBe('sleep');
    expect(restKindForFurniture({})).toBeUndefined();
  });
});

describe('stepNeeds with a custom fatigue rate', () => {
  it('recovers fatigue at the given rate, leaving the other needs alone', () => {
    const needs = { ...SPAWN_NEEDS, fatigue: 50 };
    const rates = { ...NEED_RATES, fatigue: -20 };
    stepNeeds(needs, 1, false, rates);
    expect(needs.fatigue).toBeCloseTo(30, 9);
    expect(needs.calories).toBeCloseTo(SPAWN_NEEDS.calories + NEED_RATES.calories, 9);
  });
});

describe('Simulation restRate', () => {
  it('overrides the fatigue rate the needs system uses', () => {
    const sim = new Simulation({ seed: 1, restRate: () => -20 });
    sim.frame(HOUR);
    expect(sim.needs.fatigue).toBeCloseTo(SPAWN_NEEDS.fatigue - 20, 6);
    expect(sim.needs.calories).toBeCloseTo(SPAWN_NEEDS.calories + NEED_RATES.calories, 6);
  });
});

describe('RestController.rateFor', () => {
  it('scales rest and the sleep bonus by the furniture quality', () => {
    const { rest } = makeRest();
    expect(rest.rateFor('rest', 0.5)).toBeCloseTo(REST.rest * 0.5);
    expect(rest.rateFor('sleep', 0.5)).toBeCloseTo(REST.sleep + REST.bedBonus * 0.5);
    expect(rest.rateFor('sleep', 1)).toBeLessThan(rest.rateFor('sleep', 0.5));
  });
});

describe('RestController start/resume/stop', () => {
  it('starts only while the selected furniture is in reach', () => {
    let reachable = false;
    const { rest } = makeRest({}, { withinReach: () => reachable });
    expect(rest.start('rest', REST_ANCHOR)).toBeTruthy();
    expect(rest.action).toBeUndefined();
    reachable = true;
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    expect(rest.action?.furnitureUid).toBe(REST_ANCHOR);
  });

  it('refuses when there is nothing to recover', () => {
    const { sim, rest } = makeRest();
    sim.needs.fatigue = 0;
    expect(rest.start('rest', REST_ANCHOR)).toBe("You're not tired");
    expect(sim.compression.active).toBe(false);
  });

  it('keeps fast-forwarding as an aware shambler closes in, then wakes on a hit', () => {
    const player: PlayerSense = {
      pos: [0, 1, 0],
      facing: [0, 0, -1],
      movement: 'still',
      lit: true,
      lightSeenFrom: 50,
    };
    const zombieSystem = new ZombieSystem(zombieHooks(player, 23));
    const id = zombieSystem.add(SHAMBLER, [70, 1, 0], [-1, 0, 0]);
    zombieSystem.tick(1 / 60, 1 / 60);
    expect(zombieSystem.store.get(id)?.mode).toBe('chase');
    expect(zombieSystem.unsafeReason()).toBeTruthy();
    const messages: string[] = [];
    const { sim, rest } = makeRest(
      { unsafe: () => zombieSystem.unsafeReason() },
      { notice: (message) => messages.push(message) },
    );

    expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    const start = sim.time;
    const {
      body: {
        pos: [startX],
      },
    } = zombieSystem.store.get(id)!;
    for (let i = 1; i <= 30; i++) {
      zombieSystem.tick(0.1, i * 0.1);
      sim.frame(1 / 60);
      expect(sim.compression.active).toBe(true);
      expect(sim.compression.interruption).toBeUndefined();
    }
    expect(sim.time).toBeGreaterThan(start);
    expect(zombieSystem.store.get(id)!.body.pos[0]).toBeLessThan(startX!);

    const emittedInterruption = sim.events.reader();
    sim.hurt(1, 'a shambler');
    const wakeReason = emittedInterruption.read().find((event) => event.kind === 'interrupt')?.reason;
    if (wakeReason === undefined) {
      throw new Error('Damage did not emit a wake interruption');
    }
    sim.frame(1 / 60);
    expect(rest.action).toBeUndefined();
    expect(sim.compression.locksInput).toBe(false);
    expect(sim.compression.interruption).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(wakeReason);
  });

  it('ends on its own once fully rested, back at 1x', () => {
    const messages: string[] = [];
    const { sim, rest } = makeRest({}, { notice: (m) => messages.push(m) });
    sim.needs.fatigue = 5;
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 10_000 && rest.action !== undefined; i++) {
      rest.frame(1 / 60);
    }
    expect(rest.action).toBeUndefined();
    expect(sim.needs.fatigue).toBeCloseTo(0, 2);
    for (let i = 0; i < 60; i++) {
      rest.frame(1 / 60); // let compression ramp back down, as it does after any long action
    }
    expect(sim.compression.c).toBe(1);
    expect(messages).toContain('You feel rested');
  });

  it('returns to 1x when the player stops resting after an interruption', () => {
    const { sim, rest } = makeRest();
    rest.start('rest', REST_ANCHOR);
    for (let i = 0; i < 120; i++) {
      rest.frame(1 / 60);
    }
    sim.hurt(5, 'a debug key');
    rest.frame(1 / 60);
    expect(sim.compression.interruption).toBeDefined();
    rest.stop();
    expect(sim.compression.interruption).toBeUndefined();
    expect(sim.compression.c).toBe(1);
    expect(rest.action).toBeUndefined();
  });

  it('resumes on Continue and keeps the same action', () => {
    const { sim, rest } = makeRest();
    rest.start('rest', REST_ANCHOR);
    for (let i = 0; i < 120; i++) {
      rest.frame(1 / 60);
    }
    sim.hurt(5, 'a debug key');
    rest.frame(1 / 60);
    const before = rest.action;
    expect(rest.resume()).toBeUndefined();
    rest.frame(1 / 60);
    expect(sim.compression.c).toBeGreaterThan(1);
    expect(rest.action).toBe(before);
  });

  it('Continue requires the same furniture anchor to remain in reach', () => {
    const reachable = new Set([REST_ANCHOR]);
    const furniture = new Map([
      [REST_ANCHOR, { quality: 1, sleepable: true }],
      [2, { quality: 1, sleepable: true }],
    ]);
    const { sim, rest } = makeRest(
      {},
      {
        furniture: (uid) => furniture.get(uid),
        withinReach: (uid) => reachable.has(uid),
      },
    );
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    sim.hurt(5, 'a debug key');
    rest.frame(1 / 60);
    reachable.delete(REST_ANCHOR);
    reachable.add(2);
    expect(rest.resume()).toBe('Too far away');
    expect(rest.action?.furnitureUid).toBe(REST_ANCHOR);
    reachable.add(REST_ANCHOR);
    expect(rest.resume()).toBeUndefined();
    expect(rest.action?.furnitureUid).toBe(REST_ANCHOR);
  });
});

describe('RestController.toggle (manual stop)', () => {
  it('starts the action when nothing is running', () => {
    const { rest } = makeRest();
    expect(rest.toggle('rest', REST_ANCHOR)).toBeUndefined();
    expect(rest.action?.kind).toBe('rest');
    expect(rest.canStop).toBe(true);
  });

  it('ramps compression down after stopping rest without resetting fatigue', () => {
    const { sim, rest } = makeRest();
    const fatigueBeforeRest = sim.needs.fatigue;
    expect(rest.toggle('rest', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 20 && sim.needs.fatigue === fatigueBeforeRest; i++) {
      rest.frame(0.5);
    }
    expect(sim.needs.fatigue).toBeLessThan(fatigueBeforeRest);
    expect(sim.compression.c).toBeGreaterThan(1);
    const fatigueAtStop = sim.needs.fatigue;
    expect(rest.toggle('rest', REST_ANCHOR)).toBeUndefined();
    expect(rest.action).toBeUndefined();
    expect(sim.compression.active).toBe(false);
    expect(sim.compression.c).toBeGreaterThan(1);
    expect(sim.needs.fatigue).toBe(fatigueAtStop);
    for (let i = 0; i < 60; i++) {
      rest.frame(1 / 60);
    }
    expect(sim.compression.c).toBe(1);
  });

  it('keeps sleep running on a second press but permits a system stop', () => {
    const { sim, rest } = makeRest();
    expect(rest.toggle('sleep', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 120; i++) {
      rest.frame(1 / 60);
    }
    expect(sim.compression.c).toBeGreaterThan(1);
    const fatigueAtStop = sim.needs.fatigue;
    expect(rest.toggle('sleep', REST_ANCHOR)).toBeUndefined();
    expect(rest.action?.kind).toBe('sleep');
    expect(rest.canStop).toBe(false);
    expect(sim.compression.active).toBe(true);
    expect(sim.needs.fatigue).toBe(fatigueAtStop);
    rest.stop();
    expect(rest.action).toBeUndefined();
    expect(sim.compression.active).toBe(false);
  });
});

describe('Session long-action input lock', () => {
  it.each(['rest', 'sleep'] as const)('ignores movement and action input during %s', (kind) => {
    const entities = new BlockEntities(registry);
    const restable = [...registry.furniture.values()].find((def) => def.rest && (kind === 'rest' || def.rest.sleep));
    if (!restable) {
      throw new Error(`${kind} input fixture has no matching furniture`);
    }
    const anchor = entities.add({ type: restable.id, pos: [2, 1, 0], size: restable.size, facing: 'n' });
    if (!anchor) {
      throw new Error(`Could not place the ${kind} input fixture`);
    }
    let actions = 0;
    const intent = { ...IDLE, forward: 1, useDominant: true };
    const world = new World();
    const session = createSession({
      registry,
      world,
      isSolid: (x, y, z) => y === 0 || entities.isSolid(x, y, z),
      isOpaque: (x, y, z) => y === 0 || entities.isSolid(x, y, z),
      entities,
      scale: SCALE,
      seed: 1,
      start: defaultClock.start,
      spawn: [0, 1, 0],
      ready: () => true,
      controls: {
        active: () => true,
        intent: () => intent,
        useDominant: () => {
          actions += 1;
        },
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => {
        throw new Error(`Unexpected reading in ${kind} input fixture`);
      },
    });

    expect(session.rest.start(kind, anchor.uid)).toBeUndefined();
    const { sim } = session;
    const { time } = sim;
    const position = [...session.body.pos];
    session.frame(1 / 60);
    expect(session.rest.action?.kind).toBe(kind);
    expect(sim.compression.active).toBe(true);
    expect(sim.time).toBeGreaterThan(time);
    expect([session.body.pos[0], session.body.pos[2]]).toEqual([position[0], position[2]]);
    expect(actions).toBe(0);
  });

  it('wakes after damage with movement unlocked and no pending sleep action', () => {
    const entities = new BlockEntities(registry);
    const restable = [...registry.furniture.values()].find((def) => def.rest?.sleep);
    if (!restable) {
      throw new Error('Sleep input fixture has no matching furniture');
    }
    const anchor = entities.add({ type: restable.id, pos: [2, 1, 0], size: restable.size, facing: 'n' });
    if (!anchor) {
      throw new Error('Could not place the sleep input fixture');
    }
    const intent = { ...IDLE, forward: 1 };
    const session = createSession({
      registry,
      world: new World(),
      isSolid: (x, y, z) => y === 0 || entities.isSolid(x, y, z),
      isOpaque: (x, y, z) => y === 0 || entities.isSolid(x, y, z),
      entities,
      scale: SCALE,
      seed: 1,
      start: defaultClock.start,
      spawn: [0, 1, 0],
      ready: () => true,
      controls: {
        active: () => true,
        intent: () => intent,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => {
        throw new Error('Unexpected reading in sleep wake fixture');
      },
    });

    expect(session.rest.start('sleep', anchor.uid)).toBeUndefined();
    session.sim.hurt(1, 'a shambler');
    session.frame(1 / 60);
    expect(session.rest.action).toBeUndefined();
    expect(session.sim.compression.locksInput).toBe(false);
    const position = [...session.body.pos];
    for (let i = 0; i < 10; i++) {
      session.frame(1 / 60);
    }
    expect([session.body.pos[0], session.body.pos[2]]).not.toEqual([position[0], position[2]]);
  });
});

describe('long-action interruptions', () => {
  it('stops resting at most one step after you take damage', () => {
    const { sim, rest } = makeRest();
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 120; i++) {
      rest.frame(1 / 60);
    }
    expect(sim.compression.c).toBeGreaterThan(1);
    sim.hurt(10, 'a fall');
    rest.frame(1 / 60);
    expect(sim.compression.interruption).toBe("You're hurt");
    expect(sim.compression.c).toBe(1);
  });

  it('wakes when a need turns critical', () => {
    const messages: string[] = [];
    const { sim, rest } = makeRest({}, { notice: (message) => messages.push(message) });
    sim.needs.hydration = 10.05;
    expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    const emittedInterruptions = sim.events.reader();
    for (let i = 0; i < 20_000 && rest.action !== undefined; i++) {
      rest.frame(1 / 60);
    }
    const wakeReason = emittedInterruptions.read().find((event) => event.kind === 'interrupt')?.reason;
    if (wakeReason === undefined) {
      throw new Error('Critical need did not emit a wake interruption');
    }
    expect(rest.action).toBeUndefined();
    expect(sim.compression.locksInput).toBe(false);
    expect(sim.compression.interruption).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(wakeReason);
  });
});
