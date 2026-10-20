import { expect, test } from 'vitest';
import { currentSaveVersionIdentity, decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import { capture, contentLookup, createRuntime, formatWorldOptions } from './snapshotTestSupport.ts';

const mods = [
  { id: 'fixture-first', version: '1', data: { items: [] } },
  { id: 'fixture-second', version: '2', data: { zombies: [] } },
];

test('a save round-trip preserves the admitted ordered browser mod identity', async () => {
  const identity = await currentSaveVersionIdentity([], mods);
  const snapshot = capture(createRuntime());
  const bytes = await encodeSave(snapshot, {
    generation: 1,
    version: identity.components,
    worldOptions: formatWorldOptions,
  });
  const decoded = await decodeSave(bytes, { version: identity.components, contentLookup });
  expect(decoded.snapshot).toEqual(snapshot);
  expect(decoded.versionIdentity.components.contentPacks.slice(1).map(({ id, version }) => ({ id, version }))).toEqual(
    mods.map(({ id, version }) => ({ id: `browser.${id}`, version })),
  );
  expect(decoded.versionIdentity.digest).toBe(identity.digest);
});

test('Continue refuses missing, changed and reordered mods with a named reason', async () => {
  const identity = await currentSaveVersionIdentity([], mods);
  const bytes = await encodeSave(capture(createRuntime()), {
    generation: 1,
    version: identity.components,
    worldOptions: formatWorldOptions,
  });
  for (const [selected, reason] of [
    [mods.slice(1), 'Missing mod: browser.fixture-first'],
    [[{ ...mods[0]!, data: { items: [{ id: 'fixture-new' }] } }, mods[1]!], 'Different mod: browser.fixture-first'],
    [[{ ...mods[0]!, version: '3' }, mods[1]!], 'Different mod: browser.fixture-first'],
    [[...mods].reverse(), 'Different mod order'],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each compatibility case must finish before the next decode.
    const running = await currentSaveVersionIdentity([], selected);
    await expect(decodeSave(bytes, { version: running.components, contentLookup })).rejects.toThrow(reason);
  }
});

test('JSON object key order does not change a browser pack hash', async () => {
  const first = await currentSaveVersionIdentity([], [{ id: 'fixture', version: '1', data: { a: 1, b: 2 } }]);
  const reordered = await currentSaveVersionIdentity([], [{ id: 'fixture', version: '1', data: { b: 2, a: 1 } }]);
  expect(reordered.digest).toBe(first.digest);
});
