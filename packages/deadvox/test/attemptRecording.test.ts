import { safeParse } from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import { AttemptPolicySchema } from '../src/core/schema/attemptPolicy.ts';
import { createAttemptRecording } from '../src/game/playtestObserver.ts';
import { type HandBackFile, metricsStorageKey, SessionMetrics } from '../src/game/playtestTools.ts';
import { makeAttemptPolicy } from './fixtures/attemptPolicy.ts';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
};

const frame = {
  realSeconds: 2,
  now: 1,
  paused: false,
  visible: true,
  compression: 1,
  interruption: undefined,
};

describe('content-selected attempt recording', () => {
  it('creates no recorder and never accesses storage without a row policy', () => {
    const storage = vi.fn(() => {
      throw new Error('rowless runs must not access metrics storage');
    });
    expect(createAttemptRecording(undefined, 41, storage)).toBeUndefined();
    expect(storage).not.toHaveBeenCalled();
  });

  it('resumes and writes only when the selected row permits each operation', () => {
    const storage = memoryStorage();
    const policy = makeAttemptPolicy({ persist: true });
    const previous = new SessionMetrics(41, policy.limits);
    previous.recordDeath('previous fixture attempt', 7);
    storage.data.set(metricsStorageKey(41), JSON.stringify(previous.toJSON()));

    const fresh = createAttemptRecording(policy, 41, () => storage)!;
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(fresh.metrics.toJSON().deaths).toEqual([]);
    fresh.metrics.recordDeath('new fixture attempt', 2);
    fresh.save();
    expect(storage.setItem).toHaveBeenCalledOnce();

    const resumed = createAttemptRecording(makeAttemptPolicy({ resumeStored: true }), 41, () => storage)!;
    expect(storage.getItem).toHaveBeenCalledOnce();
    expect(resumed.metrics.toJSON()).toEqual(fresh.metrics.toJSON());
    resumed.metrics.recordDeath('unsaved fixture attempt', 3);
    resumed.save();
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it('selects the export representation without eagerly capturing an attempt', async () => {
    const storage = vi.fn(() => {
      throw new Error('this row does not use storage');
    });
    const report: HandBackFile = {
      name: 'fixture-attempt.json',
      blob: new Blob(['{"fixture":true}'], { type: 'application/json' }),
    };
    const capture = vi.fn(() => report);
    const metrics = createAttemptRecording(makeAttemptPolicy(), 41, storage)!;
    metrics.metrics.recordPocketUse('fixture pocket');
    expect(JSON.parse(await metrics.file(capture).blob.text()).pocketUses).toEqual({ 'fixture pocket': 1 });
    expect(capture).not.toHaveBeenCalled();

    const attempt = createAttemptRecording(makeAttemptPolicy({ exportFormat: 'attempt' }), 41, storage)!;
    expect(attempt.file(capture)).toBe(report);
    expect(capture).toHaveBeenCalledOnce();
    attempt.save();
    expect(storage).not.toHaveBeenCalled();
  });

  it('uses row visibility, pause and compression eligibility for elapsed time', () => {
    const recording = createAttemptRecording(makeAttemptPolicy(), 41, memoryStorage)!;
    const { observer } = recording;
    observer.frame({ ...frame, compression: 3 });
    observer.frame({ ...frame, now: 2, paused: true, compression: 4 });
    observer.frame({ ...frame, now: 3, visible: false, compression: 4 });
    observer.frame({ ...frame, now: 4, compression: 4 });
    expect(recording.metrics.toJSON()).toMatchObject({ playRealSeconds: 4, compressedSeconds: 2 });

    const inclusive = createAttemptRecording(
      makeAttemptPolicy({ countPaused: true, countHidden: true }),
      41,
      memoryStorage,
    )!;
    inclusive.observer.frame({ ...frame, paused: true, visible: false, compression: 4 });
    expect(inclusive.metrics.toJSON()).toMatchObject({ playRealSeconds: 2, compressedSeconds: 2 });
  });

  it('uses the row interval and interruption trigger rather than a global save schedule', () => {
    const interruptible = createAttemptRecording(makeAttemptPolicy(), 41, memoryStorage)!.observer;
    expect(interruptible.frame({ ...frame, compression: 4 })).toBe(false);
    expect(interruptible.frame({ ...frame, now: 2, interruption: 'cancelled:fixture' })).toBe(true);
    expect(interruptible.frame({ ...frame, now: 21 })).toBe(false);
    expect(interruptible.frame({ ...frame, now: 22 })).toBe(true);

    const periodic = createAttemptRecording(makeAttemptPolicy({ persistOnInterruption: false }), 41, memoryStorage)!;
    periodic.observer.frame({ ...frame, compression: 4 });
    expect(periodic.observer.frame({ ...frame, now: 2, interruption: 'cancelled:fixture' })).toBe(false);
    expect(periodic.observer.frame({ ...frame, now: 19 })).toBe(false);
    expect(periodic.observer.frame({ ...frame, now: 20 })).toBe(true);
    expect(periodic.metrics.toJSON().interruptions).toBe(1);
  });

  it('keeps storage failures outside the play loop', () => {
    const recording = createAttemptRecording(makeAttemptPolicy({ resumeStored: true, persist: true }), 41, () => {
      throw new Error('storage disabled');
    })!;
    recording.metrics.recordDeath('fixture', 1);
    expect(() => recording.save()).not.toThrow();
    expect(recording.metrics.toJSON().deaths).toHaveLength(1);
  });

  it('admits complete authored policies but does not manufacture missing fields or invalid bounds', () => {
    expect(safeParse(AttemptPolicySchema, makeAttemptPolicy()).success).toBe(true);
    const { persist: _persist, ...incomplete } = makeAttemptPolicy();
    for (const invalid of [
      incomplete,
      makeAttemptPolicy({ compressionThreshold: 0 }),
      makeAttemptPolicy({ persistIntervalRealMs: Number.POSITIVE_INFINITY }),
      makeAttemptPolicy({ limits: { history: 0, pockets: 1, marks: 1 } }),
    ]) {
      expect(safeParse(AttemptPolicySchema, invalid).success).toBe(false);
    }
  });
});
