import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Body } from '../src/core/body.ts';
import { defaultClock, simSecondsPerHour } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { NEED_RATES, REST, SPAWN_NEEDS, stepNeeds } from '../src/core/needs.ts';
import { makeScale } from '../src/core/scale.ts';
import { realSeconds, simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { advanceLiveFrame } from '../src/game/frameDriver.ts';
import { RestController, type RestHooks, restKindForFurniture } from '../src/game/rest.ts';
import { createSession, HANDLING_RATE, IDLE } from '../src/game/session.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const HOUR = simSecondsPerHour(defaultClock);
const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);
const SCALE = makeScale(0.5);

/** A Simulation wired to a RestController, the way play.ts wires them: the sim's fatigue rate
 * comes from whatever the controller's action asks for. */
const REST_ANCHOR = 1;
const tickReal = (sim: Simulation, elapsed: number): void => {
  advanceLiveFrame(sim, realSeconds(elapsed));
};

const makeRest = (hooks: Partial<RestHooks> = {}): { sim: Simulation; rest: RestController } => {
  let rest: RestController | undefined;
  const sim = new Simulation({ seed: 1, restRate: () => rest?.action?.rate });
  rest = new RestController(sim, {
    furniture: hooks.furniture ?? ((uid) => (uid === REST_ANCHOR ? { quality: 1, sleepable: true } : undefined)),
    withinReach: hooks.withinReach ?? (() => true),
    notice: hooks.notice ?? (() => undefined),
  });
  return { sim, rest };
};

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
    stepNeeds(needs, new Body(BODY_TUNING_FIXTURE), 1, { rates });
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
    const { rest } = makeRest({ withinReach: () => reachable });
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

  it('ends on its own once fully rested, back at 1x', () => {
    const messages: string[] = [];
    const { sim, rest } = makeRest({ notice: (m) => messages.push(m) });
    sim.needs.fatigue = 5;
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 10_000 && rest.action !== undefined; i++) {
      tickReal(sim, 1 / 60);
    }
    expect(rest.action).toBeUndefined();
    expect(sim.needs.fatigue).toBeCloseTo(0, 2);
    for (let i = 0; i < 60; i++) {
      tickReal(sim, 1 / 60); // let compression ramp back down, as it does after any long action
    }
    expect(sim.compression.c).toBe(1);
    expect(messages).toContain('You feel rested');
  });

  it('returns to 1x when the player stops resting after an interruption', () => {
    const { sim, rest } = makeRest();
    rest.start('rest', REST_ANCHOR);
    for (let i = 0; i < 120; i++) {
      tickReal(sim, 1 / 60);
    }
    sim.hurt(5, 'a debug key');
    tickReal(sim, 1 / 60);
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
      tickReal(sim, 1 / 60);
    }
    sim.hurt(5, 'a debug key');
    tickReal(sim, 1 / 60);
    const before = rest.action;
    expect(rest.resume()).toBeUndefined();
    tickReal(sim, 1 / 60);
    expect(sim.compression.c).toBeGreaterThan(1);
    expect(rest.action).toBe(before);
  });

  it('Continue requires the same furniture anchor to remain in reach', () => {
    const reachable = new Set([REST_ANCHOR]);
    const furniture = new Map([
      [REST_ANCHOR, { quality: 1, sleepable: true }],
      [2, { quality: 1, sleepable: true }],
    ]);
    const { sim, rest } = makeRest({
      furniture: (uid) => furniture.get(uid),
      withinReach: (uid) => reachable.has(uid),
    });
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    sim.hurt(5, 'a debug key');
    tickReal(sim, 1 / 60);
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
      tickReal(sim, 0.5);
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
      tickReal(sim, 1 / 60);
    }
    expect(sim.compression.c).toBe(1);
  });

  it('keeps sleep running on a second press but permits a system stop', () => {
    const { sim, rest } = makeRest();
    expect(rest.toggle('sleep', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 120; i++) {
      tickReal(sim, 1 / 60);
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
    session.frame(simSeconds(1 / 60));
    expect(session.rest.action?.kind).toBe(kind);
    expect(sim.compression.active).toBe(true);
    expect(sim.time).toBeGreaterThan(time);
    expect([session.body.pos[0], session.body.pos[2]]).toEqual([position[0], position[2]]);
    expect(actions).toBe(0);
  });

  it('pauses queued handling until a knockout ends', () => {
    const entities = new BlockEntities(registry);
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
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => {
        throw new Error('Unexpected reading in knockout handling fixture');
      },
    });
    let completed = false;
    session.queue.registerAction('test.knockout-handling', () => {
      completed = true;
    });
    const job = session.queue.enqueueAction('test.knockout-handling', 'Fixture action', 0.01);
    session.sim.body.impact(0, 'torso', { shockDamage: session.sim.body.shock });

    const maxFrames = Math.ceil(session.sim.body.tuning.knockoutSimSeconds * 60) + 2;
    for (let frame = 0; frame < maxFrames && session.sim.body.unconscious; frame += 1) {
      session.frame(simSeconds(1 / 60));
    }

    expect(session.sim.body.unconscious).toBe(false);
    expect(completed).toBe(false);
    const handlingFrames = Math.ceil((job.duration + 2 / HANDLING_RATE) * 60);
    for (let frame = 0; frame < handlingFrames && !completed; frame += 1) {
      session.frame(simSeconds(1 / 60));
    }
    expect(completed).toBe(true);
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
    session.frame(simSeconds(1 / 60));
    expect(session.rest.action).toBeUndefined();
    expect(session.sim.compression.locksInput).toBe(false);
    const position = [...session.body.pos];
    for (let i = 0; i < 10; i++) {
      session.frame(simSeconds(1 / 60));
    }
    expect([session.body.pos[0], session.body.pos[2]]).not.toEqual([position[0], position[2]]);
  });
});

