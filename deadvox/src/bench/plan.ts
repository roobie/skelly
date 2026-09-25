// Which configurations the benchmark runs, and where results are kept between the
// page reloads that separate runs (each run starts from a fresh page and GPU state).

import type { StorageStats } from '../core/storage.ts';
import type { FrameStats, SampleStats } from './stats.ts';

export interface BenchConfig {
  blockSize: number;
  radiusM: number;
}

/** The game's 0.5 m blocks at each view distance on offer. Compare sizes with `?plan=1:96,0.5:96`. */
export const DEFAULT_PLAN: readonly BenchConfig[] = [64, 96, 128].map((radiusM) => ({ blockSize: 0.5, radiusM }));

/** Parses "1:64,0.5:96"; returns undefined if anything is malformed. */
export const parsePlan = (text: string): BenchConfig[] | undefined => {
  const plan = text.split(',').map((part) => {
    const [block, radius] = part.split(':').map(Number);
    return { blockSize: block ?? Number.NaN, radiusM: radius ?? Number.NaN };
  });
  const valid = plan.every(
    ({ blockSize, radiusM }) => [1, 0.5, 0.25].includes(blockSize) && radiusM >= 16 && radiusM <= 512,
  );
  return valid && plan.length > 0 ? plan : undefined;
};

export const formatPlan = (plan: readonly BenchConfig[]): string =>
  plan.map(({ blockSize, radiusM }) => `${blockSize}:${radiusM}`).join(',');

/** CPU milliseconds per frame spent streaming, simulating and submitting the render (not GPU time). */
export interface WorkStats {
  work: SampleStats;
}

export interface MovingStats extends FrameStats, WorkStats {
  /** Most columns near the player still unmeshed in any frame. */
  holesMax: number;
  /** Fraction of frames with any unmeshed column near the player. */
  holeFraction: number;
}

export interface RunResult {
  blockSize: number;
  radiusM: number;
  radiusChunks: number;
  load: { seconds: number; timedOut: boolean };
  memory: StorageStats;
  gen: SampleStats;
  meshMs: SampleStats;
  meshTriangles: SampleStats;
  look: FrameStats & WorkStats & { drawCalls: number; triangles: number };
  jog: MovingStats;
  sprint: MovingStats;
  /** The tab was hidden during the run, so its frame times are unreliable. */
  interrupted: boolean;
}

export interface Environment {
  userAgent: string;
  cores: number;
  /** GiB, rounded by the browser; Chromium only. */
  deviceMemory?: number;
  gpu: string;
  canvas: string;
  pixelRatio: number;
}

export interface BenchRecord {
  startedAt: string;
  quick: boolean;
  env?: Environment;
  runs: RunResult[];
}

const KEY = 'deadvox.bench.v2';

// Storage can be unavailable (private windows, blocked site data); callers show why.
export const loadRecord = (): BenchRecord | undefined => {
  try {
    const text = globalThis.localStorage.getItem(KEY);
    return text === null ? undefined : (JSON.parse(text) as BenchRecord);
  } catch {
    return undefined;
  }
};

export const saveRecord = (record: BenchRecord): boolean => {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
};
