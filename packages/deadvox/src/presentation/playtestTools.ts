import type { MetricsLimits } from '../engine/content.ts';

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
  readonly gameClock: string;
  readonly playRealSeconds: number;
}

export type KeyItemEvent = 'looted' | 'read';
export type KeyItemMetric = Readonly<Partial<Record<KeyItemEvent, MetricStamp>>>;

export interface SessionMetricsV1 {
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly containersLooted: readonly ContainerLootMetric[];
  readonly deaths: readonly DeathMetric[];
  readonly compressedSeconds: number;
  readonly interruptions: number;
  readonly pocketUses: Readonly<Record<string, number>>;
  /** Real seconds counted by the selected attempt policy. */
  readonly playRealSeconds: number;
  /** Each beat's first arrival, in the order reached. */
  readonly beatsReached: Readonly<Record<string, MetricStamp>>;
  /** Each key item's first loot and first read. */
  readonly keyItems: Readonly<Record<string, KeyItemMetric>>;
}

const firstEntries = <T>(
  record: Readonly<Record<string, T>>,
  limit: number,
  copy: (value: T) => T,
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(record)
      .slice(0, limit)
      .map(([key, value]) => [key, copy(value)]),
  );

export class SessionMetrics {
  private readonly seed: number;
  private readonly limits: MetricsLimits;
  private readonly containersLooted: ContainerLootMetric[] = [];
  private readonly deaths: DeathMetric[] = [];
  private compressedSeconds = 0;
  private interruptions = 0;
  private readonly pocketUses: Record<string, number> = {};
  private playRealSeconds = 0;
  private readonly beatsReached: Record<string, MetricStamp> = {};
  private readonly keyItems: Record<string, KeyItemMetric> = {};

  constructor(seed: number, limits: MetricsLimits, initial?: SessionMetricsV1 | null) {
    this.seed = seed;
    this.limits = limits;
    if (initial?.schemaVersion === 1 && initial.seed === seed) {
      this.containersLooted.push(...initial.containersLooted.slice(-limits.history).map((entry) => ({ ...entry })));
      this.deaths.push(...initial.deaths.slice(-limits.history).map((entry) => ({ ...entry })));
      this.compressedSeconds = Math.max(0, initial.compressedSeconds);
      this.interruptions = Math.max(0, Math.floor(initial.interruptions));
      Object.assign(this.pocketUses, Object.fromEntries(Object.entries(initial.pocketUses).slice(-limits.pockets)));
      this.playRealSeconds = Math.max(0, initial.playRealSeconds);
      Object.assign(
        this.beatsReached,
        firstEntries(initial.beatsReached, limits.marks, (stamp) => ({ ...stamp })),
      );
      Object.assign(
        this.keyItems,
        firstEntries(initial.keyItems, limits.marks, (metric) => ({ ...metric })),
      );
    }
  }

  /** Keeps a beat's first arrival; later arrivals change nothing. */
  reachBeat(beat: string, gameClock: string): void {
    if (beat && !Object.hasOwn(this.beatsReached, beat) && Object.keys(this.beatsReached).length < this.limits.marks) {
      this.beatsReached[beat] = this.stamp(gameClock);
    }
  }

  /** Keeps a key item's first loot and first read; repeats change nothing. */
  recordKeyItem(item: string, event: KeyItemEvent, gameClock: string): void {
    const metric = Object.hasOwn(this.keyItems, item) ? this.keyItems[item] : undefined;
    if (!item || metric?.[event] || (!metric && Object.keys(this.keyItems).length >= this.limits.marks)) {
      return;
    }
    this.keyItems[item] = { ...metric, [event]: this.stamp(gameClock) };
  }

  private stamp(gameClock: string): MetricStamp {
    return { gameClock, playRealSeconds: this.playRealSeconds };
  }

  recordContainerLoot(container: string, handlingSeconds: number, uiSeconds: number): void {
    if (!container) {
      return;
    }
    if ([handlingSeconds, uiSeconds].some((seconds) => !Number.isFinite(seconds) || seconds < 0)) {
      return;
    }
    this.containersLooted.push({ container, handlingSeconds, uiSeconds });
    if (this.containersLooted.length > this.limits.history) {
      this.containersLooted.splice(0, this.containersLooted.length - this.limits.history);
    }
  }