describe('long-action interruptions', () => {
  it('sleeps on at the cap while a shambler closes in, and wakes at its first hit having taken only that hit', () => {
    const entities = new BlockEntities(registry);
    const bed = [...registry.furniture.values()].find((def) => def.rest?.sleep);
    if (!bed) {
      throw new Error('Sleep fixture has no bed');
    }
    const anchor = entities.add({ type: bed.id, pos: [2, 1, 0], size: bed.size, facing: 'n' });
    if (!anchor) {
      throw new Error('Could not place the sleep fixture bed');
    }
    const session = createSession({
      registry,
      world: new World(),
      isSolid: (x, y, z) => y === 0 || entities.isSolid(x, y, z),
      isOpaque: (x, y, z) => y === 0 || entities.isSolid(x, y, z),
      entities,
      scale: SCALE,
      seed: 1,
      // Daylight, so the shambler sees the sleeper.
      start: defaultClock.start,
      spawn: [0, 1, 0],
      ready: () => true,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => {
        throw new Error('Unexpected reading in sleep fixture');
      },
    });
    const { sim } = session;
    const frame = (): void => {
      advanceLiveFrame(sim, realSeconds(1 / 60), undefined, (dt, until) => session.frame(dt, until));
    };
    sim.needs.fatigue = 80;
    expect(session.rest.start('sleep', anchor.uid)).toBeUndefined();
    for (let i = 0; i < 600 && sim.compression.c < sim.compression.limits.cap; i++) {
      frame();
    }
    expect(sim.compression.c).toBe(registry.compression.get('player')!.caps.sleep);

    const { health } = sim.body;
    const events = sim.events.reader();
    const id = session.zombies.add(registry.zombies.get('shambler')!, [60, 1, 0], [-1, 0, 0]);
    let chasedAtCap = false;
    for (let i = 0; i < 600 && session.rest.action; i++) {
      frame();
      chasedAtCap ||=
        session.zombieStore.get(id)!.mode === 'chase' &&
        sim.compression.active &&
        sim.compression.c === sim.compression.limits.cap;
    }
    const hits = events.read().filter((event) => event.kind === 'damage');

    expect(chasedAtCap).toBe(true);
    expect(session.rest.action).toBeUndefined();
    expect(sim.compression.c).toBe(1);
    expect(hits).toHaveLength(1);
    expect(health - sim.body.health).toBeCloseTo(hits[0]!.amount, 9);
  });

  it('stops resting at most one step after you take damage', () => {
    const { sim, rest } = makeRest();
    expect(rest.start('rest', REST_ANCHOR)).toBeUndefined();
    for (let i = 0; i < 120; i++) {
      tickReal(sim, 1 / 60);
    }
    expect(sim.compression.c).toBeGreaterThan(1);
    sim.hurt(10, 'a fall');
    tickReal(sim, 1 / 60);
    expect(sim.compression.interruption).toBe("You're hurt");
    expect(sim.compression.c).toBe(1);
  });

  it('wakes when a need turns critical', () => {
    const messages: string[] = [];
    const { sim, rest } = makeRest({ notice: (message) => messages.push(message) });
    sim.needs.hydration = 10.05;
    expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    const emittedInterruptions = sim.events.reader();
    for (let i = 0; i < 20_000 && rest.action !== undefined; i++) {
      tickReal(sim, 1 / 60);
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
