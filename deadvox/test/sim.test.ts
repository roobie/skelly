import { describe, expect, it } from 'vitest';
import { BODY_REGIONS } from '../src/core/body.ts';
import {
  calendarAt,
  defaultClock,
  formatClock,
  nextTimeOfDay,
  parseTimeOfDay,
  SECONDS_PER_DAY,
  simSecondsPerHour,
  skipTarget,
} from '../src/core/clock.ts';
import { COMPRESSION, SKIP_COMPRESSION } from '../src/core/compression.ts';
import { NEED_RATES, SPAWN_NEEDS } from '../src/core/needs.ts';
import { gameSeconds, gameToSimSeconds, realSeconds } from '../src/core/time.ts';
import { advanceLiveFrame } from '../src/game/frameDriver.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const FRAME = 1 / 60;
const HOUR = simSecondsPerHour(defaultClock);

/** Runs 60 fps frames until the simulation reaches `until`. Returns the real seconds taken. */
const runUntil = (sim: Simulation, until: number): number => {
  let frames = 0;
  while (sim.time < until - 1e-9) {
    advanceLiveFrame(sim, realSeconds(FRAME), until);
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

  it('selects the next occurrence, including tomorrow when the requested time is now or earlier', () => {
    const today = 3 * 24 * 3600;
    expect(nextTimeOfDay(today + 8 * 3600, 9 * 3600)).toBe(today + 9 * 3600);
    expect(nextTimeOfDay(today + 8 * 3600, 8 * 3600)).toBe(today + 24 * 3600 + 8 * 3600);
    expect(nextTimeOfDay(today + 9 * 3600, 8 * 3600)).toBe(today + 24 * 3600 + 8 * 3600);
  });
});

