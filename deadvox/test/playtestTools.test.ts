import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/sim.ts';
import { controlsCardRows } from '../src/game/controls.ts';
import { BindingRegistry } from '../src/game/inputBindings.ts';
import {
  loadMetrics,
  measureSnapshots,
  metricsExportJson,
  metricsStorageKey,
  persistMetrics,
  SessionMetrics,
  snapshotTimerQuantumForUserAgent,
} from '../src/game/playtestTools.ts';

describe('playtest metrics', () => {
  it('accumulates looting time, deaths, compression, interruptions, and pocket uses', () => {
    const metrics = new SessionMetrics(7007);
    metrics.recordContainerLoot('kitchen cupboard', 2.5, 18);
    metrics.recordDeath('a shambler', 3600);
    metrics.frame(2, true, true);
    metrics.frame(3, true, false);
    metrics.recordPocketUse('player pocket 1');
    metrics.recordPocketUse('player pocket 1');

    expect(metrics.toJSON()).toEqual({
      schemaVersion: 1,
      seed: 7007,
      containersLooted: [{ container: 'kitchen cupboard', handlingSeconds: 2.5, uiSeconds: 18 }],
      deaths: [{ cause: 'a shambler', survivedSeconds: 3600 }],
      compressedSeconds: 5,
      interruptions: 1,
      pocketUses: { 'player pocket 1': 2 },
    });
  });

  it('exports versioned JSON and survives reload through the local side channel', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const metrics = new SessionMetrics(12);
    metrics.recordPocketUse('player pocket 2');
    persistMetrics(metrics, storage);
    expect(JSON.parse(metricsExportJson(metrics))).toMatchObject({ schemaVersion: 1, seed: 12 });
    expect(loadMetrics(12, storage)).toEqual(metrics.toJSON());
    expect(metricsStorageKey(12)).toContain(':v1:12');
    expect(loadMetrics(13, storage)).toBeUndefined();
  });

  it('rejects malformed versioned metrics and bounds retained history on load', () => {
    const stored = new Map<string, string>([[metricsStorageKey(73), '{"schemaVersion":1,"seed":73}']]);
    const storage = { getItem: (key: string) => stored.get(key) ?? null };
    expect(loadMetrics(73, storage)).toBeUndefined();

    const large = new SessionMetrics(74);
    for (let i = 0; i < 600; i++) {
      large.recordContainerLoot(`container-${i}`, 1, 2);
      large.recordDeath('shambler', i);
    }
    const payload = large.toJSON();
    expect(payload.containersLooted).toHaveLength(512);
    expect(payload.deaths).toHaveLength(512);
  });
});

const makeJitteredClock = (quantumMs: number) => {
  let time = 0;
  let captures = 0;
  let previousCaptures = 0;
  return {
    capture: () => {
      captures += 1;
      time += 1.5 * quantumMs;
    },
    now: () => {
      if (captures > 0 && captures === previousCaptures) {
        time = Math.ceil(time / (2 * quantumMs)) * 2 * quantumMs + 0.1 * quantumMs;
      } else if (captures === 0) {
        time += 0.01 * quantumMs;
      }
      previousCaptures = captures;
      const bucket = Math.floor(time / quantumMs);
      const remainder = time / quantumMs - bucket;
      const midpoint = bucket % 2 === 0 ? 0.05 : 0.95;
      return (bucket + (remainder >= midpoint ? 1 : 0)) * quantumMs;
    },
  };
};

