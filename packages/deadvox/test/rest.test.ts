import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Body } from '../src/core/body.ts';
import { hourOfDay, SECONDS_PER_HOUR, simSecondsPerHour, simToGameHours } from '../src/core/clock.ts';
import { awakeRates, type Needs, type RecoveryState, stepNeeds } from '../src/core/needs.ts';
import { makeScale } from '../src/core/scale.ts';
import type { BodyTuningDef } from '../src/core/schema.ts';
import { realSeconds, simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { advanceLiveFrame } from '../src/game/frameDriver.ts';
import { RestController, type RestHooks, restKindForFurniture } from '../src/game/rest.ts';
import { createSession, HANDLING_RATE, IDLE } from '../src/game/session.ts';
import { baseRegistry, baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const HOUR = simSecondsPerHour(BASE_CLOCK);
const BASE = 'src/content/base';
const BASE_SOURCES = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown }));
const registry = baseRegistry();
const SCALE = makeScale(0.5);
const SPAWN_NEEDS: Needs = new Body(BODY_TUNING_FIXTURE).spawnNeeds;

/** A Simulation wired to a RestController, the way the session wires them. */
const REST_ANCHOR = 1;
const tickReal = (sim: Simulation, elapsed: number): void => {
  advanceLiveFrame(sim, realSeconds(elapsed));
};

const makeRest = (
  hooks: Partial<RestHooks> = {},
  sim = new Simulation({ seed: 1 }),
): { sim: Simulation; rest: RestController } => {
  const rest = new RestController(sim, {
    furniture: hooks.furniture ?? ((uid) => (uid === REST_ANCHOR ? { quality: 1, sleepable: true } : undefined)),
    withinReach: hooks.withinReach ?? (() => true),
    notice: hooks.notice ?? (() => undefined),
    hasAlarm: hooks.hasAlarm ?? (() => false),
  });
  return { sim, rest };
};

const finishSleepOnset = (sim: Simulation, rest: RestController): void => {
  for (let i = 0; i < 2000 && rest.action?.sleepOnset !== undefined; i++) {
    sim.frame(simSeconds(1));
  }
  if (rest.action?.sleepOnset !== undefined) {
    throw new Error('Sleep onset never ended');
  }
};

/** Total Game hours from starting sleep in a quality-1 bed until it ends. */
const sleepGameHours = (sim: Simulation, rest: RestController, fatigue: number): { total: number; onset: number } => {
  sim.needs.calories = 100;
  sim.needs.hydration = 100;
  sim.needs.fatigue = fatigue;
  const start = sim.time;
  const refusal = rest.start('sleep', REST_ANCHOR);
  if (refusal) {
    throw new Error(`Sleep fixture refused: ${refusal}`);
  }
  const onset = (rest.action?.sleepOnset?.durationGameSeconds ?? 0) / 3600;
  for (let i = 0; i < 20_000 && rest.action !== undefined; i++) {
    tickReal(sim, 1 / 60);
  }
  if (rest.action) {
    throw new Error('Sleep fixture never ended');
  }
  return { total: simToGameHours(sim.clock, sim.time - start), onset };
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
    const body = new Body(BODY_TUNING_FIXTURE);
    const awake = awakeRates(body);
    const rates = { ...awake, fatigue: -20 };
    stepNeeds(needs, body, 1, { rates });
    expect(needs.fatigue).toBeCloseTo(30, 9);
    expect(needs.calories).toBeCloseTo(SPAWN_NEEDS.calories + awake.calories, 9);
  });
});

