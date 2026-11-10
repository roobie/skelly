import type { Session } from '../../../engine/src/game/entries/session.ts';
import type {
  SnapshotMeasurement,
  SnapshotMeasurementOptions,
  SnapshotTimerQuantum,
} from '../presentation/playtestTools.ts';

const FIREFOX_USER_AGENT = /Firefox\//;
const CHROMIUM_USER_AGENT = /(?:Headless)?Chrome\/|Chromium\//;

/** Default browser-profile quanta (Firefox privacy reduction 1 ms; Chromium TimeClamper 0.1 ms); observed tick is a cross-check. */
export const snapshotTimerQuantumForUserAgent = (userAgent: string): SnapshotTimerQuantum | null => {
  if (FIREFOX_USER_AGENT.test(userAgent)) {
    return { browser: 'Firefox', quantumMs: 1 };
  }
  if (CHROMIUM_USER_AGENT.test(userAgent)) {
    return { browser: 'Chromium', quantumMs: 0.1 };
  }
  return null;
};

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
};

const equalArray = (
  left: readonly unknown[],
  right: readonly unknown[],
  seen: WeakMap<object, WeakSet<object>>,
): boolean => left.length === right.length && left.every((value, index) => exactStateEqual(value, right[index], seen));

const equalMap = (
  left: Map<unknown, unknown>,
  right: Map<unknown, unknown>,
  seen: WeakMap<object, WeakSet<object>>,
): boolean => {
  if (left.size !== right.size) {
    return false;
  }
  const rightEntries = [...right.entries()];
  return [...left.entries()].every(
    ([key, value], index) =>
      exactStateEqual(key, rightEntries[index]?.[0], seen) && exactStateEqual(value, rightEntries[index]?.[1], seen),
  );
};

const equalSet = (left: Set<unknown>, right: Set<unknown>, seen: WeakMap<object, WeakSet<object>>): boolean =>
  left.size === right.size && equalArray([...left], [...right], seen);

const equalProperties = (left: object, right: object, seen: WeakMap<object, WeakSet<object>>): boolean => {
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        exactStateEqual(
          (left as Record<PropertyKey, unknown>)[key],
          (right as Record<PropertyKey, unknown>)[key],
          seen,
        ),
    )
  );
};

const exactStateEqual = (a: unknown, b: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const paired = seen.get(a) ?? new WeakSet<object>();
  if (paired.has(b)) {
    return true;
  }
  paired.add(b);
  seen.set(a, paired);
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    return false;
  }
  if (Array.isArray(a)) {
    return Array.isArray(b) && equalArray(a, b, seen);
  }
  if (a instanceof Map) {
    return b instanceof Map && equalMap(a, b, seen);
  }
  if (a instanceof Set) {
    return b instanceof Set && equalSet(a, b, seen);
  }
  return equalProperties(a, b, seen);
};

/** Each sample must span many clock ticks so coarse browser timers still resolve per-capture cost. */
const SNAPSHOT_BATCH_TARGET_MS = 20;
const MAX_SNAPSHOT_BATCH_SIZE = 65_536;
const MAX_INDIVIDUAL_CAPTURE_SAMPLES = 8192;
const MAX_TIMER_PROBE_READS = 100_000;
const MIN_TIMER_PROBE_TICKS = 8;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

// Differences of performance.now() readings can exceed an ulp-scaled tolerance; whole nanoseconds remain far below browser quanta.
const observedTickFitsQuantum = (observedTickMs: number | null, quantumMs: number): boolean =>
  observedTickMs !== null &&
  Number.isFinite(quantumMs) &&
  quantumMs > 0 &&
  Math.round(observedTickMs * NANOSECONDS_PER_MILLISECOND) <= quantumMs * NANOSECONDS_PER_MILLISECOND;

