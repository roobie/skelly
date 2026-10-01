export interface ContainerLootMetric {
  readonly container: string;
  readonly handlingSeconds: number;
  readonly uiSeconds: number;
}

export interface DeathMetric {
  readonly cause: string;
  readonly survivedSeconds: number;
}

export const METRICS_HISTORY_LIMIT = 512;
export const POCKET_KEY_LIMIT = 128;

export interface SessionMetricsV1 {
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly containersLooted: readonly ContainerLootMetric[];
  readonly deaths: readonly DeathMetric[];
  readonly compressedSeconds: number;
  readonly interruptions: number;
  readonly pocketUses: Readonly<Record<string, number>>;
}

export class SessionMetrics {
  private readonly seed: number;
  private readonly containersLooted: ContainerLootMetric[] = [];
  private readonly deaths: DeathMetric[] = [];
  private compressedSeconds = 0;
  private interruptions = 0;
  private readonly pocketUses: Record<string, number> = {};

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
    }
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
    Object.values(value.pocketUses).every((count) => Number.isSafeInteger(count) && (count as number) >= 0)
  );
};

const normalizeMetrics = (value: SessionMetricsV1): SessionMetricsV1 => ({
  ...value,
  containersLooted: value.containersLooted.slice(-METRICS_HISTORY_LIMIT),
  deaths: value.deaths.slice(-METRICS_HISTORY_LIMIT),
  pocketUses: Object.fromEntries(Object.entries(value.pocketUses).slice(-POCKET_KEY_LIMIT)),
});

export const metricsExportJson = (metrics: SessionMetrics): string => `${JSON.stringify(metrics.toJSON(), null, 2)}\n`;

export interface SnapshotMeasurement {
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly durationsMs: readonly number[];
  readonly stateUnchanged: boolean;
}

export interface SnapshotHistoryEntry {
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

export const exactStateEqual = (a: unknown, b: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean => {
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

/** A side-effect-free timed call to a pure snapshot producer. Compares live state without serialization. */
export const measureSnapshots = (
  snapshot: () => unknown,
  liveState: () => unknown,
  repeats = 50,
  now: () => number = () => performance.now(),
): SnapshotMeasurement => {
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    throw new Error(`Invalid snapshot repetitions: ${repeats}`);
  }
  const before = liveState();
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const start = now();
    snapshot();
    samples.push(Math.max(0, now() - start));
  }
  const after = liveState();
  return {
    samples: repeats,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    durationsMs: samples,
    stateUnchanged: exactStateEqual(before, after),
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
