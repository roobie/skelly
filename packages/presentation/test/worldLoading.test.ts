import { realTimestamp } from '@skelly/engine/sim';
import { expect, it, vi } from 'vitest';
import { type Engine, WorldLoading } from '../src/play.ts';
import { finishLoadingFrame } from '../src/presentation/worldLoading.ts';

function fixture(workUnits = 2) {
  let holes = 1;
  let viewHoles = 1;
  let lightReady = false;
  const engine = {
    config: { radiusChunks: 3, readyRadiusChunks: 1, scale: { minCy: 0, maxCy: 1 } },
    streamer: {
      failure: undefined as string | undefined,
      loadingWorkUnits: workUnits,
      // Preload rings stay unmeshed by design, so `pending` must not hold back a settled view.
      pending: 5,
      unmeshedColumns: vi.fn((_x: number, _z: number, within: number) => (within > 1 ? viewHoles : holes)),
      ungeneratedColumns: vi.fn(() => holes),
      unmeshedRecordedColumns: vi.fn(() => holes),
    },
    meshes: { version: 0 },
    skylight: { loadingReadiness: () => ({ ready: lightReady, workUnits: 1 }) },
  };
  const loading = new WorldLoading(engine as unknown as Engine, 0.5);
  return {
    engine,
    loading,
    meshComplete: () => {
      holes = 0;
    },
    viewComplete: () => {
      viewHoles = 0;
    },
    lightComplete: () => {
      lightReady = true;
    },
    check: (nowRealMs = 0) => loading.check([0, 0, 0], realTimestamp(nowRealMs)),
  };
}

it('opens Go when the ready ring and lighting complete despite pending far columns, without reopening for later streaming', () => {
  const f = fixture();
  f.check();
  expect(f.loading.ready).toBe(false);
  f.lightComplete();
  f.check();
  expect(f.loading.ready).toBe(false);
  f.meshComplete();
  f.check();
  expect(f.loading.ready).toBe(true);
  expect(f.engine.streamer.unmeshedColumns).toHaveBeenCalledWith(0, 0, f.engine.config.readyRadiusChunks);
  f.engine.streamer.failure = 'A later streaming failure';
  f.check();
  expect(f.loading.ready).toBe(true);
});

it('does not certify completed meshes while lighting is still pending', () => {
  const f = fixture();
  f.meshComplete();
  f.check();
  expect(f.loading.ready).toBe(false);
  f.lightComplete();
  f.check();
  expect(f.loading.ready).toBe(true);
});

it('keeps the mask until draw preparation completes after meshes and lighting', () => {
  const f = fixture();
  let drawReady = false;
  const prepare = vi.fn(() => drawReady);
  const check = () => f.loading.check([0, 0, 0], realTimestamp(0), { prepareDraw: prepare });
  check();
  expect(prepare).not.toHaveBeenCalled();
  f.meshComplete();
  f.lightComplete();
  check();
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.loading.ready).toBe(false);
  drawReady = true;
  check();
  expect(f.loading.ready).toBe(true);
});

it('starts program warm-up once, on the first check while the ready ring is still unmeshed, and still waits for draw preparation', () => {
  const f = fixture();
  const order: string[] = [];
  let drawReady = false;
  const warmUp = vi.fn(() => order.push('warm-up'));
  const prepareDraw = vi.fn(() => {
    order.push('prepare');
    return drawReady;
  });
  const check = () => f.loading.check([0, 0, 0], realTimestamp(0), { warmUp, prepareDraw });
  check();
  expect(order).toEqual(['warm-up']);
  check();
  f.meshComplete();
  f.lightComplete();
  check();
  expect(order).toEqual(['warm-up', 'prepare']);
  expect(f.loading.ready).toBe(false);
  drawReady = true;
  check();
  expect(f.loading.ready).toBe(true);
  expect(warmUp).toHaveBeenCalledOnce();
});

it('settles the view only after loading, once the whole view radius is meshed and meshes held still for a frame', () => {
  const f = fixture();
  f.meshComplete();
  f.lightComplete();
  f.check();
  expect(f.loading.ready).toBe(true);
  f.check();
  f.check();
  expect(f.loading.viewSettled).toBe(false);
  expect(f.engine.streamer.unmeshedColumns).toHaveBeenCalledWith(0, 0, f.engine.config.radiusChunks);
  f.viewComplete();
  f.check();
  expect(f.loading.viewSettled).toBe(true);
  f.engine.meshes.version += 1;
  f.check();
  expect(f.loading.viewSettled).toBe(false);
  f.check();
  expect(f.loading.viewSettled).toBe(true);
});

