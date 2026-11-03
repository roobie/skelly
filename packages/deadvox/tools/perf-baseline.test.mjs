import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { install } from './perf-baseline-browser.mjs';
import { watchPageErrors } from './perf-baseline-page.mjs';
import { distribution, rankProfile, summarize } from './perf-baseline-stats.mjs';
import { startTrace } from './perf-baseline-trace.mjs';

const playStartupLiteral = /'[^'\n]*globalThis\.perfBaseline\.attach[^'\n]*'/;
const playAnchorLiteral = /'[^'\n]*startRealFrames\(frame\);'/;
const playActorStoreBinding = /const\s*\{[^}]*\bactorStore\s*(?:,[^}]*)?\}\s*=\s*session\s*;/;

test('injected play startup attaches the live actor store before starting frames', async () => {
  const source = await readFile(new URL('./perf-baseline.mjs', import.meta.url), 'utf8');
  const literal = source.match(playStartupLiteral)?.[0];
  assert.ok(literal, 'play startup instrumentation exists');
  const injection = runInNewContext(literal);
  const anchorLiteral = source.match(playAnchorLiteral)?.[0];
  assert.ok(anchorLiteral, 'play startup replacement anchor exists');
  const play = await readFile(new URL('../src/game/play.ts', import.meta.url), 'utf8');
  assert.ok(play.includes(runInNewContext(anchorLiteral)), 'play source retains the injection anchor');
  assert.match(play, playActorStoreBinding);
  const actorStore = { size: 1 };
  let attached;
  let started = false;
  runInNewContext(injection, {
    engine: {},
    session: {},
    input: {},
    view: {},
    worldLoading: {},
    debugTools: {},
    actorStore,
    perfBaseline: {
      attach: (runtime) => {
        attached = runtime;
      },
      frame: () => undefined,
    },
    frame: () => undefined,
    startRealFrames: (callback) => {
      assert.equal(attached?.actorStore, actorStore);
      assert.equal(typeof callback, 'function');
      started = true;
    },
  });
  assert.ok(started);
});

test('query-free scene draws retain actor evidence without opening GPU timers', () => {
  const previous = globalThis.perfBaseline;
  const group = { userData: {} };
  const zombie = { parent: group, userData: {} };
  const scene = {};
  const gl = {
    getExtension: () => ({}),
    getParameter: () => 'fixture GPU',
    isContextLost: () => false,
    blitFramebuffer: () => undefined,
    clear: () => undefined,
    createQuery: () => ({}),
    beginQuery: () => assert.fail('query-free mode opened a GPU timer'),
    endQuery: () => undefined,
  };
  const renderer = {
    getContext: () => gl,
    domElement: new EventTarget(),
    renderBufferDirect: () => undefined,
    render: () => renderer.renderBufferDirect(null, null, null, null, zombie),
  };
  const engine = {
    renderer,
    scene,
    meshes: { group: { userData: {} } },
    shadows: { drawMaps: () => undefined },
    mood: { renderScale: 1 },
  };
  try {
    install(engine);
    const perf = globalThis.perfBaseline;
    perf.attach({ engine, view: { actorMeshes: { group }, playerMeshes: { group: { userData: {} } } } });
    perf.enabled = true;
    perf.mode = 'off';
    perf.frame(() => renderer.render(scene), 0);
    assert.ok(perf.records[0].zombieDraws > 0);
    assert.ok(perf.records[0].actorDraws > 0);
    assert.deepEqual(perf.records[0].segments, []);
  } finally {
    globalThis.perfBaseline = previous;
  }
});

test('shader console errors invalidate collection without treating warnings as failures', () => {
  const page = new EventEmitter();
  const errors = [];
  watchPageErrors(page, (error) => errors.push(error));
  page.emit('console', { type: () => 'warning', text: () => 'diagnostic warning' });
  assert.deepEqual(errors, []);
  page.emit('console', { type: () => 'error', text: () => 'Shader Error: fragment shader is not compiled' });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'Shader Error: fragment shader is not compiled');
  const exception = new Error('page exception');
  page.emit('pageerror', exception);
  assert.equal(errors[1], exception);
});

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

test('query-free JSON represents GPU measurement as absent rather than zero', () => {
  for (const mode of ['cpu', 'off']) {
    const result = summarize([frame(0), frame(20)], mode);
    assert.equal(result.wholeFrameGpuMs, null);
    assert.deepEqual(result.passes, {});
  }
});

test('browser trace waits for completion and preserves streamed bytes before closing the handle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'perf-trace-'));
  const path = join(directory, 'trace.json');
  const session = new EventEmitter();
  const calls = [];
  const chunks = [
    { data: '{"traceEvents":', eof: false },
    { data: Buffer.from('[]}').toString('base64'), base64Encoded: true, eof: true },
  ];
  session.send = async (method, args) => {
    calls.push([method, args]);
    if (method === 'Tracing.end') {
      queueMicrotask(() => session.emit('Tracing.tracingComplete', { stream: 'fixture-stream' }));
    }
    if (method === 'IO.read') {
      return chunks.shift();
    }
    if (method === 'IO.close') {
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { traceEvents: [] });
    }
  };
  try {
    const stop = await startTrace(session, path, ['fixture-category']);
    await stop();
    assert.deepEqual(
      calls.map(([method]) => method),
      ['Tracing.start', 'Tracing.end', 'IO.read', 'IO.read', 'IO.close'],
    );
    assert.deepEqual(calls[0][1], { categories: 'fixture-category', transferMode: 'ReturnAsStream' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('lost trace data closes its stream without publishing an artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'perf-trace-loss-'));
  const path = join(directory, 'trace.json');
  const calls = [];
  let complete;
  const session = {
    once: (_name, listener) => {
      complete = listener;
    },
    send: (method) => {
      calls.push(method);
      if (method === 'Tracing.end') {
        complete({ stream: 'trace-stream', dataLossOccurred: true });
      }
      return Promise.resolve();
    },
  };
  try {
    const stop = await startTrace(session, path, ['test-category']);
    await assert.rejects(stop(), { message: 'Incomplete Chrome trace' });
    assert.equal(calls.at(-1), 'IO.close');
    assert.ok(!calls.includes('IO.read'));
    await assert.rejects(readFile(path), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CPU attribution counts descendants once, includes parentless actor steps and keeps GC and native gaps separate', () => {
  const node = (id, functionName, children = []) => ({ id, callFrame: { functionName }, children });
  const ranking = rankProfile({
    nodes: [
      node(1, '(root)', [2, 5, 6, 7, 8, 9]),
      node(2, 'tickActive', [3, 4]),
      node(3, 'overlapsTerrain'),
      node(4, '(garbage collector)'),
      node(5, 'prepareStreaming'),
      node(6, '(program)'),
      node(7, '(idle)'),
      node(8, 'stepActorBody'),
      node(9, 'finishActorTick'),
    ],
    samples: [3, 4, 5, 6, 7, 8, 9],
    timeDeltas: [1000, 2000, 3000, 4000, 5000, 1000, 1000],
  });
  assert.equal(ranking.sampledMs, 17);
  assert.equal(ranking.categories.find((row) => row.name === 'ai').ms, 3);
  assert.equal(ranking.categories.find((row) => row.name === 'gc').ms, 2);
  assert.equal(ranking.categories.find((row) => row.name === 'streamingMeshing').ms, 3);
  assert.equal(ranking.categories.find((row) => row.name === 'unattributed').ms, 4);
});
