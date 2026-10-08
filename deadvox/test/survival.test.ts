import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Body } from '../src/core/body.ts';
import { defaultClock, SECONDS_PER_HOUR, simSecondsPerHour } from '../src/core/clock.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { freshnessWord, isRotten, spoilage } from '../src/core/food.ts';
import { Inventory, type Target } from '../src/core/inventory.ts';
import { chargeOf, drainLight, swapBattery, toggleLight } from '../src/core/lights.ts';
import { canSprint, consume, type Needs, SPAWN_NEEDS, STAMINA, stepNeeds, stepStamina } from '../src/core/needs.ts';
import { gameHours, gameSeconds } from '../src/core/time.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const HOUR = simSecondsPerHour(defaultClock); // 450 simulation seconds
const base = (file: string): ContentSource => {
  const source = `src/content/base/${file}`;
  const data = JSON.parse(readFileSync(source, 'utf8'));
  if (file === 'items-tools.json') {
    data.items = data.items.filter((item: { id: string }) => !['torch', 'candle'].includes(item.id));
  }
  return { source, data };
};
const { registry } = buildRegistry(
  [
    'items-food.json',
    'items-other.json',
    'items-tools.json',
    'items-wearables.json',
    'items-ammunition.json',
    'items-attachments.json',
    'models-items.json',
    'models-melee.json',
    'models-firearms.json',
    'models-attachments.json',
  ].map(base),
);

/** Steps needs every simulation second, as the needs system does at 1×. */
const bodyAtHealth = (health: number): Body => {
  const body = new Body(BODY_TUNING_FIXTURE);
  body.damageHealth(100 - health);
  return body;
};
const tickLive = (needs: Needs, body: Body, hours: number): void => {
  const step = 1 / HOUR;
  for (let t = 0; t < hours - 1e-9; t += step) {
    stepNeeds(needs, body, Math.min(step, hours - t));
  }
};

describe('need rates', () => {
  it('run at their rates per game hour', () => {
    const sim = new Simulation({ seed: 1 });
    for (let i = 0; i < HOUR; i++) {
      sim.frame(1);
    }
    expect(sim.needs.calories).toBeLessThan(SPAWN_NEEDS.calories);
    expect(sim.needs.hydration).toBeLessThan(SPAWN_NEEDS.hydration);
    expect(sim.needs.fatigue).toBeGreaterThan(SPAWN_NEEDS.fatigue);
    expect(sim.body.health).toBe(100);
  });

  it('bring health back while needs are met, and take it while starving or parched', () => {
    const fed: Needs = {
      calories: 80,
      hydration: 80,
      fatigue: 10,
      stamina: 100,
      staminaRegenDelayRemainingSimSeconds: 0,
    };
    const fedBody = bodyAtHealth(50);
    stepNeeds(fed, fedBody, 5);
    expect(fedBody.health).toBeGreaterThan(50);

    const starving: Needs = {
      calories: 0,
      hydration: 80,
      fatigue: 10,
      stamina: 100,
      staminaRegenDelayRemainingSimSeconds: 0,
    };
    const starvingBody = bodyAtHealth(50);
    stepNeeds(starving, starvingBody, 5);
    expect(starvingBody.health).toBeLessThan(50);

    const both: Needs = {
      calories: 0,
      hydration: 0,
      fatigue: 10,
      stamina: 100,
      staminaRegenDelayRemainingSimSeconds: 0,
    };
    const bothBody = bodyAtHealth(50);
    stepNeeds(both, bothBody, 2);
    expect(bothBody.health).toBeLessThan(starvingBody.health);
  });
});

