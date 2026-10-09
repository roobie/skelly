export interface ContainerLootMetric {
  readonly container: string;
  readonly handlingSeconds: number;
  readonly uiSeconds: number;
}

export interface DeathMetric {
  readonly cause: string;
  readonly survivedSeconds: number;
}

/** When something first happened: the game clock, and the play seconds by then. */
export interface MetricStamp {
  readonly gameTime: string;
  readonly playSeconds: number;
}

export type KeyItemEvent = 'looted' | 'read';
export type KeyItemMetric = Readonly<Partial<Record<KeyItemEvent, MetricStamp>>>;

const METRICS_HISTORY_LIMIT = 512;
const POCKET_KEY_LIMIT = 128;
const MARK_KEY_LIMIT = 128;

export interface SessionMetricsV1 {
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly containersLooted: readonly ContainerLootMetric[];
  readonly deaths: readonly DeathMetric[];
  readonly compressedSeconds: number;
  readonly interruptions: number;
  readonly pocketUses: Readonly<Record<string, number>>;
  /** Real seconds of unpaused, visible play. */
  readonly playSeconds: number;
  /** Each beat's first arrival, in the order reached. */
  readonly beatsReached: Readonly<Record<string, MetricStamp>>;
  /** Each key item's first loot and first read. */
  readonly keyItems: Readonly<Record<string, KeyItemMetric>>;
}

const firstEntries = <T>(record: Readonly<Record<string, T>>, copy: (value: T) => T): Record<string, T> =>
  Object.fromEntries(
    Object.entries(record)
      .slice(0, MARK_KEY_LIMIT)
      .map(([key, value]) => [key, copy(value)]),
  );

export class SessionMetrics {
  private readonly seed: number;
  private readonly containersLooted: ContainerLootMetric[] = [];
  private readonly deaths: DeathMetric[] = [];
  private compressedSeconds = 0;
  private interruptions = 0;
  private readonly pocketUses: Record<string, number> = {};
  private playSeconds = 0;
  private readonly beatsReached: Record<string, MetricStamp> = {};
  private readonly keyItems: Record<string, KeyItemMetric> = {};

  constructor(seed: number, initial?: SessionMetricsV1 | null) {
    this.seed = seed;
    if (initial?.schemaVersion === 1 && initial.seed === seed) {
      this.containersLooted.push(
        ...initial.containersLooted.slice(-METRICS_HISTORY_LIMIT).map((entry) => ({ ...entry })),
      );
      this.deaths.push(...initial.deaths.slice(-METRICS_HISTORY_LIMIT).map((entry) => ({ ...entry })));
      this.compressedSeconds = Math.max(0, initial.compressedSeconds);
      this.interruptions = Math.max(0, Math.floor(initial.interruptions));
      Object.assign(this.pocketUses, Object.fromEntries(Object.entries(initial.pocketUses).slice(-POCKET_KEY_LIMIT)));
      this.playSeconds = Math.max(0, initial.playSeconds);
      Object.assign(
        this.beatsReached,
        firstEntries(initial.beatsReached, (stamp) => ({ ...stamp })),
      );
      Object.assign(
        this.keyItems,
        firstEntries(initial.keyItems, (metric) => ({ ...metric })),
      );
    }
  }

  /** Keeps a beat's first arrival; later arrivals change nothing. */
  reachBeat(beat: string, gameTime: string): void {
    if (beat && !Object.hasOwn(this.beatsReached, beat) && Object.keys(this.beatsReached).length < MARK_KEY_LIMIT) {
      this.beatsReached[beat] = this.stamp(gameTime);
    }
  }

  /** Keeps a key item's first loot and first read; repeats change nothing. */
  recordKeyItem(item: string, event: KeyItemEvent, gameTime: string): void {
    const metric = Object.hasOwn(this.keyItems, item) ? this.keyItems[item] : undefined;
    if (!item || metric?.[event] || (!metric && Object.keys(this.keyItems).length >= MARK_KEY_LIMIT)) {
      return;
    }
    this.keyItems[item] = { ...metric, [event]: this.stamp(gameTime) };
  }

  private stamp(gameTime: string): MetricStamp {
    return { gameTime, playSeconds: this.playSeconds };
  }

  recordContainerLoot(container: string, handlingSeconds: number, uiSeconds: number): void {
    if (!container) {
      return;
    }
    if ([handlingSeconds, uiSeconds].some((seconds) => !Number.isFinite(seconds) || seconds < 0)) {
      return;
    }
    this.containersLooted.push({ container, handlingSeconds, uiSeconds });
    if (this.containersLooted.length > METRICS_HISTORY_LIMIT) {
      this.containersLooted.splice(0, this.containersLooted.length - METRICS_HISTORY_LIMIT);
    }
  }

