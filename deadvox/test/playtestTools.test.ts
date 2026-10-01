import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/sim.ts';
import { controlsCardRows } from '../src/game/controls.ts';
import { PLAYER_CONTROL_BINDINGS } from '../src/game/input.ts';
import {
  createSnapshotHistory,
  loadMetrics,
  measureSnapshots,
  metricsExportJson,
  metricsStorageKey,
  persistMetrics,
  SessionMetrics,
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

describe('snapshot measurement', () => {
  it('measures repeated pure snapshots and verifies the state hash is unchanged', () => {
    const state = { time: 5, entities: [1, 2] };
    let tick = 0;
    const result = measureSnapshots(
      () => structuredClone(state),
      () => JSON.stringify(state),
      20,
      () => {
        const current = tick;
        tick += 1;
        return current;
      },
    );
    expect(result.samples).toBe(20);
    expect(result.p50Ms).toBe(1);
    expect(result.p95Ms).toBe(1);
    expect(result.stateUnchanged).toBe(true);
    const history = createSnapshotHistory(4);
    for (const duration of result.durationsMs) {
      history.add(duration);
    }
    expect(history.lastMs).toBe(1);
    expect(history.count).toBe(4);
  });

  it('detects a snapshot producer that mutates state', () => {
    let state = 0;
    const result = measureSnapshots(
      () => {
        state += 1;
        return state;
      },
      () => state,
      1,
      () => 0,
    );
    expect(result.stateUnchanged).toBe(false);
  });

  it('compares exact numeric values without JSON normalization', () => {
    const state = { value: 0 };
    const result = measureSnapshots(
      () => {
        state.value = -0;
      },
      () => ({ ...state }),
      1,
      () => 0,
    );
    expect(result.stateUnchanged).toBe(false);
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
  it('is rendered from the actual input binding declarations', () => {
    const rows = controlsCardRows();
    expect(rows.map(({ keys }) => keys)).toContain('F9');
    expect(rows.map(({ keys }) => keys)).toContain('F4');
    expect(rows.map(({ keys }) => keys)).toContain('Tab');
    expect(rows.at(-1)?.action).toContain('E: Move to your best pocket');
  });

  it('derives the card label from the same remapped key code used by dispatch', () => {
    const remapped = PLAYER_CONTROL_BINDINGS.map((binding) =>
      binding.action === 'Interact with a door or furniture' ? { ...binding, codes: ['KeyJ'] as const } : binding,
    );
    const rows = controlsCardRows(remapped);
    expect(rows.find(({ action }) => action === 'Interact with a door or furniture')?.keys).toBe('J');
  });
});