describe('Simulation', () => {
  it('applies long-action compression to each fixed replay frame', () => {
    const sim = new Simulation({ seed: 1 });
    let ticks = 0;
    sim.scheduler.register({
      id: 'replay-clock',
      rate: 60,
      tick: () => {
        ticks += 1;
      },
    });
    expect(sim.actions.startRest('sleep', -10, 1)).toBeUndefined();
    for (let frames = 0; sim.compression.c < COMPRESSION.cap && frames < 120; frames += 1) {
      advanceLiveFrame(sim, realSeconds(FRAME));
    }
    expect(sim.compression.c).toBe(COMPRESSION.cap);
    ticks = 0;
    const recordedCompression = sim.compression.c;

    expect(sim.frameReplay(FRAME)).toBeCloseTo(recordedCompression * FRAME, 12);
    expect(ticks).toBe(Math.round(recordedCompression));
  });

  it('rejects backward debug seeks and keeps existing absolute timestamps in the past', () => {
    const sim = new Simulation({ seed: 1 });
    let absoluteStartTime = -1;
    sim.scheduler.register({
      id: 'absolute-state',
      rate: 1,
      tick: (_dt, time) => {
        absoluteStartTime = time;
      },
    });
    sim.frame(2);
    expect(absoluteStartTime).toBe(sim.time);
    expect(() => sim.setDebugCalendarTime(sim.calendar - 1)).toThrow('Invalid debug calendar time');

    const targetCalendar = sim.calendar + SECONDS_PER_DAY + 3600;
    sim.setDebugCalendarTime(targetCalendar);
    expect(sim.calendar).toBe(targetCalendar);
    expect(absoluteStartTime).toBeLessThanOrEqual(sim.time);
    expect(sim.scheduler.snapshotState().systems.every((system) => system.done <= sim.time)).toBe(true);
  });

  it('emits damage events with cause and amount for audio and noise consumers', () => {
    const sim = new Simulation({ seed: 1 });
    const events = sim.events.reader();
    sim.hurt(10, 'a shambler');

    expect(events.read()).toContainEqual({ kind: 'damage', amount: 10, cause: 'a shambler', time: 0 });
  });

  it('defaults unresolved hits to the torso region', () => {
    const sim = new Simulation({ seed: 1 });
    sim.hit(1, 'a bite', undefined, { bleeding: true });

    expect(sim.body.regionDamage.torso).toBeGreaterThan(0);
    expect(sim.body.wounds.torso?.bleeding).toBe(true);
  });

  it('replays at-risk wound decisions from the seeded simulation RNG and saves the result', () => {
    const first = new Simulation({ seed: 31 });
    const replay = new Simulation({ seed: 31 });
    for (const region of BODY_REGIONS) {
      first.hit(1, 'a bite', region, { bleeding: true });
      replay.hit(1, 'a bite', region, { bleeding: true });
    }

    const firstRisks = Object.fromEntries(
      BODY_REGIONS.map((region) => [region, first.body.wounds[region]?.infectionAtRisk]),
    );
    const replayRisks = Object.fromEntries(
      BODY_REGIONS.map((region) => [region, replay.body.wounds[region]?.infectionAtRisk]),
    );
    expect(firstRisks).toEqual(replayRisks);
    const restored = new Simulation({ seed: 31 });
    restored.restoreState(first.snapshotState());
    expect(
      Object.fromEntries(BODY_REGIONS.map((region) => [region, restored.body.wounds[region]?.infectionAtRisk])),
    ).toEqual(firstRisks);
  });

  it('uses the body tuning chance to decide which bleeding wounds are infection risks', () => {
    const noRisk = new Simulation({
      seed: 31,
      bodyTuning: { ...BODY_TUNING_FIXTURE, infectionChance: 0 },
    });
    const certainRisk = new Simulation({
      seed: 31,
      bodyTuning: { ...BODY_TUNING_FIXTURE, infectionChance: 1 },
    });
    noRisk.hit(1, 'a bite', 'torso', { bleeding: true });
    certainRisk.hit(1, 'a bite', 'torso', { bleeding: true });

    expect(noRisk.body.wounds.torso?.infectionAtRisk).toBe(false);
    expect(certainRisk.body.wounds.torso?.infectionAtRisk).toBe(true);
  });

  it('resolves prompt antiseptic through the scheduler but requires antibiotics after its window', () => {
    const onsetSimulation = new Simulation({ seed: 1 });
    onsetSimulation.hit(1, 'a bite', 'head', { bleeding: true, infectionAtRisk: true });
    const onsetSimSeconds = gameToSimSeconds(onsetSimulation.clock, BODY_TUNING_FIXTURE.infectionOnsetGameHours);
    onsetSimulation.scheduler.advance(onsetSimSeconds + 1);
    expect(onsetSimulation.body.canTreat('head', 'antiseptic')).toBe(true);
    onsetSimulation.actions.treatment = {
      validate: (region, _itemUid, treatment) =>
        onsetSimulation.body.canTreat(region, treatment) ? undefined : 'Treatment no longer applies',
      finish: (region, _itemUid, treatment) =>
        onsetSimulation.body.treat(region, treatment) ? true : 'Treatment no longer applies',
    };
    expect(
      onsetSimulation.actions.beginTreatment('head', 1, 'antiseptic', BODY_TUNING_FIXTURE.treatmentSimSeconds),
    ).toBeUndefined();
    onsetSimulation.scheduler.advance(BODY_TUNING_FIXTURE.treatmentSimSeconds + 1);
    expect(onsetSimulation.body.wounds.head?.infection).toBe('resolved');
    expect(onsetSimulation.actions.job).toBeUndefined();

    const lateSimulation = new Simulation({ seed: 1 });
    lateSimulation.hit(1, 'a bite', 'head', { bleeding: true, infectionAtRisk: true });
    const infectionCutoffGameSeconds = gameSeconds(
      BODY_TUNING_FIXTURE.infectionOnsetGameHours + BODY_TUNING_FIXTURE.antisepticWindowGameHours,
    );
    lateSimulation.scheduler.advance(gameToSimSeconds(lateSimulation.clock, infectionCutoffGameSeconds) + 1);
    expect(lateSimulation.body.canTreat('head', 'antiseptic')).toBe(false);
    expect(lateSimulation.body.canTreat('head', 'antibiotics')).toBe(true);
  });

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
    advanceLiveFrame(sim, realSeconds(FRAME));
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
    advanceLiveFrame(sim, realSeconds(1)); // 30 simulation seconds at the cap
    expect(sim.compression.c).toBe(1);
    expect(sim.compression.interruption).toBe('You hear something outside');
    expect(sim.time).toBeCloseTo(firedAt[0]!, 9);
    expect(sim.compression.locksInput).toBe(true);

    // Continue: compression ramps up again.
    expect(sim.compress().ok).toBe(true);
    advanceLiveFrame(sim, realSeconds(0.5));
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
    advanceLiveFrame(sim, realSeconds(FRAME));
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
      advanceLiveFrame(sim, realSeconds(FRAME));
    }
    expect(sim.compression.c).toBe(1);
    sim.emit({ kind: 'interrupt', reason: 'You hear something outside' });
    advanceLiveFrame(sim, realSeconds(FRAME));
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

  it('god mode prevents hunger and thirst health loss while needs still advance', () => {
    const sim = new Simulation({ seed: 1 });
    sim.godMode = true;
    sim.needs.calories = 0;
    sim.needs.hydration = 0;
    sim.frame(HOUR);
    expect(sim.body.health).toBe(100);
    expect(sim.needs.calories).toBe(0);
    expect(sim.needs.hydration).toBe(0);
    expect(sim.dead).toBeUndefined();

    sim.godMode = false;
    sim.frame(HOUR);
    expect(sim.body.health).toBeLessThan(100);
  });

  describe('debug time skip', () => {
    it('computes the target as game hours of simulation seconds after now', () => {
      expect(skipTarget(defaultClock, 0, 1)).toBe(HOUR);
      expect(skipTarget(defaultClock, 100, 23)).toBe(100 + 23 * HOUR);
      expect(skipTarget({ ratio: 4, start: 0 }, 10, 2)).toBe(10 + 2 * 900);
    });

    it('advances the calendar by exactly the skipped game hours, danger notwithstanding', () => {
      const sim = new Simulation({ seed: 1, unsafe: () => 'A shambler is close' });
      expect(sim.compress().ok).toBe(false);
      sim.ignoreUnsafe = true;
      expect(sim.compress().ok).toBe(true);
      const until = skipTarget(sim.clock, sim.time, 1);
      runUntil(sim, until);
      expect(sim.time).toBeCloseTo(until, 6);
      expect(sim.compression.interruption).toBeUndefined();
      expect(formatClock(sim.calendar)).toBe('Day 1, 20:30');
    });

    it('runs the needs for the whole span, so a long skip is cut short when one turns critical', () => {
      const sim = new Simulation({ seed: 1 });
      sim.ignoreUnsafe = true;
      sim.compress();
      const until = skipTarget(sim.clock, sim.time, 23);
      for (let frames = 0; sim.compression.interruption === undefined && frames < 100_000; frames++) {
        advanceLiveFrame(sim, realSeconds(FRAME), until);
      }
      // Spawn needs run out of hydration and rest within about 5 game hours.
      expect(sim.compression.interruption).toBe("You're parched");
      expect(sim.time).toBeLessThan(until);
      expect(sim.needs.hydration).toBeLessThan(10);
    });

    it('waits out a pause, e.g. the debug game freeze, and then reaches the same target', () => {
      const sim = new Simulation({ seed: 1 });
      sim.compress();
      const until = skipTarget(sim.clock, sim.time, 1);
      advanceLiveFrame(sim, realSeconds(FRAME), until);
      const frozenAt = { time: sim.time, c: sim.compression.c };
      sim.paused = true;
      for (let i = 0; i < 120; i++) {
        sim.frame(FRAME, until);
      }
      expect({ time: sim.time, c: sim.compression.c }).toEqual(frozenAt);
      expect(sim.compression.active).toBe(true);
      sim.paused = false;
      runUntil(sim, until);
      expect(sim.time).toBeCloseTo(until, 6);
    });

    it('lands the same simulation state as playing the span at 1x', () => {
      const plain = new Simulation({ seed: 1 });
      runUntil(plain, HOUR);
      const skipped = new Simulation({ seed: 1 });
      skipped.compress();
      runUntil(skipped, skipTarget(skipped.clock, skipped.time, 1));
      expect(skipped.calendar).toBeCloseTo(plain.calendar, 6);
      expect(skipped.scheduler.tickCounts().get('needs')!).toBeLessThan(plain.scheduler.tickCounts().get('needs')!);
    });

    it('reaches +23 h in a few real seconds with bounded per-frame work, landing exactly on target', () => {
      const sim = new Simulation({ seed: 1 });
      let ticks = 0;
      sim.scheduler.register({
        id: 'physics',
        rate: 60,
        tick: () => {
          ticks += 1;
        },
      });
      sim.scheduler.register({
        id: 'zombies',
        rate: 20,
        tick: () => {
          ticks += 1;
        },
      });
      sim.ignoreUnsafe = true;
      expect(sim.compress(SKIP_COMPRESSION).ok).toBe(true);
      const until = skipTarget(sim.clock, sim.time, 23);
      let frames = 0;
      let worstFrameTicks = 0;
      while (sim.time < until - 1e-6 && frames < 600) {
        // Keeps the needs from turning critical, which would interrupt the skip.
        Object.assign(sim.needs, SPAWN_NEEDS);
        const before = ticks;
        advanceLiveFrame(sim, realSeconds(FRAME), until);
        worstFrameTicks = Math.max(worstFrameTicks, ticks - before);
        frames += 1;
      }
      expect(sim.compression.interruption).toBeUndefined();
      expect(sim.time).toBeCloseTo(until, 6);
      expect(frames).toBeLessThanOrEqual(5 * 60);
      expect(sim.compression.c).toBeLessThanOrEqual(SKIP_COMPRESSION.cap);
      // 80 ticks per simulation second at most, and no frame exceeds the per-frame bound.
      expect(worstFrameTicks).toBeLessThanOrEqual(SKIP_COMPRESSION.maxSimPerFrame * 80 + 2);
    });

    it('reaches +1 h in under a second', () => {
      const sim = new Simulation({ seed: 1 });
      sim.ignoreUnsafe = true;
      sim.compress(SKIP_COMPRESSION);
      expect(runUntil(sim, skipTarget(sim.clock, sim.time, 1))).toBeLessThan(1);
    });

    it('keeps the normal cap for a later start without the skip limits', () => {
      const sim = new Simulation({ seed: 1 });
      sim.compress(SKIP_COMPRESSION);
      runUntil(sim, 200);
      expect(sim.compression.c).toBeGreaterThan(COMPRESSION.cap);
      sim.compression.stop();
      sim.compression.snap();
      sim.compress();
      runUntil(sim, sim.time + 100);
      expect(sim.compression.c).toBe(COMPRESSION.cap);
    });

    it('still stops at a real interruption, and refuses danger again once ignoreUnsafe is off', () => {
      let danger: string | undefined = 'A shambler is close';
      const sim = new Simulation({ seed: 1, unsafe: () => danger });
      sim.ignoreUnsafe = true;
      sim.compress();
      sim.frame(FRAME, HOUR);
      sim.emit({ kind: 'interrupt', reason: "You're hurt" });
      sim.frame(FRAME, HOUR);
      expect(sim.compression.interruption).toBe("You're hurt");

      sim.compression.stop();
      sim.ignoreUnsafe = false;
      expect(sim.compress()).toEqual({ ok: false, reason: danger });
      danger = undefined;
      expect(sim.compress().ok).toBe(true);
    });
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