describe('catch-up', () => {
  it('lands where ticking every second does, across every threshold', () => {
    const caught = { ...SPAWN_NEEDS };
    const live = { ...SPAWN_NEEDS };
    const caughtBody = new Body(BODY_TUNING_FIXTURE);
    const liveBody = new Body(BODY_TUNING_FIXTURE);
    stepNeeds(caught, caughtBody, 16);
    tickLive(live, liveBody, 16);
    for (const need of ['calories', 'hydration', 'fatigue'] as const) {
      expect(caught[need]).toBeCloseTo(live[need], 6);
    }
    expect(caughtBody.health).toBeCloseTo(liveBody.health, 6);
    expect(caughtBody.health).toBeLessThan(100);
  });

  it('starts and stops health coming back at the right moment', () => {
    const start: Needs = {
      calories: 31,
      hydration: 90,
      fatigue: 0,
      stamina: 100,
      staminaRegenDelayRemainingSimSeconds: 0,
    };
    const caught = { ...start };
    const live = { ...start };
    const caughtBody = bodyAtHealth(40);
    const liveBody = bodyAtHealth(40);
    stepNeeds(caught, caughtBody, 6);
    tickLive(live, liveBody, 6);
    expect(caughtBody.health).toBeGreaterThan(40);
    expect(liveBody.health).toBeCloseTo(caughtBody.health, 6);
  });
});

describe('food', () => {
  const apple = registry.items.get('apple')!; // rots after 240 game hours
  const beans = registry.items.get('canned_beans')!;

  it('rots on the clock, the same whether checked every game minute or once', () => {
    const item = { uid: 1, type: 'apple', count: 1, condition: 1 };
    let firstRotten: number | undefined;
    let firstGoingOff: number | undefined;
    for (let minute = 0; minute <= 12 * 24 * 60; minute++) {
      const word = freshnessWord(apple, item, minute * 60);
      firstGoingOff ??= word === 'going off' ? minute : undefined;
      firstRotten ??= word === 'rotten' ? minute : undefined;
    }
    expect(firstGoingOff).toBe(120 * 60);
    expect(firstRotten).toBe(240 * 60);
    expect(isRotten(apple, item, 240 * SECONDS_PER_HOUR)).toBe(true);
    expect(isRotten(apple, item, 240 * SECONDS_PER_HOUR - 1)).toBe(false);
  });

  it('counts from when it was made, and canned food keeps', () => {
    const picked = { uid: 1, type: 'apple', count: 1, condition: 1, madeAtGameTimestamp: 100 * SECONDS_PER_HOUR };
    expect(spoilage(apple, picked, 220 * SECONDS_PER_HOUR)).toBeCloseTo(0.5, 9);
    expect(spoilage(beans, { uid: 2, type: 'canned_beans', count: 1, condition: 1 }, 1e9)).toBeUndefined();
  });

  it('feeds you', () => {
    const needs = { ...SPAWN_NEEDS };
    consume(needs, beans.food!);
    expect(needs.calories).toBeCloseTo(40 + (350 / 2500) * 100, 9);
    expect(needs.hydration).toBeCloseTo(35 + (100 / 2500) * 100, 9);
  });
});

describe('flashlight', () => {
  // 0.25 of a battery per game hour: a full AA lasts 4 hours.
  const lit = () => {
    const inventory = new Inventory(registry);
    const light = inventory.create('flashlight');
    toggleLight(registry, light);
    return { inventory, light };
  };

  it('drains the same in one step as ticking every second, and goes out when the battery dies', () => {
    const caught = lit().light;
    const live = lit().light;
    expect([caught.on, live.on]).toEqual([true, true]);
    expect(drainLight(registry, caught, gameHours(3))).toBeUndefined();
    for (let i = 0; i < 3 * HOUR; i++) {
      drainLight(registry, live, gameSeconds(defaultClock.ratio));
    }
    expect(chargeOf(registry, caught)).toBeCloseTo(0.25, 9);
    expect(chargeOf(registry, live)).toBeCloseTo(0.25, 6);

    expect(drainLight(registry, caught, gameHours(5))).toBeCloseTo(gameHours(1), 9); // ran out an hour in
    expect(caught.on).toBe(false);
    expect(chargeOf(registry, caught)).toBe(0);
    expect(toggleLight(registry, caught)).toBe('The battery is dead');
  });

  it('takes a fresh battery from a stack, and gives back the old one if it had charge left', () => {
    const { inventory, light } = lit();
    drainLight(registry, light, gameHours(2)); // half left
    const batteries = inventory.create('aa_battery', 3);
    inventory.add(batteries, { kind: 'hand', side: 'left' });
    const feet: Target = { kind: 'pile', pos: [0, 0, 0] };
    expect(swapBattery(inventory, light, batteries, feet)).toBeUndefined();
    expect(batteries.count).toBe(2);
    expect(chargeOf(registry, light)).toBe(1);
    const spent = inventory.pileAt([0, 0, 0])!.items[0]!.item;
    expect([spent.type, chargeOf(registry, spent)]).toEqual(['aa_battery', 0.5]);

    drainLight(registry, light, gameHours(10)); // dead
    expect(swapBattery(inventory, light, batteries, feet)).toBeUndefined();
    expect(inventory.pileAt([0, 0, 0])!.items).toHaveLength(1); // the dead one is thrown away
    expect(swapBattery(inventory, light, light, feet)).toBe("It doesn't take that battery");
  });
});