describe('snapshot measurement', () => {
  it('reports batch-mean throughput separately from individual capture tails at a 1 ms resolution', () => {
    let clock = 0;
    let captures = 0;
    const timerQuantum = snapshotTimerQuantumForUserAgent('Mozilla/5.0 Firefox/140.0');
    const result = measureSnapshots(
      () => {
        captures += 1;
        clock += captures % 16 === 0 ? 8 : 0.05;
      },
      () => 0,
      {
        repeats: 50,
        now: () => {
          clock += 0.02;
          return Math.floor(clock);
        },
        timerQuantum,
      },
    );

    expect(result.batchCount).toBe(50);
    expect(result.batchSize).toBe(64);
    expect(result.observedTimerTickMs).toBe(1);
    expect(result.timerQuantum).toEqual({ browser: 'Firefox', quantumMs: 1 });
    expect(result.timerQuantumCrossCheckPassed).toBe(true);
    expect(result.batchMeanP50Ms).toBeLessThan(1);
    expect(result.batchMeanP95Ms).toBeCloseTo(0.546_875, 5);
    expect(result.batchMeanDurationsMs).toHaveLength(result.batchCount);
    expect(result.calibrationBatchMs).toBeGreaterThanOrEqual(result.targetBatchMs);
    expect(result.individualCaptureCount).toBe(result.batchCount * result.batchSize);
    expect(result.individualCaptureP95Ms).toBeGreaterThanOrEqual(8);
    expect(result.individualCaptureP95Ms).toBeLessThan(10);
    expect(result.individualCaptureMaxMs).toBeGreaterThanOrEqual(8);
    expect(result.individualCaptureMaxMs).toBeLessThan(10);
    expect(result.individualCaptureP95UpperBoundMs).toBe(result.individualCaptureP95Ms + 2);
    expect(result.individualCaptureMaxUpperBoundMs).toBe(result.individualCaptureMaxMs + 2);
    expect(result.netStateUnchanged).toBe(true);
  });

  it('uses the known browser quantum for jittered timestamp error bounds', () => {
    for (const { userAgent, quantumMs } of [
      { userAgent: 'Firefox/140.0', quantumMs: 1 },
      { userAgent: 'Chrome/130.0', quantumMs: 0.1 },
    ]) {
      const timerQuantum = snapshotTimerQuantumForUserAgent(userAgent);
      const clock = makeJitteredClock(quantumMs);
      const result = measureSnapshots(clock.capture, () => 0, {
        repeats: 50,
        now: clock.now,
        timerQuantum,
      });

      expect(timerQuantum?.quantumMs).toBe(quantumMs);
      expect(result.observedTimerTickMs).toBeCloseTo(quantumMs);
      expect(result.timerQuantumCrossCheckPassed).toBe(true);
      expect(result.individualCaptureP95Ms).toBe(0);
      expect(result.individualCaptureP95UpperBoundMs).toBeCloseTo(2 * quantumMs);
      expect(result.individualCaptureP95UpperBoundMs).toBeGreaterThan(1.5 * quantumMs);
    }
  });

  it('withholds a true-time bound when the observed tick is incompatible with the known browser quantum', () => {
    let clock = 0;
    const result = measureSnapshots(
      () => {
        clock += 0.5;
      },
      () => 0,
      {
        repeats: 1,
        now: () => {
          clock += 0.5;
          return Math.floor(clock);
        },
        timerQuantum: { browser: 'Chromium', quantumMs: 0.1 },
      },
    );

    expect(result.observedTimerTickMs).toBe(1);
    expect(result.timerQuantumCrossCheckPassed).toBe(false);
    expect(result.individualCaptureP95UpperBoundMs).toBeNull();
    expect(result.individualCaptureMaxUpperBoundMs).toBeNull();
  });

  it('withholds bounds when a jittered clock tick is just coarser than or twice the browser profile quantum', () => {
    for (const { userAgent, quantumMs } of [
      { userAgent: 'Firefox/140.0', quantumMs: 1 },
      { userAgent: 'Chrome/130.0', quantumMs: 0.1 },
    ]) {
      const timerQuantum = snapshotTimerQuantumForUserAgent(userAgent);
      for (const factor of [1.01, 2]) {
        const clock = makeJitteredClock(quantumMs * factor);
        const result = measureSnapshots(clock.capture, () => 0, {
          repeats: 1,
          now: clock.now,
          timerQuantum,
        });

        expect(result.observedTimerTickMs).toBeCloseTo(quantumMs * factor, 10);
        expect(result.timerQuantumCrossCheckPassed).toBe(false);
        expect(result.individualCaptureP95UpperBoundMs).toBeNull();
        expect(result.individualCaptureMaxUpperBoundMs).toBeNull();
      }
    }
  });

  it('reports net endpoint state as changed when captures leave a mutation', () => {
    let state = 0;
    let elapsedMs = 0;
    const result = measureSnapshots(
      () => {
        state += 1;
        elapsedMs += 0.5;
        return state;
      },
      () => state,
      {
        repeats: 1,
        now: () => {
          elapsedMs += 0.01;
          return Math.floor(elapsedMs);
        },
      },
    );
    expect(result.netStateUnchanged).toBe(false);
  });

  it('labels only net equality when a capture mutates and a later capture restores state', () => {
    let state = 0;
    let captures = 0;
    let elapsedMs = 0;
    const result = measureSnapshots(
      () => {
        captures += 1;
        if (captures === 2) {
          state = 1;
        }
        if (captures === 3) {
          state = 0;
        }
        elapsedMs += 0.25;
      },
      () => state,
      {
        repeats: 1,
        now: () => {
          elapsedMs += 0.02;
          return Math.floor(elapsedMs);
        },
      },
    );
    expect(result.netStateUnchanged).toBe(true);
    expect(captures).toBeGreaterThan(3);
  });

  it('compares exact numeric values without JSON normalization', () => {
    const state = { value: 0 };
    let elapsedMs = 0;
    const result = measureSnapshots(
      () => {
        state.value = -0;
        elapsedMs += 0.5;
      },
      () => ({ ...state }),
      {
        repeats: 1,
        now: () => {
          elapsedMs += 0.01;
          return Math.floor(elapsedMs);
        },
      },
    );
    expect(result.netStateUnchanged).toBe(false);
  });
});

describe('debug time control', () => {
  it('seeks the clock without replaying skipped simulation ticks', () => {
    const sim = new Simulation({ seed: 3 });
    sim.frame(2);
    sim.compression.active = true;
    sim.setDebugCalendarTime(24 * 3600 + 8 * 3600);
    expect(sim.calendar).toBe(32 * 3600);
    expect(sim.compression.active).toBe(false);
    expect(sim.compression.c).toBe(1);
    expect(sim.scheduler.snapshotState().systems[0]?.ticks).toBe(0);
  });
});

describe('controls card', () => {
  it('derives visible actions and labels from the effective registry rather than a copied key table', () => {
    const registry = new BindingRegistry([
      {
        id: 'fixture.action',
        description: 'Fixture action',
        contexts: ['inventory'],
        commands: [{ id: 'fixture.action', kind: 'press' }],
        defaults: [{ code: 'KeyJ' }],
      },
    ]);
    expect(controlsCardRows(registry)[0]).toEqual({
      id: 'fixture.action',
      keys: 'J',
      action: 'Fixture action (inventory)',
    });
    expect(registry.rebind('fixture.action', [{ code: 'KeyK' }])).toBeUndefined();
    expect(controlsCardRows(registry)[0]?.keys).toBe('K');
  });
});
