import { gameHours } from '@skelly/engine/internal/core/time.ts';
import { percentile } from '@skelly/engine/math';
import { actorRendererFromUrl } from '@skelly/engine/session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type BenchRecord,
  DEFAULT_PLAN,
  DEFAULT_SHAMBLER_COUNTS,
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
import { benchRunFromUrl, loadNextRun } from '../src/bench/run.ts';
import { shamblerRunFromUrl } from '../src/bench/shamblers.ts';
import { frameStats } from '../src/bench/stats.ts';
import { readPageUrl } from '../src/pageUrl.ts';

/** A bench run read the way the bench page reads it, from its query and hash. */
const benchPage = (address: string) => {
  const url = new URL(address, 'https://example.test/');
  const page = readPageUrl(url.search, url.hash);
  if (page.refused !== undefined) {
    throw new Error(`the bench page refuses ${page.refused} in ${address}`);
  }
  return page;
};
afterEach(() => vi.unstubAllGlobals());
const worldRun = (address: string) => benchRunFromUrl(benchPage(address).hash);
const shamblerRun = (address: string) => shamblerRunFromUrl(benchPage(address).hash);

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
  it('defaults and validates shambler benchmark counts and seed', () => {
    const defaults = shamblerRun('?bench=shamblers')!;
    expect(defaults).toMatchObject({
      counts: [...DEFAULT_SHAMBLER_COUNTS],
      index: 0,
      actors: actorRendererFromUrl(undefined),
      post: false,
    });
    expect(Number.isInteger(defaults.seed)).toBe(true);
    expect(shamblerRun(`?bench=shamblers#{seed:${defaults.seed}}`)).toEqual(defaults);
    // The count cap: every count up to the largest accepted one parses, and one more is refused.
    let low = Math.max(...DEFAULT_SHAMBLER_COUNTS);
    let high = Number.MAX_SAFE_INTEGER;
    expect(parseShamblerCounts([low])).toEqual([low]);
    expect(parseShamblerCounts([high])).toBeUndefined();
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (parseShamblerCounts([middle])) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const max = low;
    expect(parseShamblerCounts([1, max])).toEqual([1, max]);
    expect(parseShamblerCounts([max + 1])).toBeUndefined();
    expect(shamblerRun(`?bench=shamblers#{shamblers:[${max + 1}]}`)).toBeUndefined();
    expect(shamblerRun('?bench=shamblers#{seed:77,actors:detailed,shamblers:[10,25],i:1}')).toEqual({
      counts: [10, 25],
      index: 1,
      seed: 77,
      actors: 'detailed',
      post: false,
    });
    expect(parseShamblerSeed('-2147483648')).toBe(-2_147_483_648);
    expect(parseShamblerSeed('2147483647')).toBe(2_147_483_647);
    for (const nonsense of ['', '1.5', '2147483648', '-2147483649', '0x10', 'nope']) {
      expect(parseShamblerSeed(nonsense), nonsense).toBeUndefined();
    }
    for (const nonsense of [[], [0], [-1], [1.5], [10, 10]]) {
      expect(parseShamblerCounts(nonsense), String(nonsense)).toBeUndefined();
    }
    expect(shamblerRun('?bench=shamblers#{shamblers:[10],i:1}')).toBeUndefined();
    expect(shamblerRun('?bench=shamblers#{seed:2147483648}')).toBeUndefined();
  });

  it('carries the detailed population through each full phase run', () => {
    expect(worldRun('?bench=1#{actors:detailed,shamblers:[7]}').shamblers).toBe(7);
    expect(worldRun('?bench=1').shamblers).toBe(0);
    expect(worldRun('?bench=1#{shamblers:[7,8]}').shamblers).toBeUndefined();
  });

  it('reloads the next run with its query and hash, bar the run index, and shows the report after the last', () => {
    const start = new URL(
      '?bench=1&start-mod=fixture.bench.start#{seed:7,post:true,plan:[1,64,0.25,64],shamblers:[7]}',
      'https://example.test/deadvox/',
    );
    const written: string[] = [];
    const navigation: string[] = [];
    vi.stubGlobal('location', {
      href: start.href,
      search: start.search,
      hash: start.hash,
      reload: () => navigation.push('reload'),
      replace: (url: string) => navigation.push(`replace ${url}`),
    });
    vi.stubGlobal('history', {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => written.push(url),
    });
    const first = benchPage(start.href);
    const run = benchRunFromUrl(first.hash);
    expect(run).toMatchObject({ seed: 7, post: true, shamblers: 7 });
    loadNextRun(run.index, run.plan.length);
    expect(navigation).toEqual(['reload']);
    expect(written).toHaveLength(1);
    const next = benchPage(written[0]!);
    expect([...next.query]).toEqual([...first.query]);
    expect(next.hash).toEqual({ ...first.hash, i: 1 });
    expect(benchRunFromUrl(next.hash)).toEqual({ ...run, index: 1 });
    navigation.length = 0;
    loadNextRun(1, run.plan.length);
    expect(navigation).toEqual(['replace ?bench=report']);
    expect(written).toHaveLength(1);
  });

  it('reads a plan as block size and radius pairs and rejects nonsense', () => {
    expect(parsePlan(DEFAULT_PLAN.flatMap(({ blockSize, radiusM }) => [blockSize, radiusM]))).toEqual(DEFAULT_PLAN);
    expect(parsePlan([0.5, 96])).toEqual([{ blockSize: 0.5, radiusM: 96 }]);
    expect(parsePlan([0.3, 96])).toBeUndefined();
    expect(parsePlan([1, 9999])).toBeUndefined();
    expect(parsePlan([0.5, 96, 0.5])).toBeUndefined();
    expect(parsePlan([])).toBeUndefined();
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

  it('formats one report cell per shambler header and a pasteable summary', () => {
    const shambler: ShamblerRunResult = {
      n: 25,
      seed: 12,
      actors: 'boxes',
      frame: { ...frames, msMedian: 16.5, msP95: 19, slowFraction: 0.2 },
      actorTick: { count: 300, median: 0.4, p95: 0.8 },
      actorSync: { count: 900, median: 2.3, p95: 4.1 },
      renderSubmit: { count: 900, median: 1.1, p95: 2.2 },
      draws: 12,
      triangles: 365_000,
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
      '2.3 / 4.1',
      '1.1 / 2.2',
      '12 / 365',
      '3 / 10%',
      'no',
    ]);
    expect(shamblerSummary([shambler])).toContain('N=25 active/background=–/– seed=12 actors=boxes');
    const report = markdownReport({
      startedAt: 'now',
      quick: false,
      site: 'testHouse',
      time: '12:00',
      runs: [],
      shamblers: [shambler],
    });
    expect(report).toContain('Shambler summary: N=25 active/background=–/– seed=12 actors=boxes');
    expect(report.split('\n')[2]).toMatch(SHAMBLER_ROW_START);
  });

  it('includes the light workload and content-owned values in a full-scene report', () => {
    const record: BenchRecord = {
      startedAt: 'fixture',
      quick: false,
      site: 'testHouse',
      time: '12:00',
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

  it('says what time of day it ran at', () => {
    const env = { userAgent: 'test', cores: 8, gpu: 'test', canvas: '1×1', pixelRatio: 1 };
    const report = markdownReport({
      startedAt: 'now',
      quick: false,
      site: 'testHouse',
      env,
      runs: [result],
      time: '23:30',
    });
    expect(report).toContain('- Time: 23:30');
  });

  it('renders a Markdown table', () => {
    const table = markdownTable({
      startedAt: 'now',
      quick: false,
      site: 'testHouse',
      time: '12:00',
      runs: [result],
    }).split('\n');
    expect(table).toHaveLength(3);
    expect(table[2]).toMatch(ROW_START);
  });
});
