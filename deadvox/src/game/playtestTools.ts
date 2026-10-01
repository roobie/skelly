export interface ContainerLootMetric {
  readonly container: string;
  readonly handlingSeconds: number;
  readonly uiSeconds: number;
}

export interface DeathMetric {
  readonly cause: string;
  readonly survivedSeconds: number;
}

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
      this.containersLooted.push(...initial.containersLooted.map((entry) => ({ ...entry })));
      this.deaths.push(...initial.deaths.map((entry) => ({ ...entry })));
      this.compressedSeconds = Math.max(0, initial.compressedSeconds);
      this.interruptions = Math.max(0, Math.floor(initial.interruptions));
      Object.assign(this.pocketUses, initial.pocketUses);
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
  }

  recordDeath(cause: string, survivedSeconds: number): void {
    this.deaths.push({ cause, survivedSeconds: Math.max(0, survivedSeconds) });
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
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'schemaVersion' in parsed &&
      parsed.schemaVersion === 1 &&
      'seed' in parsed &&
      parsed.seed === seed
    ) {
      return parsed as SessionMetricsV1;
    }
  } catch {
    // A corrupt local metrics file should never prevent play.
  }
  return undefined;
};

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

/** A side-effect-free timed call to a pure snapshot producer. Hashes bracket the run. */
export const measureSnapshots = (
  snapshot: () => unknown,
  stateHash: () => string,
  repeats = 50,
  now: () => number = () => performance.now(),
): SnapshotMeasurement => {
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    throw new Error(`Invalid snapshot repetitions: ${repeats}`);
  }
  const before = stateHash();
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const start = now();
    snapshot();
    samples.push(Math.max(0, now() - start));
  }
  const after = stateHash();
  return {
    samples: repeats,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    durationsMs: samples,
    stateUnchanged: before === after,
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
