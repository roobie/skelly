import { FileLoader } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchRetry, retrying } from '../src/render/fetchRetry.ts';

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
  vi.stubGlobal('fetch', fetched);
  vi.stubGlobal('ProgressEvent', class extends Event {}); // The loader reports download progress; node has none.
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