  recordDeath(cause: string, survivedSeconds: number): void {
    if (!(cause && Number.isFinite(survivedSeconds)) || survivedSeconds < 0) {
      return;
    }
    this.deaths.push({ cause, survivedSeconds });
    if (this.deaths.length > METRICS_HISTORY_LIMIT) {
      this.deaths.splice(0, this.deaths.length - METRICS_HISTORY_LIMIT);
    }
  }

  frame(realSeconds: number, compressed: boolean, interrupted: boolean): void {
    if (Number.isFinite(realSeconds) && realSeconds > 0) {
      this.playSeconds += realSeconds;
    }
    if (compressed) {
      this.compressedSeconds += Math.max(0, realSeconds);
    }
    if (interrupted) {
      this.interruptions += 1;
    }
  }

  recordPocketUse(name: string): void {
    if (name) {
      if (!(name in this.pocketUses) && Object.keys(this.pocketUses).length >= POCKET_KEY_LIMIT) {
        return;
      }
      this.pocketUses[name] = (this.pocketUses[name] ?? 0) + 1;
    }
  }

  toJSON(): SessionMetricsV1 {
    return {
      schemaVersion: 1,
      seed: this.seed,
      containersLooted: this.containersLooted.map((entry) => ({ ...entry })),
      deaths: this.deaths.map((entry) => ({ ...entry })),
      compressedSeconds: this.compressedSeconds,
      interruptions: this.interruptions,
      pocketUses: { ...this.pocketUses },
      playSeconds: this.playSeconds,
      beatsReached: firstEntries(this.beatsReached, (stamp) => ({ ...stamp })),
      keyItems: firstEntries(this.keyItems, (metric) => ({ ...metric })),
    };
  }
}

export const metricsStorageKey = (seed: number): string => `deadvox:playtest-metrics:v1:${seed}`;

export const persistMetrics = (metrics: SessionMetrics, storage: Pick<Storage, 'setItem'>): void => {
  storage.setItem(metricsStorageKey(metrics.toJSON().seed), JSON.stringify(metrics.toJSON()));
};

export const loadMetrics = (seed: number, storage: Pick<Storage, 'getItem'>): SessionMetricsV1 | undefined => {
  const raw = storage.getItem(metricsStorageKey(seed));
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && isMetricsV1(parsed, seed)) {
      return normalizeMetrics(parsed);
    }
  } catch {
    // A corrupt local metrics file should never prevent play.
  }
  return undefined;
};

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isRecordOf = (value: unknown, entry: (item: unknown) => boolean): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every(entry);

const isStamp = (value: unknown): value is MetricStamp =>
  typeof value === 'object' &&
  value !== null &&
  'gameTime' in value &&
  typeof value.gameTime === 'string' &&
  'playSeconds' in value &&
  finiteNonNegative(value.playSeconds);

const isKeyItemMetric = (value: unknown): value is KeyItemMetric =>
  isRecordOf(value, isStamp) && Object.keys(value as object).every((event) => event === 'looted' || event === 'read');

const isMetricsV1 = (input: unknown, seed: number): input is SessionMetricsV1 => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const value = input as Record<string, unknown>;
  return (
    value.schemaVersion === 1 &&
    value.seed === seed &&
    Number.isSafeInteger(seed) &&
    seed >= 0 &&
    Array.isArray(value.containersLooted) &&
    value.containersLooted.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'container' in entry &&
        typeof entry.container === 'string' &&
        entry.container.length > 0 &&
        'handlingSeconds' in entry &&
        finiteNonNegative(entry.handlingSeconds) &&
        'uiSeconds' in entry &&
        finiteNonNegative(entry.uiSeconds),
    ) &&
    Array.isArray(value.deaths) &&
    value.deaths.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'cause' in entry &&
        typeof entry.cause === 'string' &&
        entry.cause.length > 0 &&
        'survivedSeconds' in entry &&
        finiteNonNegative(entry.survivedSeconds),
    ) &&
    finiteNonNegative(value.compressedSeconds) &&
    Number.isSafeInteger(value.interruptions) &&
    (value.interruptions as number) >= 0 &&
    typeof value.pocketUses === 'object' &&
    value.pocketUses !== null &&
    !Array.isArray(value.pocketUses) &&
    Object.values(value.pocketUses).every((count) => Number.isSafeInteger(count) && (count as number) >= 0) &&
    finiteNonNegative(value.playSeconds) &&
    isRecordOf(value.beatsReached, isStamp) &&
    isRecordOf(value.keyItems, isKeyItemMetric)
  );
};