describe('the healing gate', () => {
  /** Health a body at 50 regains in half a game hour with these needs held still, under this body content. */
  const healed = (tuning: Partial<BodyTuningDef>, held: Partial<Needs>, state: RecoveryState = 'awake'): number => {
    const body = new Body({ ...BODY_TUNING_FIXTURE, ...tuning });
    body.damageHealth(50);
    const needs = { ...SPAWN_NEEDS, calories: 100, hydration: 100, ...held };
    stepNeeds(needs, body, 0.5, { rates: { calories: 0, hydration: 0, fatigue: 0 }, state });
    return body.health - 50;
  };
  const awakeOnly = { healthRecoveryFatigueCeiling: { awake: 80 } };

  it('stops healing awake above the awake ceiling', () => {
    expect(healed(awakeOnly, { fatigue: 150 })).toBe(0);
    expect(healed(awakeOnly, { fatigue: 50 })).toBeGreaterThan(0);
  });

  it('gates sleep too when content sets an asleep ceiling', () => {
    expect(healed({ healthRecoveryFatigueCeiling: { awake: 80, asleep: 100 } }, { fatigue: 150 }, 'asleep')).toBe(0);
    expect(healed(awakeOnly, { fatigue: 150 }, 'asleep')).toBeGreaterThan(0);
  });

  it('stops healing below each need its content floor', () => {
    const floor = { healthRecoveryNeedsFloor: { calories: 50, hydration: 30 } };
    expect(healed(floor, { calories: 40 })).toBe(0);
    expect(healed(floor, { hydration: 20 })).toBe(0);
    expect(healed(floor, { calories: 50, hydration: 30 })).toBeGreaterThan(0);
  });

  it('starts healing the moment sleep brings fatigue under an asleep ceiling, mid-step', () => {
    const body = new Body({ ...BODY_TUNING_FIXTURE, healthRecoveryFatigueCeiling: { awake: 80, asleep: 100 } });
    body.damageHealth(50);
    const needs = { ...SPAWN_NEEDS, calories: 100, hydration: 100, fatigue: 150 };
    stepNeeds(needs, body, 10, { rates: { calories: 0, hydration: 0, fatigue: -10 }, state: 'asleep' });
    expect(body.health - 50).toBeCloseTo(5 * body.healthRecoveryPerGameHour, 6);
  });

  it('wires sleeping recovery above the awake fatigue ceiling without healing the same awake state', () => {
    const sleeping = makeRest();
    const awake = makeRest();
    for (const { sim } of [sleeping, awake]) {
      sim.needs.calories = 100;
      sim.needs.hydration = 100;
      sim.needs.fatigue = 150;
      sim.body.damageHealth(50);
    }
    expect(sleeping.rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    finishSleepOnset(sleeping.sim, sleeping.rest);
    expect(sleeping.sim.actions.asleep).toBe(true);
    const healthBefore = sleeping.sim.body.health;
    const start = sleeping.sim.time;
    sleeping.sim.frame(simSeconds(HOUR / 2));
    const elapsed = sleeping.sim.time - start;
    awake.sim.frame(simSeconds(elapsed));
    const ceiling = sleeping.sim.body.tuning.healthRecoveryFatigueCeiling.awake!;
    expect(sleeping.sim.needs.fatigue).toBeGreaterThan(ceiling);
    expect(awake.sim.needs.fatigue).toBeGreaterThan(ceiling);
    expect(sleeping.sim.body.health - healthBefore).toBeCloseTo(
      simToGameHours(sleeping.sim.clock, elapsed) *
        sleeping.sim.body.healthRecoveryPerGameHour *
        sleeping.sim.body.sleepRecoveryFactor,
      6,
    );
    expect(awake.sim.body.health).toBe(50);
  });
});

describe('sleep onset', () => {
  it('shortens with fatigue and stores the content interval in Game seconds', () => {
    const durationAt = (fatigue: number): { duration: number; min: number; max: number } => {
      const { sim, rest } = makeRest();
      sim.needs.fatigue = fatigue;
      expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
      const onset = rest.action?.sleepOnset;
      if (!onset) {
        throw new Error('Sleep did not enter its onset phase');
      }
      const tuning = sim.body.tuning.sleepOnset;
      return {
        duration: onset.durationGameSeconds,
        min: tuning.minGameMinutes,
        max: tuning.maxGameMinutes,
      };
    };
    const rested = durationAt(1);
    const exhausted = durationAt(200);
    expect(rested.duration).toBeGreaterThanOrEqual(rested.min);
    expect(rested.duration).toBeLessThanOrEqual(rested.max);
    expect(exhausted.duration).toBe(exhausted.min);
    expect(exhausted.duration).toBeLessThan(rested.duration);
  });

  it('allows stopping before sleep, but the same input does not wake a sleeper', () => {
    const { sim, rest } = makeRest();
    sim.needs.fatigue = 50;
    expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    expect(rest.canStop).toBe(true);
    expect(sim.actions.asleep).toBe(false);
    sim.frame(simSeconds(1));
    expect(rest.action?.sleepOnset?.elapsedGameSeconds).toBeGreaterThan(0);

    expect(rest.toggle('sleep', REST_ANCHOR)).toBeUndefined();
    expect(rest.action).toBeUndefined();
    expect(sim.actions.asleep).toBe(false);

    expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    finishSleepOnset(sim, rest);
    expect(sim.actions.asleep).toBe(true);
    expect(rest.canStop).toBe(false);
    const sleeper = rest.action;
    expect(rest.toggle('sleep', REST_ANCHOR)).toBeUndefined();
    expect(rest.action).toBe(sleeper);
    expect(sim.actions.asleep).toBe(true);
  });
});

describe('Body.fatigueRecoveryRate', () => {
  it('scales rest by quality, and sleep from the rough share at quality 0 up to a normal sleep at 1', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    const { restFatigueRecoveryPerGameHour, sleepFatigueRecoveryPerGameHour, roughSleepShare } = BODY_TUNING_FIXTURE;
    const perHour = (perSecond: number): number => perSecond * SECONDS_PER_HOUR;
    expect(body.fatigueRecoveryRate('rest', 0.5)).toBeCloseTo(-perHour(restFatigueRecoveryPerGameHour) * 0.5);
    expect(body.fatigueRecoveryRate('sleep', 1)).toBeCloseTo(-perHour(sleepFatigueRecoveryPerGameHour));
    expect(body.fatigueRecoveryRate('sleep', 0)).toBeCloseTo(
      -perHour(sleepFatigueRecoveryPerGameHour) * roughSleepShare,
    );
  });
});

