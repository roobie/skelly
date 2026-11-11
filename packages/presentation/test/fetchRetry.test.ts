import type { Registry } from '@skelly/engine/content';
import { FileLoader } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchRetry, retrying } from '../src/render/fetchRetry.ts';
import { ModelLibrary } from '../src/render/models.ts';

const stubFetch = (fetched: () => Promise<Response>): void => {
  vi.stubGlobal('fetch', fetched);
  vi.stubGlobal('ProgressEvent', class extends Event {}); // The loader reports download progress; node has none.
};

// Runs three's real FileLoader over a scripted fetch, so the error shapes the retry reads are the loader's own.
const run = (statuses: readonly (number | 'network')[], retry: FetchRetry) => {
  const script = [...statuses];
  const fetched = vi.fn(() => {
    const next = script.shift()!;
    if (next === 'network') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(new Response('model', { status: next }));
  });
  stubFetch(fetched);
  const waits: number[] = [];
  const loader = new FileLoader();
  return new Promise<{ result: unknown; failure: unknown; fetched: number; waits: number[] }>((resolve) => {
    const settle = (result: unknown, failure: unknown) =>
      resolve({ result, failure, fetched: fetched.mock.calls.length, waits });
    const load = retrying(
      (url, onLoad, onError) => loader.load(url, onLoad, undefined, onError),
      retry,
      (seconds, then) => {
        waits.push(seconds);
        then();
        return () => undefined;
      },
    );
    load(
      'https://host.test/model.glb',
      (result) => settle(result, undefined),
      (failure) => settle(undefined, failure),
    );
  });
};

describe('model fetch retry', () => {
  afterEach(() => vi.unstubAllGlobals());
  const retry = { retries: 3, backoffRealSeconds: 7 };

  it('loads after a passing 5xx or network failure, waiting longer each time', async () => {
    const outcome = await run([503, 'network', 200], retry);
    expect(outcome.result).toBe('model');
    expect(outcome.fetched).toBe(3);
    expect(outcome.waits).toEqual([retry.backoffRealSeconds, retry.backoffRealSeconds * 2]);
  });

  it('fails a 4xx at once without retrying', async () => {
    const outcome = await run([404, 200], retry);
    expect(outcome.fetched).toBe(1);
    expect(outcome.waits).toEqual([]);
    expect(String(outcome.failure)).toContain('404');
  });

  it('reports the last status once the retries are spent', async () => {
    const outcome = await run([503, 503, 503, 502, 200], retry);
    expect(outcome.fetched).toBe(retry.retries + 1);
    expect(String(outcome.failure)).toContain('502');
  });
});

// The library over a real GLTFLoader and a scripted fetch, on fake timers so a backoff is stepped, not waited.
describe('model library fetch retry', () => {
  const retry = { modelLoadConcurrency: 1, modelFetchRetry: { retries: 2, backoffRealSeconds: 1 } };
  const registry = {
    models: new Map([['pictured', { id: 'pictured', file: 'pictured.glb' }]]),
    modelOrigins: new Map(),
  } as unknown as Registry;
  const malformed = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: null }],
  });

  const start = (responses: readonly Response[]) => {
    const script = [...responses];
    const fetched = vi.fn(() => Promise.resolve(script.shift()!));
    stubFetch(fetched);
    vi.useFakeTimers();
    const report = vi.fn();
    const library = new ModelLibrary(registry, report, { 'pictured.glb': 'https://host.test/pictured.glb' }, retry);
    return { fetched, report, library };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not retry a GLTF parse TypeError on a 200 response', async () => {
    const { fetched, report } = start([new Response(malformed), new Response(malformed)]);
    await vi.runAllTimersAsync();
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('drops a pending retry when the library is disposed during backoff', async () => {
    const { fetched, report, library } = start([new Response(null, { status: 503 }), new Response(malformed)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toHaveBeenCalledTimes(1);
    library.dispose();
    await vi.runAllTimersAsync();
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });
});
