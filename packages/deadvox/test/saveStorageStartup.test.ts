import { describe, expect, it } from 'vitest';
import { createSaveStorageStartup, type SaveStorageStartupAddress } from './browser/saveStorageStartup.mjs';

/** A promise the test settles on demand, standing in for a build or server start. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Timers a test controls: arming and firing are explicit records, never the event loop's clock. */
const createFakeTimers = () => {
  const armed = new Map<unknown, () => void>();
  let handles = 0;
  return {
    count: () => armed.size,
    fireAll: () => {
      for (const fire of [...armed.values()]) {
        fire();
      }
    },
    schedule: (fire: () => void) => {
      handles += 1;
      armed.set(handles, fire);
      return handles;
    },
    cancel: (handle: unknown) => {
      armed.delete(handle);
    },
  };
};

const createStartupHarness = (options: Partial<Parameters<typeof createSaveStorageStartup>[0]> = {}) => {
  const timers = createFakeTimers();
  const lines: string[] = [];
  const startup = createSaveStorageStartup({
    browserName: 'chromium',
    stageId: 'save-storage-opfs-continue',
    productionBundleStage: true,
    timeoutMs: 30_000,
    build: () => Promise.resolve(),
    preview: () => new Promise<SaveStorageStartupAddress>(() => undefined),
    devServer: () => new Promise<SaveStorageStartupAddress>(() => undefined),
    now: () => 0,
    schedule: timers.schedule,
    cancel: timers.cancel,
    write: (line: string) => {
      lines.push(line);
    },
    writeError: (line: string) => {
      lines.push(line);
    },
    ...options,
  });
  return { lines, startup, timers };
};

const drainMicrotasks = async (turns = 16) => {
  for (let i = 0; i < turns; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: draining the microtask queue is deliberately sequential
    await Promise.resolve();
  }
};

describe('save-storage stage startup bounds', () => {
  // The #1691 regression: the production build raced the readiness bound, so a slow runner, not a hung
  // server, failed the stage while the build was still running.
  it('arms no readiness timer while the production build is pending', async () => {
    const build = deferred<unknown>();
    const { startup, timers } = createStartupHarness({ build: () => build.promise });
    const starting = startup.startStageServer();
    await drainMicrotasks();
    expect(timers.count()).toBe(0);
    build.reject(new Error('test ends the pending build'));
    await expect(starting).rejects.toThrow('test ends the pending build');
  });

  it('bounds preview readiness once the production build has finished', async () => {
    const { startup, timers } = createStartupHarness();
    const starting = startup.startStageServer();
    await drainMicrotasks();
    expect(timers.count()).toBe(1);
    timers.fireAll();
    await expect(starting).rejects.toThrow('Vite preview startup timed out after 30000 ms');
    expect(timers.count()).toBe(0);
  });

  it('releases the preview bound once the preview server answers', async () => {
    const preview = deferred<SaveStorageStartupAddress>();
    const { startup, timers } = createStartupHarness({ preview: () => preview.promise });
    const starting = startup.startStageServer();
    await drainMicrotasks();
    preview.resolve({ port: 45_327 });
    await expect(starting).resolves.toEqual({ port: 45_327 });
    expect(timers.count()).toBe(0);
  });

  it('bounds dev-server startup for non-production stages', async () => {
    const devServer = deferred<SaveStorageStartupAddress>();
    const { startup, timers } = createStartupHarness({
      productionBundleStage: false,
      devServer: () => devServer.promise,
    });
    const starting = startup.startStageServer();
    await drainMicrotasks();
    expect(timers.count()).toBe(1);
    timers.fireAll();
    await expect(starting).rejects.toThrow('Vite startup timed out after 30000 ms');
  });

  it('bounds navigation phases other than Vite startup', async () => {
    const action = deferred<void>();
    const { startup, timers } = createStartupHarness();
    const phase = startup.navigationPhase('checkpoint capture', () => action.promise);
    await drainMicrotasks();
    expect(timers.count()).toBe(1);
    timers.fireAll();
    await expect(phase).rejects.toThrow('checkpoint capture timed out after 30000 ms');
  });

  it('logs the Vite startup phase without arming a bound', async () => {
    const build = deferred<unknown>();
    const { startup, timers } = createStartupHarness({ build: () => build.promise });
    const phase = startup.navigationPhaseLog('Vite startup', startup.startStageServer);
    await drainMicrotasks();
    expect(timers.count()).toBe(0);
    build.reject(new Error('test ends the pending build'));
    await expect(phase).rejects.toThrow('test ends the pending build');
  });
});
