import { describe, expect, it } from 'vitest';
import { randomStream } from '../src/core/random.ts';
import { CLOCK_RATIO, Clock, dayOf, formatClock, HOUR, hourOf, START_TIME } from '../src/core/sim/clock.ts';
import { COMPRESSION_CAP, Compression } from '../src/core/sim/compression.ts';
import { MapEntityStore } from '../src/core/sim/entities.ts';
import { EventQueue } from '../src/core/sim/events.ts';
import { MAX_FIXED_STEPS, Scheduler } from '../src/core/sim/scheduler.ts';
import { Simulation } from '../src/core/sim/simulation.ts';
import { skyAt } from '../src/core/sim/sky.ts';

describe('clock', () => {
  it('runs the calendar CLOCK_RATIO times faster than simulation time', () => {
    const clock = new Clock();
    expect(clock.advance(10)).toBe(10 * CLOCK_RATIO);
    expect(clock.sim).toBe(10);
    expect(clock.calendar).toBe(START_TIME + 10 * CLOCK_RATIO);
  });

  it('formats days and times', () => {
    expect(formatClock(START_TIME)).toBe('Day 1, 08:00');
    expect(formatClock(24 * HOUR + 7 * HOUR + 5 * 60 + 59)).toBe('Day 2, 07:05');
    expect(dayOf(3 * 24 * HOUR - 1)).toBe(3);
    expect(hourOf(25.5 * HOUR)).toBeCloseTo(1.5);
  });
});

describe('sky', () => {
  it('is bright at noon and dark (but not black) at midnight', () => {
    const noon = skyAt(12);
    const night = skyAt(0);
    expect(noon.sun).toBeGreaterThan(1);
    expect(night.sun).toBeLessThan(0.2);
    expect(night.ambient).toBeGreaterThan(0.1);
    expect(noon.ambient).toBeGreaterThan(night.ambient);
  });

  it('changes smoothly, wraps at midnight, and keeps its light above the horizon', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const a = skyAt(h);
      const b = skyAt(h + 0.01 < 24 ? h + 0.01 : 0);
      expect(Math.abs(a.sun - b.sun)).toBeLessThan(0.05);
      expect(a.sunDir[1]).toBeGreaterThan(0);
    }
    expect(skyAt(23.999).color).toBe(skyAt(0).color);
  });
});

describe('scheduler', () => {
  it('steps fixed systems by exactly their interval and coarse systems once per frame', () => {
    const scheduler = new Scheduler();
    const fixed: number[] = [];
    const coarse: number[] = [];
    scheduler.add({ id: 'fixed', interval: 0.1, kind: 'fixed', tick: (dt) => fixed.push(dt) });
    scheduler.add({ id: 'coarse', interval: 1, kind: 'coarse', tick: (dt) => coarse.push(dt) });
    scheduler.advance(0.35);
    expect(fixed).toEqual([0.1, 0.1, 0.1]);
    expect(coarse).toEqual([]);
    scheduler.advance(0.7);
    expect(fixed).toHaveLength(10);
    expect(coarse).toHaveLength(1);
    expect(coarse[0]).toBeCloseTo(1.05);
  });

  it('caps fixed steps per frame and drops the rest', () => {
    const scheduler = new Scheduler();
    let ticks = 0;
    scheduler.add({
      id: 'f',
      interval: 0.01,
      kind: 'fixed',
      tick: () => {
        ticks += 1;
      },
    });
    scheduler.advance(1);
    expect(ticks).toBe(MAX_FIXED_STEPS);
    expect(scheduler.dropped).toBeGreaterThan(0.9);
  });

  it('refuses two systems with the same id', () => {
    const scheduler = new Scheduler();
    const system = { id: 'x', interval: 1, kind: 'coarse' as const, tick: () => undefined };
    scheduler.add(system);
    expect(() => scheduler.add(system)).toThrow('already scheduled');
  });
});

