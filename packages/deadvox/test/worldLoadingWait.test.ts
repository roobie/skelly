// @vitest-environment happy-dom
import type { Window } from 'happy-dom';
import { afterEach, expect, it } from 'vitest';
import { waitForWorldLoaded } from './browser/world-loading.mjs';

const page = {
  evaluate: (observe: () => Promise<void>): Promise<void> => new Function(`return (${observe.toString()})()`)(),
};

const mask = (state?: string): HTMLElement => {
  const loading = document.createElement('section');
  loading.id = 'world-loading';
  loading.hidden = true;
  if (state !== undefined) {
    loading.dataset.state = state;
  }
  document.body.replaceChildren(loading);
  return loading;
};

afterEach(() => document.body.replaceChildren());

it('accepts a loading verdict published before the observer attaches', async () => {
  mask('ready');
  await expect(waitForWorldLoaded(page)).resolves.toBeUndefined();
});

it('waits through the unmounted mask and loading state, without treating the hidden mask as readiness', async () => {
  const loading = mask();
  let ready = false;
  const result = waitForWorldLoaded(page).then(() => {
    ready = true;
  });
  result.catch(() => undefined);
  await Promise.resolve();
  expect(ready).toBe(false);
  loading.hidden = false;
  loading.dataset.state = 'loading';
  await (globalThis as unknown as Window).happyDOM.whenAsyncComplete();
  expect(ready).toBe(false);
  loading.hidden = true;
  loading.dataset.state = 'ready';
  await result;
  expect(ready).toBe(true);
});

it('propagates the loading owner failure instead of waiting for a readiness timeout', async () => {
  const loading = mask('loading');
  const result = expect(waitForWorldLoaded(page)).rejects.toThrow('fixture loading failure');
  loading.textContent = 'fixture loading failure';
  loading.dataset.state = 'failed';
  await result;
});

it('rejects a ready verdict that leaves the loading mask visible', async () => {
  const loading = mask('ready');
  loading.hidden = false;
  await expect(waitForWorldLoaded(page)).rejects.toThrow();
});

it('propagates a failure published before the observer attaches', async () => {
  const loading = mask('failed');
  loading.textContent = 'fixture prior failure';
  await expect(waitForWorldLoaded(page)).rejects.toThrow('fixture prior failure');
});