const normalizeMetrics = (value: SessionMetricsV1): SessionMetricsV1 => ({
  ...value,
  containersLooted: value.containersLooted.slice(-METRICS_HISTORY_LIMIT),
  deaths: value.deaths.slice(-METRICS_HISTORY_LIMIT),
  pocketUses: Object.fromEntries(Object.entries(value.pocketUses).slice(-POCKET_KEY_LIMIT)),
  beatsReached: firstEntries(value.beatsReached, (stamp) => stamp),
  keyItems: firstEntries(value.keyItems, (metric) => metric),
});

export const metricsExportJson = (metrics: SessionMetrics): string => `${JSON.stringify(metrics.toJSON(), null, 2)}\n`;

/** A file a tester hands back; the F9 menu and the debug panel build the same one. */
export interface HandBackFile {
  readonly blob: Blob;
  readonly name: string;
}

export const metricsFile = (metrics: SessionMetrics): HandBackFile => ({
  blob: new Blob([metricsExportJson(metrics)], { type: 'application/json' }),
  name: `deadvox-metrics-seed-${metrics.toJSON().seed}.json`,
});

export const replayFile = (bytes: Uint8Array, exportedAt: Date): HandBackFile => ({
  blob: new Blob([bytes.slice().buffer], { type: 'application/json' }),
  name: `deadvox-replay-${exportedAt.toISOString().replaceAll(':', '-')}.json`,
});

/** A download link needs no clipboard, so saving works on a plain-http preview too. */
export const downloadFile = ({ blob, name }: HandBackFile): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

export interface SnapshotTimerQuantum {
  readonly browser: 'Firefox' | 'Chromium';
  readonly quantumMs: number;
}

export interface SnapshotMeasurementOptions {
  readonly repeats?: number;
  readonly now?: () => number;
  readonly timerQuantum?: SnapshotTimerQuantum | null;
}

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

export interface SnapshotMeasurement {
  /** Number of timed batches; each batch contains `batchSize` snapshot captures. */
  readonly batchCount: number;
  readonly batchSize: number;
  /** Smallest positive increment observed while probing the injected monotonic clock; not a timestamp-error bound. */
  readonly observedTimerTickMs: number | null;
  /** Browser-specific known quantum used for the timestamp-error bound, or null for an unknown browser. */
  readonly timerQuantum: SnapshotTimerQuantum | null;
  readonly timerQuantumCrossCheckPassed: boolean;
  readonly targetBatchMs: number;
  readonly calibrationBatchMs: number;
  /** Percentiles of batch durations divided by batch size: a throughput statistic. */
  readonly batchMeanP50Ms: number;
  readonly batchMeanP95Ms: number;
  readonly batchMeanDurationsMs: readonly number[];
  /** Separately timed per-capture sample used for tail observations. */
  readonly individualCaptureCount: number;
  readonly individualCaptureP95Ms: number;
  readonly individualCaptureMaxMs: number;
  /** Strict upper bounds using two known-quantum timestamp errors; unavailable if unknown or cross-check fails. */
  readonly individualCaptureP95UpperBoundMs: number | null;
  readonly individualCaptureMaxUpperBoundMs: number | null;
  /** Compares live-state endpoints; it does not check purity of each individual call. */
  readonly netStateUnchanged: boolean;
}

interface SnapshotHistoryEntry {
  readonly at: number;
  readonly durationMs: number;
}

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
export const SNAPSHOT_BATCH_TARGET_MS = 20;
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

/** Stores the latest autosave/on-demand snapshot costs for the session readout. */
export interface SnapshotHistory {
  add: (durationMs: number, at?: number) => void;
  readonly lastMs: number | undefined;
  readonly p95Ms: number;
  readonly count: number;
}

export const createSnapshotHistory = (limit = 512): SnapshotHistory => {
  const entries: SnapshotHistoryEntry[] = [];
  const maximum = Math.max(1, Math.floor(limit));
  return {
    add(durationMs, at = Date.now()) {
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        return;
      }
      entries.push({ at, durationMs });
      if (entries.length > maximum) {
        entries.splice(0, entries.length - maximum);
      }
    },
    get lastMs() {
      return entries.at(-1)?.durationMs;
    },
    get p95Ms() {
      return percentile(
        entries.map(({ durationMs }) => durationMs),
        0.95,
      );
    },
    get count() {
      return entries.length;
    },
  };
};