const detectMinimumTimerTickMs = (now: () => number): number | null => {
  let previous = now();
  let minimum = Number.POSITIVE_INFINITY;
  let ticks = 0;
  for (let reads = 0; reads < MAX_TIMER_PROBE_READS && ticks < MIN_TIMER_PROBE_TICKS; reads++) {
    const current = now();
    const delta = current - previous;
    if (delta > 0) {
      minimum = Math.min(minimum, delta);
      previous = current;
      ticks += 1;
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
};

/**
 * Batch timings estimate capture throughput with low clock overhead. A separate pass times individual captures for
 * tail observations; it is not folded into the batch means. The purity check compares live-state endpoints only.
 */
export const measureSnapshots = (
  snapshot: () => unknown,
  liveState: () => unknown,
  options: SnapshotMeasurementOptions = {},
): SnapshotMeasurement => {
  const { repeats = 50, now = () => performance.now(), timerQuantum = null } = options;
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    throw new Error(`Invalid snapshot repetitions: ${repeats}`);
  }
  const before = liveState();
  const observedTimerTickMs = detectMinimumTimerTickMs(now);
  const crossCheckedTimerQuantumMs =
    timerQuantum !== null && observedTickFitsQuantum(observedTimerTickMs, timerQuantum.quantumMs)
      ? timerQuantum.quantumMs
      : null;
  const timerQuantumCrossCheckPassed = crossCheckedTimerQuantumMs !== null;
  const targetBatchMs = Math.max(SNAPSHOT_BATCH_TARGET_MS, (observedTimerTickMs ?? 1) * 20);
  const timeBatch = (captureCount: number): number => {
    const start = now();
    for (let i = 0; i < captureCount; i++) {
      snapshot();
    }
    return Math.max(0, now() - start);
  };

  let batchSize = 1;
  let calibrationBatchMs = timeBatch(batchSize);
  while (calibrationBatchMs < targetBatchMs && batchSize < MAX_SNAPSHOT_BATCH_SIZE) {
    batchSize = Math.min(batchSize * 2, MAX_SNAPSHOT_BATCH_SIZE);
    calibrationBatchMs = timeBatch(batchSize);
  }
  if (calibrationBatchMs < targetBatchMs) {
    throw new Error(`Snapshot clock did not span ${targetBatchMs} ms within ${MAX_SNAPSHOT_BATCH_SIZE} captures`);
  }

  const batchMeanDurationsMs: number[] = [];
  for (let i = 0; i < repeats; i++) {
    batchMeanDurationsMs.push(timeBatch(batchSize) / batchSize);
  }

  const individualCaptureCount = Math.min(repeats * batchSize, MAX_INDIVIDUAL_CAPTURE_SAMPLES);
  const individualCaptureDurationsMs: number[] = [];
  for (let i = 0; i < individualCaptureCount; i++) {
    const start = now();
    snapshot();
    individualCaptureDurationsMs.push(Math.max(0, now() - start));
  }
  const individualCaptureP95Ms = percentile(individualCaptureDurationsMs, 0.95);
  const individualCaptureMaxMs = Math.max(...individualCaptureDurationsMs);
  const after = liveState();
  // Each timestamp is within r of true time, so a duration's strict upper bound is observed + 2r.
  const individualCaptureP95UpperBoundMs =
    crossCheckedTimerQuantumMs === null ? null : individualCaptureP95Ms + 2 * crossCheckedTimerQuantumMs;
  const individualCaptureMaxUpperBoundMs =
    crossCheckedTimerQuantumMs === null ? null : individualCaptureMaxMs + 2 * crossCheckedTimerQuantumMs;

  return {
    batchCount: repeats,
    batchSize,
    observedTimerTickMs,
    timerQuantum,
    timerQuantumCrossCheckPassed,
    targetBatchMs,
    calibrationBatchMs,
    batchMeanP50Ms: percentile(batchMeanDurationsMs, 0.5),
    batchMeanP95Ms: percentile(batchMeanDurationsMs, 0.95),
    batchMeanDurationsMs,
    individualCaptureCount,
    individualCaptureP95Ms,
    individualCaptureMaxMs,
    individualCaptureP95UpperBoundMs,
    individualCaptureMaxUpperBoundMs,
    netStateUnchanged: exactStateEqual(before, after),
  };
};

const inspectLiveSession = (session: Session): unknown => ({
  simulation: {
    state: session.sim.snapshotState(),
    paused: session.sim.paused,
    godMode: session.sim.godMode,
  },
  body: structuredClone(session.body),
  worldColumns: session.worldColumns(),
  inventory: session.inventory.snapshotState(),
  quickbar: session.quickbar.snapshotState(session.inventory),
  searching: [...session.entities.all].map((entity) => [entity.uid, entity.searched, session.searching(entity)]),
  jobs: session.queue.jobs.map((job) => structuredClone(job)),
  actors: session.actors.snapshotState(),
  spawner: session.spawner.snapshotState(),
  longAction: session.sim.actions.snapshotState(),
  survival: session.survival.snapshotState(),
  playerAudio: structuredClone(session.playerAudio),
  audio: session.audioState(),
});

export const measureSessionSnapshot = (
  snapshot: () => unknown,
  session: Session,
  repeats = 50,
): SnapshotMeasurement => {
  try {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return measureSnapshots(snapshot, () => inspectLiveSession(session), {
      repeats,
      now: () => performance.now(),
      timerQuantum: snapshotTimerQuantumForUserAgent(userAgent),
    });
  } catch {
    // A diagnostic fault must not interrupt play.
    return {
      batchCount: 0,
      batchSize: 0,
      observedTimerTickMs: null,
      timerQuantum: null,
      timerQuantumCrossCheckPassed: false,
      targetBatchMs: SNAPSHOT_BATCH_TARGET_MS,
      calibrationBatchMs: 0,
      batchMeanP50Ms: 0,
      batchMeanP95Ms: 0,
      batchMeanDurationsMs: [],
      individualCaptureCount: 0,
      individualCaptureP95Ms: 0,
      individualCaptureMaxMs: 0,
      individualCaptureP95UpperBoundMs: null,
      individualCaptureMaxUpperBoundMs: null,
      netStateUnchanged: false,
    };
  }
};
