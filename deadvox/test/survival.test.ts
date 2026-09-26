import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultClock, SECONDS_PER_HOUR, simSecondsPerHour } from '../src/core/clock.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { freshnessWord, isRotten, spoilage } from '../src/core/food.ts';
import { Inventory, type Target } from '../src/core/inventory.ts';
import { chargeOf, drainLight, swapBattery, toggleLight } from '../src/core/lights.ts';
import {
  canSprint,
  consume,
  NEED_RATES,
  type Needs,
  SPAWN_NEEDS,
  STAMINA,
  stepNeeds,
  stepStamina,
} from '../src/core/needs.ts';
import { Simulation } from '../src/core/sim.ts';

const HOUR = simSecondsPerHour(defaultClock); // 450 simulation seconds
const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  ['items-food.json', 'items-other.json', 'items-tools.json', 'items-wearables.json'].map((f) =>
    read(`src/content/base/${f}`),
  ),
);

/** Steps needs every simulation second, as the needs system does at 1×. */
const tickLive = (needs: Needs, hours: number): void => {
  const step = 1 / HOUR;
  for (let t = 0; t < hours - 1e-9; t += step) {
    stepNeeds(needs, Math.min(step, hours - t));
  }
};

describe('need rates', () => {
  it('run at their rates per game hour', () => {
    const sim = new Simulation({ seed: 1 });
    for (let i = 0; i < HOUR; i++) {
      sim.frame(1);
    }
    expect(sim.needs.calories).toBeCloseTo(SPAWN_NEEDS.calories + NEED_RATES.calories, 9);
    expect(sim.needs.hydration).toBeCloseTo(SPAWN_NEEDS.hydration + NEED_RATES.hydration, 9);
    expect(sim.needs.fatigue).toBeCloseTo(SPAWN_NEEDS.fatigue + NEED_RATES.fatigue, 9);
    expect(sim.needs.health).toBe(100);
  });

  it('bring health back while needs are met, and take it while starving or parched', () => {
    const fed: Needs = { calories: 80, hydration: 80, fatigue: 10, health: 50, stamina: 100 };
    stepNeeds(fed, 5);
    expect(fed.health).toBeCloseTo(60, 9);

    const starving: Needs = { calories: 0, hydration: 80, fatigue: 10, health: 50, stamina: 100 };
    stepNeeds(starving, 5);
    expect(starving.health).toBeCloseTo(30, 9);

    const both: Needs = { calories: 0, hydration: 0, fatigue: 10, health: 50, stamina: 100 };
    stepNeeds(both, 2);
    expect(both.health).toBeCloseTo(26, 9);
  });
});

describe('catch-up', () => {
  it('lands where ticking every second does, across every threshold', () => {
    // From spawn: health full until hydration runs out at 7 h, then −8/h, and −12/h
    // once calories run out too at 13⅓ h.
    const caught = { ...SPAWN_NEEDS };
    const live = { ...SPAWN_NEEDS };
    stepNeeds(caught, 16);
    tickLive(live, 16);
    for (const need of ['calories', 'hydration', 'fatigue', 'health'] as const) {
      expect(caught[need]).toBeCloseTo(live[need], 6);
    }
    expect(caught.health).toBeCloseTo(100 - 8 * (40 / 3 - 7) - 12 * (16 - 40 / 3), 9);
  });

  it('starts and stops health coming back at the right moment', () => {
    // Calories cross 25 (health stops coming back) partway through the step.
    const start: Needs = { calories: 31, hydration: 90, fatigue: 0, health: 40, stamina: 100 };
    const caught = { ...start };
    const live = { ...start };
    stepNeeds(caught, 6);
    tickLive(live, 6);
    expect(caught.health).toBeCloseTo(40 + 2 * 2, 9); // 2 h of regen, then none
    expect(live.health).toBeCloseTo(caught.health, 6);
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
    const picked = { uid: 1, type: 'apple', count: 1, condition: 1, made: 100 * SECONDS_PER_HOUR };
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
    expect(drainLight(registry, caught, 3)).toBeUndefined();
    for (let i = 0; i < 3 * HOUR; i++) {
      drainLight(registry, live, 1 / HOUR);
    }
    expect(chargeOf(registry, caught)).toBeCloseTo(0.25, 9);
    expect(chargeOf(registry, live)).toBeCloseTo(0.25, 6);

    expect(drainLight(registry, caught, 5)).toBeCloseTo(1, 9); // ran out an hour in
    expect(caught.on).toBe(false);
    expect(chargeOf(registry, caught)).toBe(0);
    expect(toggleLight(registry, caught)).toBe('The battery is dead');
  });

  it('takes a fresh battery from a stack, and gives back the old one if it had charge left', () => {
    const { inventory, light } = lit();
    drainLight(registry, light, 2); // half left
    const batteries = inventory.create('aa_battery', 3);
    inventory.add(batteries, { kind: 'hand', side: 'left' });
    const feet: Target = { kind: 'pile', pos: [0, 0, 0] };
    expect(swapBattery(inventory, light, batteries, feet)).toBeUndefined();
    expect(batteries.count).toBe(2);
    expect(chargeOf(registry, light)).toBe(1);
    const spent = inventory.pileAt([0, 0, 0])!.items[0]!.item;
    expect([spent.type, chargeOf(registry, spent)]).toEqual(['aa_battery', 0.5]);

    drainLight(registry, light, 10); // dead
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
    expect(sim.needs.health).toBe(70);
    expect(sim.dead).toBeUndefined();
    sim.hurt(80, 'a fall');
    expect(sim.dead?.cause).toBe('a fall');
  });
});
