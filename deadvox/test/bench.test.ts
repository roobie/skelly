import { describe, expect, it } from 'vitest';
import {
  type BenchRecord,
  DEFAULT_PLAN,
  DEFAULT_SHAMBLER_COUNTS,
  formatPlan,
  parsePlan,
  parseShamblerCounts,
  parseShamblerSeed,
  type RunResult,
  type ShamblerRunResult,
} from '../src/bench/plan.ts';
import {
  HEADERS,
  markdownReport,
  markdownTable,
  resultRow,
  SHAMBLER_HEADERS,
  shamblerResultRow,
  shamblerSummary,
} from '../src/bench/report.ts';
import { benchRunFromUrl, nextUrl } from '../src/bench/run.ts';
import { shamblerRunFromUrl } from '../src/bench/shamblers.ts';
import { frameStats, percentile } from '../src/bench/stats.ts';
import { gameHours } from '../src/core/time.ts';

describe('bench stats', () => {
  it('takes nearest-rank percentiles', () => {
    const samples = [5, 1, 4, 2, 3];
    expect(percentile(samples, 0.5)).toBe(3);
    expect(percentile(samples, 0.95)).toBe(5);
    expect(percentile([], 0.5)).toBeNaN();
  });

  it('summarises frame times', () => {
    const stats = frameStats([10, 10, 20, 40]);
    expect(stats.fpsMean).toBeCloseTo(1000 / 20);
    expect(stats.msMax).toBe(40);
    expect(stats.slowFraction).toBe(0.5);
  });
});

describe('bench plan', () => {
  it('defaults and validates shambler benchmark counts, seed, and time', () => {
    expect(shamblerRunFromUrl(new URLSearchParams('bench=shamblers'))).toEqual({
      counts: [...DEFAULT_SHAMBLER_COUNTS],
      index: 0,
      seed: 1,
      time: '23:30',
      actors: 'detailed',
      post: false,
    });
    expect(
      shamblerRunFromUrl(new URLSearchParams('bench=shamblers&n=10,25&seed=77&time=21:15&i=1&actors=detailed')),
    ).toEqual({
      counts: [10, 25],
      index: 1,
      seed: 77,
      time: '21:15',
      actors: 'detailed',
      post: false,
    });
    expect(parseShamblerCounts('1,500')).toEqual([1, 500]);
    expect(parseShamblerSeed('-2147483648')).toBe(-2_147_483_648);
    expect(parseShamblerSeed('2147483647')).toBe(2_147_483_647);
    for (const nonsense of ['', '1.5', '2147483648', '-2147483649', '0x10', 'nope']) {
      expect(parseShamblerSeed(nonsense), nonsense).toBeUndefined();
    }
    for (const nonsense of ['', '0', '-1', '1.5', '501', '10,nope', '10,10']) {
      expect(parseShamblerCounts(nonsense), nonsense).toBeUndefined();
    }
    expect(shamblerRunFromUrl(new URLSearchParams('bench=shamblers&n=501'))).toBeUndefined();
    expect(shamblerRunFromUrl(new URLSearchParams('bench=shamblers&n=10&i=1'))).toBeUndefined();
    expect(shamblerRunFromUrl(new URLSearchParams('bench=shamblers&seed=nope'))).toBeUndefined();
    expect(shamblerRunFromUrl(new URLSearchParams('bench=shamblers&seed=2147483648'))).toBeUndefined();
    expect(shamblerRunFromUrl(new URLSearchParams('bench=shamblers&time=25:99'))).toBeUndefined();
  });

  it('keeps a valid time and carries the detailed population through each full phase run', () => {
    const run = benchRunFromUrl(new URLSearchParams('bench=1&time=23:30&shamblers=7&actors=detailed'));
    expect(run).toMatchObject({ time: '23:30', shamblers: 7 });
    expect(benchRunFromUrl(new URLSearchParams('bench=1&time=25:00')).time).toBeUndefined();
    const lightsOnly = benchRunFromUrl(new URLSearchParams('bench=1'));
    expect(lightsOnly.time).toBeUndefined();
    expect(benchRunFromUrl(new URLSearchParams(nextUrl(lightsOnly, 73))).shamblers).toBe(0);
    expect(new URLSearchParams(nextUrl(run, 73)).get('shamblers')).toBe('7');
    expect(benchRunFromUrl(new URLSearchParams('bench=1&shamblers=7,8')).shamblers).toBeUndefined();
  });

  it('runs 0.5 m blocks at 64, 96 and 128 m by default', () => {
    expect(formatPlan(DEFAULT_PLAN)).toBe('0.5:64,0.5:96,0.5:128');
  });

  it('round-trips through the URL and rejects nonsense', () => {
    expect(parsePlan(formatPlan(DEFAULT_PLAN))).toEqual(DEFAULT_PLAN);
    expect(parsePlan('0.5:96')).toEqual([{ blockSize: 0.5, radiusM: 96 }]);
    expect(parsePlan('0.3:96')).toBeUndefined();
    expect(parsePlan('1:9999')).toBeUndefined();
    expect(parsePlan('')).toBeUndefined();
  });
});

const ROW_START = /^\| 0\.5 m \| 96 m \|/;
const SHAMBLER_ROW_START = /^\| 25 \| – \| 12 \|/;

