import { expect, it, vi } from 'vitest';
import { realTimestamp } from '../src/core/time.ts';
import type { Engine } from '../src/game/engine.ts';
import { finishLoadingFrame, WorldLoading } from '../src/game/worldLoading.ts';

function fixture(workUnits = 2) {
  let holes = 1;
  let lightReady = false;
  const engine = {
    config: { radiusChunks: 3, readyRadiusChunks: 1, scale: { minCy: 0, maxCy: 1 } },
    streamer: {
      failure: undefined as string | undefined,
      loadingWorkUnits: workUnits,
      unmeshedColumns: vi.fn((_x: number, _z: number, within: number) => (within > 1 ? 1 : holes)),
      unmeshedRecordedColumns: vi.fn(() => holes),
    },
    skylight: { loadingReadiness: () => ({ ready: lightReady, workUnits: 1 }) },
  };
  const loading = new WorldLoading(engine as unknown as Engine);
  return {
    engine,
    loading,
    meshComplete: () => {
      holes = 0;
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
  const loading = new WorldLoading(f.engine as unknown as Engine, columns);
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
