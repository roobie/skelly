import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, rankProfile, summarize } from './perf-baseline-stats.mjs';

test('nearest-rank percentiles do not mutate samples', () => {
  const samples = [40, 10, 30, 20];
  assert.deepEqual(distribution(samples), { count: 4, mean: 25, p50: 20, p95: 40, p99: 40 });
  assert.deepEqual(samples, [40, 10, 30, 20]);
  for (const invalid of [[], [Number.NaN], [-1], [Number.POSITIVE_INFINITY]]) {
    assert.throws(() => distribution(invalid));
  }
});

const frame = (now, segments = []) => ({ now, cpuMs: 2, segments, disjoint: false, actorDraws: 0 });
test('frame JSON preserves interval denominator and averages absent passes as zero', () => {
  const result = summarize(
    [
      frame(0, [
        { label: 'chunks', ms: 1 },
        { label: 'chunks', ms: 2 },
      ]),
      frame(16, [{ label: 'shadows', ms: 6 }]),
      frame(34, [{ label: 'chunks', ms: 3 }]),
      frame(54, [{ label: 'chunks', ms: 3 }]),
    ],
    'passes',
  );
  assert.equal(result.frameIntervalMs.count, 3);
  assert.equal(result.frameIntervalMs.over16Point7Share, 2 / 3);
  assert.equal(result.frameIntervalMs.over18Share, 1 / 3);
  assert.equal(result.passes.shadows.mean, 1.5);
  assert.equal(result.passes.chunks.mean, 2.25);
  assert.equal(result.wholeFrameGpuMs.mean, 3.75);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('unresolved or disjoint timing cannot become a baseline', () => {
  for (const invalid of [{ ...frame(1), disjoint: true }, frame(1, [{ label: 'chunks', ms: null }]), frame(1)]) {
    assert.throws(() => summarize([frame(0, [{ label: 'whole', ms: 1 }]), invalid], 'whole'));
  }
});

test('CPU-only JSON represents GPU measurement as absent rather than zero', () => {
  const result = summarize([frame(0), frame(20)], 'cpu');
  assert.equal(result.wholeFrameGpuMs, null);
  assert.deepEqual(result.passes, {});
});

test('CPU attribution counts descendants once and keeps GC and native gaps separate', () => {
  const node = (id, functionName, children = []) => ({ id, callFrame: { functionName }, children });
  const ranking = rankProfile({
    nodes: [
      node(1, '(root)', [2, 5, 6, 7]),
      node(2, 'tickActive', [3, 4]),
      node(3, 'overlapsTerrain'),
      node(4, '(garbage collector)'),
      node(5, 'prepareStreaming'),
      node(6, '(program)'),
      node(7, '(idle)'),
    ],
    samples: [3, 4, 5, 6, 7],
    timeDeltas: [1000, 2000, 3000, 4000, 5000],
  });
  assert.equal(ranking.sampledMs, 15);
  assert.equal(ranking.categories.find((row) => row.name === 'ai').ms, 1);
  assert.equal(ranking.categories.find((row) => row.name === 'gc').ms, 2);
  assert.equal(ranking.categories.find((row) => row.name === 'streamingMeshing').ms, 3);
  assert.equal(ranking.categories.find((row) => row.name === 'unattributed').ms, 4);
});