describe('sleep length and sleep debt', () => {
  it('clears 100 fatigue in a normal bed at the content sleep rate', () => {
    const { sim, rest } = makeRest({}, new Simulation({ seed: 1, bodyTuning: registry.body.get('player')! }));
    const { total, onset } = sleepGameHours(sim, rest, 100);
    const fatigueAtSleep = 100 + onset * sim.body.fatigueRisePerGameHour;
    const night = fatigueAtSleep / -sim.body.fatigueRecoveryRate('sleep', 1);
    // Sleep ends within a couple of 30 Sim s steps at the cap (4 game minutes each) of the content's own night.
    expect(Math.abs(total - onset - night)).toBeLessThan(0.15);
  });

  it('lets fatigue run past 100 while awake, unclamped', () => {
    const sim = new Simulation({ seed: 1 });
    sim.needs.fatigue = 99;
    sim.frame(HOUR);
    expect(sim.needs.fatigue).toBeCloseTo(99 + sim.body.fatigueRisePerGameHour, 6);
  });

  it('recovers health and blood asleep at the sleep factor times the awake rate', () => {
    // Waiting and sleeping share the fixture's cap, so both runs step through the same Sim times.
    const recovered = (sleeping: boolean) => {
      const { sim, rest } = makeRest();
      sim.needs.calories = 100;
      sim.needs.hydration = 100;
      sim.needs.fatigue = 50;
      sim.body.damageHealth(50);
      // Blood lost to a wound that has stopped bleeding, as a save after treatment holds it.
      sim.body.restoreState({ ...sim.body.snapshotState(), blood: 20 });
      expect(sleeping ? rest.start('sleep', REST_ANCHOR) : sim.actions.startWait()).toBeUndefined();
      if (sleeping) {
        finishSleepOnset(sim, rest);
        expect(sim.actions.asleep).toBe(true);
      }
      const { health, blood } = sim.body;
      const start = sim.time;
      for (let i = 0; i < 120; i++) {
        tickReal(sim, 1 / 60);
      }
      expect(sim.body.blood).toBeLessThan(100);
      return {
        health: sim.body.health - health,
        blood: sim.body.blood - blood,
        hours: simToGameHours(sim.clock, sim.time - start),
        rate: sim.body.healthRecoveryPerGameHour,
        factor: sim.body.sleepRecoveryFactor,
      };
    };
    const awake = recovered(false);
    const asleep = recovered(true);
    expect(asleep.hours).toBeCloseTo(awake.hours, 12);
    expect(awake.health / awake.hours).toBeCloseTo(awake.rate, 0);
    expect(asleep.health / awake.health).toBeCloseTo(asleep.factor, 6);
    expect(awake.blood).toBeGreaterThan(0);
    expect(asleep.blood / awake.blood).toBeCloseTo(asleep.factor, 6);
  });
});

