import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, formatPlan, parsePlan, type RunResult } from '../src/bench/plan.ts';
import { HEADERS, markdownTable, resultRow } from '../src/bench/report.ts';
import { frameStats, percentile } from '../src/bench/stats.ts';

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
  it('runs both block sizes at 64, 96 and 128 m by default', () => {
    expect(formatPlan(DEFAULT_PLAN)).toBe('1:64,1:96,1:128,0.5:64,0.5:96,0.5:128');
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
    look: { ...frames, drawCalls: 300, triangles: 1e6 },
    jog: { ...frames, holesMax: 0, holeFraction: 0 },
    sprint: { ...frames, holesMax: 3, holeFraction: 0.2 },
    interrupted: false,
  };

  it('formats a row per run with one cell per header', () => {
    const row = resultRow(result);
    expect(row).toHaveLength(HEADERS.length);
    expect(row[4]).toBe('6.3 / 2.5 / 1.0');
    expect(row[10]).toBe('17.0 / 10% / 3');
  });

  it('renders a Markdown table', () => {
    const table = markdownTable({ startedAt: 'now', quick: false, runs: [result] }).split('\n');
    expect(table).toHaveLength(3);
    expect(table[2]).toMatch(ROW_START);
  });
});