describe('bench report', () => {
  const frames = { frames: 10, fpsMean: 60, msMedian: 16.7, msP95: 17, msP99: 20, msMax: 25, slowFraction: 0.1 };
  const result: RunResult = {
    blockSize: 0.5,
    radiusM: 96,
    radiusChunks: 6,
    load: { seconds: 4.2, timedOut: false },
    memory: {
      chunks: 100,
      bytesStored: 40 * 65_536,
      uniform: 60,
      bytesFull: 100 * 65_536,
      bytesUniform: 40 * 65_536,
      bytesPalette: 1_048_576,
    },
    gen: { count: 1, median: 3, p95: 4 },
    meshMs: { count: 1, median: 2, p95: 5 },
    meshTriangles: { count: 1, median: 1234, p95: 2000 },
    look: { ...frames, work: { count: 10, median: 4, p95: 6 }, drawCalls: 300, triangles: 123_456 },
    jog: { ...frames, work: { count: 10, median: 5, p95: 7.5 }, holesMax: 0, holeFraction: 0 },
    sprint: { ...frames, work: { count: 10, median: 6, p95: 9 }, holesMax: 3, holeFraction: 0.2 },
    render: { count: 10, median: 3, p95: 4.5 },
    interrupted: false,
  };

  it('formats a row per run with one cell per header', () => {
    const row = resultRow(result);
    expect(row).toHaveLength(HEADERS.length);
    expect(row[4]).toBe('2.5 / 6.3 / 1.0');
    expect(row[8]).toBe('300 / 123');
    expect(row[10]).toBe('17.0 / 10% / 3');
    expect(row[11]).toBe('6.0 / 7.5 / 9.0');
    expect(row[12]).toBe('3.0 / 4.5');
  });

  it('formats one report cell per shambler header and a pasteable summary, defaulting missing actors info to boxes', () => {
    // No `actors`/`actorSync`/`draws`/`triangles` — a record from before those existed.
    const shambler: ShamblerRunResult = {
      n: 25,
      seed: 12,
      frame: { ...frames, msMedian: 16.5, msP95: 19, slowFraction: 0.2 },
      zombieTick: { count: 300, median: 0.4, p95: 0.8 },
      renderSubmit: { count: 900, median: 1.1, p95: 2.2 },
      holesMax: 3,
      holeFraction: 0.1,
      interrupted: false,
    };
    expect(shamblerResultRow(shambler)).toHaveLength(SHAMBLER_HEADERS.length);
    expect(shamblerResultRow(shambler)).toEqual([
      '25',
      '–',
      '12',
      'boxes',
      '16.5 / 19.0 / 20%',
      '0.4 / 0.8',
      '–',
      '–',
      '1.1 / 2.2',
      '–',
      '3 / 10%',
      'no',
    ]);
    expect(shamblerSummary([shambler])).toContain('N=25 active/background=–/– seed=12 actors=boxes');
    const report = markdownReport({ startedAt: 'now', quick: false, runs: [], shamblers: [shambler] });
    expect(report).toContain('Shambler summary: N=25 active/background=–/– seed=12 actors=boxes');
    expect(report.split('\n')[2]).toMatch(SHAMBLER_ROW_START);
  });

  it('shows actors, actor sync ms, and draws/triangles when a run recorded them', () => {
    const shambler: ShamblerRunResult = {
      n: 25,
      seed: 12,
      actors: 'detailed',
      frame: { ...frames, msMedian: 16.5, msP95: 19, slowFraction: 0.2 },
      zombieTick: { count: 300, median: 0.4, p95: 0.8 },
      actorSync: { count: 900, median: 2.3, p95: 4.1 },
      renderSubmit: { count: 900, median: 1.1, p95: 2.2 },
      draws: 12,
      triangles: 365_000,
      holesMax: 3,
      holeFraction: 0.1,
      interrupted: false,
    };
    const row = shamblerResultRow(shambler);
    expect(row[3]).toBe('detailed');
    expect(row[7]).toBe('2.3 / 4.1');
    expect(row[9]).toBe('12 / 365');
    expect(shamblerSummary([shambler])).toContain('actors=detailed');
  });

  it('includes the light workload and content-owned values in a full-scene report', () => {
    const record: BenchRecord = {
      startedAt: 'fixture',
      quick: false,
      runs: [],
      lightWorkload: {
        active: 1,
        carried: 1,
        dropped: 0,
        pointLightSlots: 1,
        shamblers: 1,
        actors: 'detailed',
        settings: {
          fixture: {
            color: '#ffffff',
            emissive: 1,
            intensity: 1,
            radius: 1,
            seenFrom: 1,
            burnTimeGameHours: gameHours(1),
          },
        },
      },
    };
    expect(markdownReport(record)).toContain('Light workload:');
  });

  it('shows a dash for render time in runs from before it existed', () => {
    const { render: _, ...old } = result;
    expect(resultRow(old).at(-1)).toBe('–');
  });

  it('says what time of day it ran at, noon for older records', () => {
    const env = { userAgent: 'test', cores: 8, gpu: 'test', canvas: '1×1', pixelRatio: 1 };
    const report = (time?: string) =>
      markdownReport({ startedAt: 'now', quick: false, env, runs: [result], ...(time ? { time } : {}) });
    expect(report('23:30')).toContain('- Time: 23:30');
    expect(report()).toContain('- Time: 12:00');
  });

  it('renders a Markdown table', () => {
    const table = markdownTable({ startedAt: 'now', quick: false, runs: [result] }).split('\n');
    expect(table).toHaveLength(3);
    expect(table[2]).toMatch(ROW_START);
  });
});
