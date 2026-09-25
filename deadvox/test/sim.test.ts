import { describe, expect, it } from 'vitest';
import { calendarAt, defaultClock, formatClock, parseTimeOfDay, simSecondsPerHour } from '../src/core/clock.ts';
import { COMPRESSION } from '../src/core/compression.ts';
import { NEED_RATES, SPAWN_NEEDS } from '../src/core/needs.ts';
import { Simulation } from '../src/core/sim.ts';

const FRAME = 1 / 60;
const HOUR = simSecondsPerHour(defaultClock);

/** Runs 60 fps frames until the simulation reaches `until`. Returns the real seconds taken. */
const runUntil = (sim: Simulation, until: number): number => {
  let frames = 0;
  while (sim.time < until - 1e-9) {
    sim.frame(FRAME, until);
    frames += 1;
    if (frames > 1_000_000) {
      throw new Error('stuck');
    }
  }
  return frames * FRAME;
};

describe('clock', () => {
  it('starts at dusk and runs 8 calendar seconds per simulation second', () => {
    expect(formatClock(calendarAt(defaultClock, 0))).toBe('Day 1, 19:30');
    expect(HOUR).toBe(450);
    expect(formatClock(calendarAt(defaultClock, 5 * HOUR))).toBe('Day 2, 00:30');
  });

  it('parses a time of day', () => {
    expect(parseTimeOfDay('06:15')).toBe(6.25 * 3600);
    expect(parseTimeOfDay('24:00')).toBeUndefined();
    expect(parseTimeOfDay('noon')).toBeUndefined();
  });
});

describe('Simulation', () => {
  it('gives the same clock and needs for a compressed and an uncompressed hour', () => {
    const plain = new Simulation({ seed: 1 });
    const realPlain = runUntil(plain, HOUR);

    const fast = new Simulation({ seed: 1 });
    expect(fast.compress().ok).toBe(true);
    const realFast = runUntil(fast, HOUR);

    expect(realPlain).toBeCloseTo(HOUR, 0);
    expect(realFast).toBeLessThan(HOUR / 10);
    expect(fast.time).toBeCloseTo(plain.time, 9);
    expect(formatClock(fast.calendar)).toBe('Day 1, 20:30');
    expect(formatClock(plain.calendar)).toBe('Day 1, 20:30');
    // Needs lag by at most one grown step: 30 s, 4 game minutes.
    const tolerance = (Math.max(...Object.values(NEED_RATES).map(Math.abs)) * 4) / 60;
    for (const need of ['calories', 'hydration', 'fatigue'] as const) {
      expect(plain.needs[need]).toBeCloseTo(SPAWN_NEEDS[need] + NEED_RATES[need], 6);
      expect(Math.abs(fast.needs[need] - plain.needs[need])).toBeLessThanOrEqual(tolerance);
    }
  });

  it('keeps the cost per frame bounded under compression', () => {
    const sim = new Simulation({ seed: 1 });
    sim.compress();
    runUntil(sim, 20); // ramp up
    expect(sim.compression.c).toBe(COMPRESSION.cap);
    const before = sim.scheduler.tickCounts().get('needs')!;
    sim.frame(FRAME);
    // One frame at 30× is half a simulation second: at most one needs tick, not 30.
    expect(sim.scheduler.tickCounts().get('needs')! - before).toBeLessThanOrEqual(1);
    expect(sim.scheduler.stepOf('needs', COMPRESSION.cap)).toBe(30);
  });

  it('stops within one step of an interruption and waits for the player', () => {
    const sim = new Simulation({ seed: 1 });
    let fireAt = Number.POSITIVE_INFINITY;
    const firedAt: number[] = [];
    sim.scheduler.register({
      id: 'noise',
      rate: 10,
      maxStep: 0.1,
      tick: (_dt, time) => {
        if (time >= fireAt && firedAt.length === 0) {
          firedAt.push(time);
          sim.emit({ kind: 'interrupt', reason: 'You hear something outside' });
        }
      },
    });
    sim.compress();
    runUntil(sim, 60);
    fireAt = sim.time + 7.05;
    sim.frame(1); // 30 simulation seconds at the cap
    expect(sim.compression.c).toBe(1);
    expect(sim.compression.interruption).toBe('You hear something outside');
    expect(sim.time).toBeCloseTo(firedAt[0]!, 9);
    expect(sim.compression.locksInput).toBe(true);

    // Continue: compression ramps up again.
    expect(sim.compress().ok).toBe(true);
    sim.frame(0.5);
    expect(sim.compression.c).toBeGreaterThan(1);
    expect(sim.compression.interruption).toBeUndefined();
  });

  it('refuses compression when unsafe, and interrupts when it stops being safe', () => {
    let danger: string | undefined = 'Something is close';
    const sim = new Simulation({ seed: 1, unsafe: () => danger });
    expect(sim.compress()).toEqual({ ok: false, reason: 'Something is close' });
    expect(sim.compression.active).toBe(false);

    danger = undefined;
    sim.compress();
    runUntil(sim, 30);
    expect(sim.compression.c).toBeGreaterThan(1);
    danger = 'A shambler noticed you';
    sim.frame(FRAME);
    expect(sim.compression.c).toBe(1);
    expect(sim.compression.interruption).toBe('A shambler noticed you');
  });

  it('interrupts when a need becomes critical', () => {
    const sim = new Simulation({ seed: 1 });
    sim.needs.fatigue = 89.9;
    sim.compress();
    runUntil(sim, HOUR);
    expect(sim.compression.interruption).toBe("You're exhausted");
    expect(sim.time).toBeLessThan(HOUR);
  });

  it('ramps back down when the action ends, and ignores interruptions at 1×', () => {
    const sim = new Simulation({ seed: 1 });
    sim.compress();
    runUntil(sim, 60);
    sim.compression.stop();
    for (let i = 0; i < 60; i++) {
      sim.frame(FRAME);
    }
    expect(sim.compression.c).toBe(1);
    sim.emit({ kind: 'interrupt', reason: 'You hear something outside' });
    sim.frame(FRAME);
    expect(sim.compression.interruption).toBeUndefined();
    expect(sim.compression.locksInput).toBe(false);
  });

  it('does not advance while paused', () => {
    const sim = new Simulation({ seed: 1 });
    sim.paused = true;
    expect(sim.frame(1)).toBe(0);
    expect(sim.time).toBe(0);
    sim.paused = false;
    expect(sim.frame(0.5)).toBeCloseTo(0.5, 9);
  });

  it('gives each system its own repeatable random stream', () => {
    const a = new Simulation({ seed: 7 });
    const b = new Simulation({ seed: 7 });
    const draw = (sim: Simulation, id: string) => Array.from({ length: 5 }, () => sim.rng(id).next());
    expect(draw(a, 'zombies')).toEqual(draw(b, 'zombies'));
    const zombies = a.rng('zombies');
    const loot = a.rng('loot');
    expect(zombies.next()).not.toBe(loot.next());
  });
});