it('marks each loading phase once, with the frame it was first reached on', () => {
  performance.clearMarks();
  const f = fixture();
  f.check();
  f.meshComplete();
  f.check();
  f.lightComplete();
  f.check();
  f.check();
  const frameOf = (phase: string) => {
    const marks = performance.getEntriesByName(`deadvox load: ${phase}`, 'mark') as PerformanceMark[];
    expect(marks).toHaveLength(1);
    return (marks[0]!.detail as { frame: number }).frame;
  };
  expect(frameOf('ready ring meshed')).toBe(2);
  expect(frameOf('ready ring generated')).toBe(2);
  expect(frameOf('lighting ready')).toBe(3);
  expect(frameOf('world ready')).toBe(3);
});

it('keeps the original workload deadline through stalled GPU preparation, including an already meshed scene', () => {
  for (const initiallyMeshed of [false, true]) {
    const f = fixture();
    if (!initiallyMeshed) {
      f.check();
    }
    f.meshComplete();
    f.lightComplete();
    const prepareDraw = vi.fn(() => false);
    f.loading.check([0, 0, 0], realTimestamp(initiallyMeshed ? 0 : 1000), { prepareDraw });
    expect(prepareDraw).toHaveBeenCalledOnce();
    f.loading.check([0, 0, 0], realTimestamp(1499), { prepareDraw });
    expect(f.loading.state).toBe('loading');
    f.loading.check([0, 0, 0], realTimestamp(1500), { prepareDraw });
    expect(f.loading.state).toBe('failed');
    expect(f.loading.ready).toBe(false);
  }
});

it('fails immediately on an owner error and keeps the mask', () => {
  const f = fixture();
  f.engine.streamer.failure = 'Mesh worker failed';
  f.check();
  expect(f.loading.state).toBe('failed');
  expect(f.loading.error).toContain('Mesh worker failed');
  expect(f.loading.ready).toBe(false);
});

it('bounds stalled loading in proportion to the owner workload', () => {
  const small = fixture(1);
  const large = fixture(100);
  small.check();
  large.check();
  let nowRealMs = 1;
  while (small.loading.state === 'loading' && nowRealMs < 1e9) {
    small.check(nowRealMs);
    nowRealMs *= 2;
  }
  expect(small.loading.state).toBe('failed');
  large.check(nowRealMs);
  expect(large.loading.state).toBe('loading');
  large.check(1e9);
  expect(large.loading.state).toBe('failed');
  expect(large.loading.ready).toBe(false);
});

it('skips world draws behind the loading mask but draws the frame that turns ready', () => {
  const f = fixture();
  const calls: string[] = [];
  const frame = () =>
    finishLoadingFrame(
      f.loading,
      () => {
        calls.push('check');
        f.check();
      },
      { worldFeedsSkylight: true, skylight: () => calls.push('skylight'), world: () => calls.push('world') },
    );
  frame();
  expect(calls).toEqual(['skylight', 'check']);
  f.meshComplete();
  f.lightComplete();
  calls.length = 0;
  frame();
  expect(calls).toEqual(['skylight', 'check', 'world']);
  calls.length = 0;
  frame();
  expect(calls).toEqual(['check', 'world']);
});

it('uses only recorded initial terrain for replay rather than requiring a full view ring', () => {
  const f = fixture();
  const columns: [number, number][] = [[0, 0]];
  const loading = new WorldLoading(f.engine as unknown as Engine, 0.5, columns);
  loading.check([0, 0, 0], realTimestamp(0));
  expect(loading.ready).toBe(false);
  expect(f.engine.streamer.unmeshedRecordedColumns).toHaveBeenCalledWith(
    0,
    0,
    columns,
    f.engine.config.readyRadiusChunks,
  );
  expect(f.engine.streamer.unmeshedColumns).not.toHaveBeenCalled();
  f.meshComplete();
  f.lightComplete();
  loading.check([0, 0, 0], realTimestamp(0));
  expect(loading.ready).toBe(true);
});