describe('stamina', () => {
  it('runs out after 20 s of sprinting, and you need some back before sprinting again', () => {
    const needs = { ...SPAWN_NEEDS };
    stepStamina(needs, 20, true);
    expect(needs.stamina).toBe(0);
    expect(canSprint(needs, true)).toBe(false);
    stepStamina(needs, 2, false);
    expect(canSprint(needs, false)).toBe(false);
    stepStamina(needs, 0.5, false);
    expect(needs.stamina).toBe(STAMINA.recover * 2.5);
    expect(canSprint(needs, false)).toBe(true);
  });

  it('waits out the remaining simulation-time delay before stamina recovers', () => {
    const needs = { ...SPAWN_NEEDS };
    const delay = BODY_TUNING_FIXTURE.staminaRegenDelaySimSeconds;
    stepStamina(needs, needs.stamina / -STAMINA.sprint, true, delay);
    expect(needs.stamina).toBe(0);
    const remaining = needs.staminaRegenDelayRemainingSimSeconds;
    expect(remaining).toBeGreaterThan(0);

    stepStamina(needs, remaining / 2, false, delay);
    expect(needs.stamina).toBe(0);
    stepStamina(needs, remaining, false, delay);
    expect(needs.stamina).toBeGreaterThan(0);
  });

  it('comes back at half speed when you are worn down', () => {
    const needs = { ...SPAWN_NEEDS, stamina: 0, hydration: 5 };
    stepStamina(needs, 1, false);
    expect(needs.stamina).toBe(STAMINA.recover * STAMINA.worn);
  });
});

describe('death', () => {
  /** Runs until death, continuing through interruptions if compressed; returns the simulation time. */
  const untilDeath = (sim: Simulation, compressed: boolean): number => {
    for (let frames = 0; !sim.dead; frames++) {
      if (compressed && !sim.compression.active) {
        sim.compress();
      }
      sim.frame(compressed ? 1 / 60 : 1);
      if (frames > 2_000_000) {
        throw new Error('never died');
      }
    }
    return sim.dead.time;
  };

  it('comes from thirst and hunger at the hour the rates say, compressed or not', () => {
    const expected = (40 / 3 + (100 - 8 * (40 / 3 - 7)) / 12) * HOUR; // about 17.4 game hours
    const live = new Simulation({ seed: 1 });
    const fast = new Simulation({ seed: 1 });
    const events = live.events.reader();
    expect(untilDeath(live, false)).toBeCloseTo(expected, -1);
    expect(untilDeath(fast, true)).toBeCloseTo(expected, -2);
    expect(live.dead!.cause).toBe('thirst and hunger');
    expect(fast.dead!.cause).toBe('thirst and hunger');
    // Nothing moves after death.
    const at = live.time;
    expect(live.frame(1)).toBe(0);
    expect(live.time).toBe(at);
    expect(events.read().filter((e) => e.kind === 'death')).toHaveLength(1);
  });

  it('comes from an injury, which interrupts until then', () => {
    const sim = new Simulation({ seed: 1 });
    sim.hurt(30, 'a fall');
    expect(sim.body.health).toBe(70);
    expect(sim.dead).toBeUndefined();
    sim.hurt(80, 'a fall');
    expect(sim.dead?.cause).toBe('a fall');
  });
});