describe('waking with an alarm', () => {
  it('ends awake when the selected alarm hour arrives during sleep onset', () => {
    const sim = new Simulation({
      seed: 1,
      clock: { ...BASE_CLOCK, start: 11 * SECONDS_PER_HOUR - 60 },
    });
    const { rest } = makeRest({ hasAlarm: () => true }, sim);
    sim.needs.fatigue = 0;
    rest.wakeGameHour = 11;

    expect(rest.start('sleep', REST_ANCHOR)).toBeUndefined();
    const onset = rest.action?.sleepOnset;
    if (!onset) {
      throw new Error('Sleep did not enter its onset phase');
    }
    const wakeAt = rest.action?.wakeAt;
    if (wakeAt === undefined) {
      throw new Error('Sleep fixture has no selected wake time');
    }
    expect(onset.durationGameSeconds / sim.clock.ratio).toBeGreaterThan(wakeAt - sim.time);

    const deadlineTick = wakeAt + simSeconds(1);
    for (let frame = 0; frame < 10 && sim.time < deadlineTick; frame++) {
      expect(sim.frame(simSeconds(30), deadlineTick)).toBeGreaterThan(0);
    }

    expect(sim.time).toBe(deadlineTick);
    expect(rest.action).toBeUndefined();
    expect(sim.actions.asleep).toBe(false);
  });

  it('sleeps until rested without an alarm, whatever wake hour is set', () => {
    const { sim, rest } = makeRest();
    rest.wakeGameHour = (Math.floor(hourOfDay(sim.calendar)) + 12) % 24;
    expect(rest.canSetWakeTime).toBe(false);
    const { total, onset } = sleepGameHours(sim, rest, 20);
    const fatigueAtSleep = 20 + onset * sim.body.fatigueRisePerGameHour;
    const sleepHours = fatigueAtSleep / -sim.body.fatigueRecoveryRate('sleep', 1);
    expect(Math.abs(total - onset - sleepHours)).toBeLessThan(0.15);
    expect(sim.needs.fatigue).toBeLessThan(0.1);
  });

  it('sleeps on to the alarm hour with fatigue held at 0 once rested', () => {
    const { sim, rest } = makeRest({ hasAlarm: () => true });
    const wakeGameHour = (Math.floor(hourOfDay(sim.calendar)) + 6) % 24;
    rest.wakeGameHour = wakeGameHour;
    expect(rest.canSetWakeTime).toBe(true);
    const restedAfter = 10 / -sim.body.fatigueRecoveryRate('sleep', 1);
    const { total } = sleepGameHours(sim, rest, 10);
    expect(total).toBeGreaterThan(restedAfter + 4);
    expect(sim.needs.fatigue).toBeLessThan(0.1);
    // Wakes within one long-action step (30 Sim s, 4 game minutes) past the hour.
    const late = hourOfDay(sim.calendar) - wakeGameHour;
    expect(late).toBeGreaterThanOrEqual(0);
    expect(late).toBeLessThan(5 / 60);
  });

  it('offers a wake time with a carried alarm item, and not with the broken alarm clock', () => {
    // A working copy of the broken clock: the same item, with the alarm capability.
    const items = BASE_SOURCES.flatMap(({ data }) => (data as { items?: { id: string }[] }).items ?? []);
    const brokenClock = items.find((item) => item.id === 'broken_clock')!;
    const fixtureRegistry = baseRegistryWith([
      {
        source: 'alarm-fixture.json',
        data: { items: [{ ...brokenClock, id: 'alarm_fixture', name: 'Fixture alarm', alarm: true }] },
      },
    ]);
    const entities = new BlockEntities(fixtureRegistry);
    const session = createSession({
      registry: fixtureRegistry,
      world: new World(),
      isSolid: (_x, y) => y === 0,
      isOpaque: (_x, y) => y === 0,
      entities,
      scale: SCALE,
      seed: 1,
      start: BASE_CLOCK.start,
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
        throw new Error('Unexpected reading in alarm fixture');
      },
    });
    const { inventory } = session;
    for (const side of ['right', 'left'] as const) {
      const held = inventory.hands[side];
      if (held) {
        expect(inventory.move(held, { kind: 'pile', pos: [0, 1, 0] }).ok).toBe(true);
      }
    }
    expect(inventory.add(inventory.create('broken_clock'), { kind: 'hand', side: 'right' })).toBe(true);
    expect(session.rest.canSetWakeTime).toBe(false);
    expect(inventory.add(inventory.create('alarm_fixture'), { kind: 'hand', side: 'left' })).toBe(true);
    expect(session.rest.canSetWakeTime).toBe(true);
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
    expect(rest.start('rest', REST_ANCHOR)).toBeTruthy();
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
    expect(messages.length).toBeGreaterThan(0);
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
    expect(rest.resume()).toBeTruthy();
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
    finishSleepOnset(sim, rest);
    expect(sim.actions.asleep).toBe(true);
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
      start: BASE_CLOCK.start,
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
      start: BASE_CLOCK.start,
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
      start: BASE_CLOCK.start,
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
      start: BASE_CLOCK.start,
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
    expect(sim.compression.interruption).toBeTruthy();
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