  recordDeath(cause: string, survivedSeconds: number): void {
    if (!(cause && Number.isFinite(survivedSeconds)) || survivedSeconds < 0) {
      return;
    }
    this.deaths.push({ cause, survivedSeconds });
    if (this.deaths.length > this.limits.history) {
      this.deaths.splice(0, this.deaths.length - this.limits.history);
    }
  }

  frame(realSeconds: number, compressed: boolean, interrupted: boolean): void {
    if (Number.isFinite(realSeconds) && realSeconds > 0) {
      this.playRealSeconds += realSeconds;
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
      if (!(name in this.pocketUses) && Object.keys(this.pocketUses).length >= this.limits.pockets) {
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
      playRealSeconds: this.playRealSeconds,
      beatsReached: firstEntries(this.beatsReached, this.limits.marks, (stamp) => ({ ...stamp })),
      keyItems: firstEntries(this.keyItems, this.limits.marks, (metric) => ({ ...metric })),
    };
  }
}

export const metricsStorageKey = (seed: number): string => `skelly:playtest-metrics:v1:${seed}`;

export const persistMetrics = (metrics: SessionMetrics, storage: Pick<Storage, 'setItem'>): void => {
  storage.setItem(metricsStorageKey(metrics.toJSON().seed), JSON.stringify(metrics.toJSON()));
};

export const loadMetrics = (
  seed: number,
  storage: Pick<Storage, 'getItem'>,
  limits: MetricsLimits,
): SessionMetricsV1 | undefined => {
  const raw = storage.getItem(metricsStorageKey(seed));
  if (raw === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && isMetricsV1(parsed, seed)) {
      return normalizeMetrics(parsed, limits);
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
  'gameClock' in value &&
  typeof value.gameClock === 'string' &&
  'playRealSeconds' in value &&
  finiteNonNegative(value.playRealSeconds);

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
    finiteNonNegative(value.playRealSeconds) &&
    isRecordOf(value.beatsReached, isStamp) &&
    isRecordOf(value.keyItems, isKeyItemMetric)
  );
};

const normalizeMetrics = (value: SessionMetricsV1, limits: MetricsLimits): SessionMetricsV1 => ({
  ...value,
  containersLooted: value.containersLooted.slice(-limits.history),
  deaths: value.deaths.slice(-limits.history),
  pocketUses: Object.fromEntries(Object.entries(value.pocketUses).slice(-limits.pockets)),
  beatsReached: firstEntries(value.beatsReached, limits.marks, (stamp) => stamp),
  keyItems: firstEntries(value.keyItems, limits.marks, (metric) => metric),
});

export const metricsExportJson = (metrics: SessionMetrics): string => `${JSON.stringify(metrics.toJSON(), null, 2)}\n`;

/** A file a tester hands back; the F9 menu and the debug panel build the same one. */
export interface HandBackFile {
  readonly blob: Blob;
  readonly name: string;
}

export const metricsFile = (metrics: SessionMetrics): HandBackFile => ({
  blob: new Blob([metricsExportJson(metrics)], { type: 'application/json' }),
  name: `skelly-metrics-seed-${metrics.toJSON().seed}.json`,
});

export const replayFile = (bytes: Uint8Array, exportedAt: Date): HandBackFile => ({
  blob: new Blob([bytes.slice().buffer], { type: 'application/json' }),
  name: `skelly-replay-${exportedAt.toISOString().replaceAll(':', '-')}.json`,
});

/** A download link needs no clipboard, so saving works on a plain-http preview too. */
export interface SnapshotTimerQuantum {
  readonly browser: 'Firefox' | 'Chromium';
  readonly quantumMs: number;
}

export interface SnapshotMeasurementOptions {
  readonly repeats?: number;
  readonly now?: () => number;
  readonly timerQuantum?: SnapshotTimerQuantum | null;
}

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

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
};

interface SnapshotHistoryEntry {
  readonly at: number;
  readonly durationMs: number;
}

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

export const downloadFile = ({ blob, name }: HandBackFile): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
