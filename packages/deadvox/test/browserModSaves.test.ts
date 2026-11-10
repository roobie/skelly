import { expect, test } from 'vitest';
import { admitPacks, admitWithFolderPacks, packContentHash, selectFolderClosure } from '../src/core/packAdmission.ts';
import { contentPackDifferences, currentSaveVersionIdentity, decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import { availablePackInputs, bundledPackInputs } from '../src/product/content.ts';
import { folderChain } from './fixtures/folderPacks.ts';
import { capture, contentLookup, createRuntime, formatWorldOptions } from './snapshotTestSupport.ts';

const mods = [
  { id: 'fixture-first', version: '1', data: { items: [] } },
  { id: 'fixture-second', version: '2', data: { actors: [] } },
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
  const { packs } = admitPacks(bundledPackInputs);
  expect(
    decoded.versionIdentity.components.contentPacks.slice(0, packs.length).map(({ id, version }) => ({ id, version })),
  ).toEqual(packs.map(({ manifest: { id, version } }) => ({ id, version })));
  expect(
    decoded.versionIdentity.components.contentPacks.slice(packs.length).map(({ id, version }) => ({ id, version })),
  ).toEqual(mods.map(({ id, version }) => ({ id: `browser.${id}`, version })));
  expect(decoded.versionIdentity.digest).toBe(identity.digest);
});

test('Continue refuses missing, changed and reordered mods with the first pack difference, naming a changed mod', async () => {
  const identity = await currentSaveVersionIdentity([], mods);
  const saved = identity.components.contentPacks;
  const firstId = saved.find(({ id }) => id.endsWith(mods[0]!.id))!.id;
  const bytes = await encodeSave(capture(createRuntime()), {
    generation: 1,
    version: identity.components,
    worldOptions: formatWorldOptions,
  });
  for (const [selected, namesFirst] of [
    [mods.slice(1), true],
    [[{ ...mods[0]!, data: { items: [{ id: 'fixture-new' }] } }, mods[1]!], true],
    [[{ ...mods[0]!, version: '3' }, mods[1]!], true],
    [[...mods].reverse(), false],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each compatibility case must finish before the next decode.
    const running = await currentSaveVersionIdentity([], selected);
    const [reason] = contentPackDifferences(saved, running.components.contentPacks);
    expect(reason).toBeDefined();
    expect(reason!.includes(firstId)).toBe(namesFirst);
    await expect(decodeSave(bytes, { version: running.components, contentLookup })).rejects.toThrow(reason);
  }
});

test('a selected opt-in closure follows the default packs in the identity once each, in admission order', async () => {
  const { a, b, c, defaults, available } = folderChain();
  const admission = admitWithFolderPacks(defaults, selectFolderClosure([a.manifest.id], available, defaults));
  expect(admission.issues).toEqual([]);
  const entries = await Promise.all(
    admission.folderPacks.map(async (pack) => ({
      id: pack.manifest.id,
      version: pack.manifest.version,
      canonicalHash: await packContentHash(pack),
    })),
  );
  const normal = await currentSaveVersionIdentity();
  const selected = await currentSaveVersionIdentity([], [], entries);
  expect(selected.components.contentPacks).toEqual([...normal.components.contentPacks, ...entries]);
  expect(entries.map(({ id }) => id)).toEqual([c, b, a].map(({ manifest }) => manifest.id));
  expect(selected.digest).not.toBe(normal.digest);
  const optIn = new Set(
    availablePackInputs.filter(({ manifest }) => manifest.optIn).map(({ manifest }) => manifest.id),
  );
  expect(optIn.size).toBeGreaterThan(0);
  expect(normal.components.contentPacks.filter(({ id }) => optIn.has(id))).toEqual([]);
});

test('JSON object key order does not change a browser pack hash', async () => {
  const first = await currentSaveVersionIdentity([], [{ id: 'fixture', version: '1', data: { a: 1, b: 2 } }]);
  const reordered = await currentSaveVersionIdentity([], [{ id: 'fixture', version: '1', data: { b: 2, a: 1 } }]);
  expect(reordered.digest).toBe(first.digest);
});