describe('compression', () => {
  it('ramps up to the cap over a second and back down after stopping', () => {
    const c = new Compression();
    expect(c.start()).toBeUndefined();
    c.update(0.5);
    expect(c.factor).toBeCloseTo(1 + (COMPRESSION_CAP - 1) / 2);
    c.update(0.6);
    expect(c.factor).toBe(COMPRESSION_CAP);
    c.stop();
    c.update(2);
    expect(c.factor).toBe(1);
  });

  it("won't start when unsafe, and drops to real time at once when it becomes unsafe", () => {
    const c = new Compression();
    let threat: string | undefined = 'a shambler is watching you';
    c.addCheck(() => threat);
    expect(c.start()).toBe('a shambler is watching you');
    expect(c.running).toBe(false);
    threat = undefined;
    c.start();
    c.update(1);
    expect(c.factor).toBe(COMPRESSION_CAP);
    threat = 'you hear something outside';
    c.update(0.016);
    expect(c.factor).toBe(1);
    expect(c.running).toBe(false);
    expect(c.interruption).toBe('you hear something outside');
  });
});

describe('random streams', () => {
  it('are deterministic per seed and system, and independent between systems', () => {
    const draw = (seed: number, id: string) => {
      const next = randomStream(seed, id);
      return [next(), next(), next()];
    };
    expect(draw(1, 'ai')).toEqual(draw(1, 'ai'));
    expect(draw(1, 'ai')).not.toEqual(draw(1, 'loot'));
    expect(draw(1, 'ai')).not.toEqual(draw(2, 'ai'));
    for (const v of draw(7, 'x')) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('event queue', () => {
  it('drains events oldest first, and later emits wait for the next drain', () => {
    const q = new EventQueue<string>();
    q.emit('a');
    q.emit('b');
    const first = q.drain();
    q.emit('c');
    expect(first).toEqual(['a', 'b']);
    expect(q.drain()).toEqual(['c']);
    expect(q.size).toBe(0);
  });
});

describe('entity store', () => {
  it('assigns ids and supports lookup and removal', () => {
    const store = new MapEntityStore<{ id: number; pos: [number, number, number]; hp: number }>();
    const a = store.add({ pos: [0, 0, 0], hp: 10 });
    const b = store.add({ pos: [1, 0, 0], hp: 5 });
    expect(a.id).not.toBe(b.id);
    expect(store.get(b.id)?.hp).toBe(5);
    expect(store.remove(a.id)).toBe(true);
    expect(store.size).toBe(1);
    expect([...store.values()].map((e) => e.id)).toEqual([b.id]);
  });
});

describe('compressed and uncompressed time agree (milestone 1.2)', () => {
  /** A needs-like meter: drains a fixed amount per game hour, ticked coarsely. */
  const DrainPerHour = 4;
  const run = (compressed: boolean) => {
    const sim = new Simulation();
    let meter = 100;
    sim.scheduler.add({
      id: 'needs',
      interval: 1,
      kind: 'coarse',
      tick: (dt) => {
        meter -= (DrainPerHour * dt * CLOCK_RATIO) / HOUR;
      },
    });
    if (compressed) {
      sim.compression.start();
    }
    const start = sim.clock.calendar;
    let frames = 0;
    while (sim.clock.calendar - start < HOUR) {
      sim.frame(1 / 60);
      frames += 1;
    }
    const hours = (sim.clock.calendar - start) / HOUR;
    return { meter, hours, frames };
  };

  it('gives the same meter state for the same game time', () => {
    const real = run(false);
    const fast = run(true);
    // Both stop within one frame of an hour.
    expect(real.hours).toBeCloseTo(1, 3);
    expect(fast.hours).toBeCloseTo(1, 1);
    // The meter matches the clock exactly, up to the last partial coarse tick (≤ 1 s of simulation).
    const tolerance = (DrainPerHour * CLOCK_RATIO) / HOUR;
    for (const r of [real, fast]) {
      expect(Math.abs(r.meter - (100 - DrainPerHour * r.hours))).toBeLessThanOrEqual(tolerance);
    }
    // And compression really compresses: an hour takes about 15 real seconds instead of 7.5 minutes.
    expect(real.frames / 60).toBeCloseTo(HOUR / CLOCK_RATIO, -1);
    expect(fast.frames / 60).toBeLessThan(20);
  });
});
