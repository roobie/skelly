import { resolve } from 'node:path';
import {
  admitPacks,
  bundledPacksFrom,
  createBundledContent,
  type PackInput,
  selectFolderClosure,
} from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { bundledPackInputs, productContent } from '../src/product/content.ts';
import { PRODUCT_ENTRY_PACK, selectAvailableProductPacks } from '../src/product/packSelection.ts';
import { bundledPackDefines, readBundledPacks } from '../tools/readBundledPacks.ts';

declare const __SKELLY_CONTENT_PACKS__: { id: string }[];

const ids = (packs: readonly { manifest: { id: string } }[]) => packs.map(({ manifest }) => manifest.id);

it('admits the same real pack closure in the browser as validate --stack and the default save identity', () => {
  const root = resolve(import.meta.dirname, '..');
  const validated = admitPacks(readBundledPacks(root, PRODUCT_ENTRY_PACK));
  expect(validated.issues).toEqual([]);
  const browser = admitPacks(bundledPackInputs);
  expect(browser.issues).toEqual([]);
  expect(ids(browser.packs)).toEqual(ids(validated.packs));
  expect(__SKELLY_CONTENT_PACKS__.map(({ id }) => id)).toEqual(ids(validated.packs));
});

it('admits each shipped start-pack selection after its default-start owner', () => {
  const starts = productContent.availablePackInputs.filter(
    ({ manifest }) => manifest.optIn && manifest.defaultStart !== undefined,
  );
  expect(starts.length).toBeGreaterThan(0);
  for (const pack of starts) {
    const selected = selectFolderClosure(
      [pack.manifest.id],
      productContent.availablePackInputs,
      productContent.bundledPackInputs,
    );
    const result = admitPacks([...productContent.bundledPackInputs, ...selected]);
    expect(result.issues, pack.manifest.id).toEqual([]);
    expect(result.packs.findLast(({ manifest }) => manifest.defaultStart !== undefined)).toBe(pack);
  }
});

it('prepares identities for alternative start packs without admitting them together', async () => {
  const entry: PackInput = {
    source: 'fixture.entry',
    manifest: {
      id: 'fixture.entry',
      version: '1',
      tier: 'product',
      product: true,
      defaultStart: 'fixture_base',
      dependencies: [],
      overrides: [],
      files: [],
    },
    files: [],
  };
  const alternatives = ['fixture.first', 'fixture.second'].map(
    (id): PackInput => ({
      source: id,
      manifest: {
        ...entry.manifest,
        id,
        optIn: true,
        defaultStart: id,
        dependencies: [entry.manifest.id],
        overrides: [{ pack: entry.manifest.id, entry: 'defaultStart' }],
      },
      files: [],
    }),
  );
  const inputs = [entry, ...alternatives];
  expect(admitPacks(inputs).issues).toEqual([
    expect.objectContaining({ message: expect.stringContaining('defaultStart') }),
  ]);
  const defines = await bundledPackDefines(inputs, entry.manifest.id);
  expect(JSON.parse(defines.__SKELLY_OPT_IN_PACKS__!).map(({ id }: { id: string }) => id)).toEqual(ids(alternatives));
  alternatives[0]!.manifest.overrides = [];
  await expect(bundledPackDefines(inputs, entry.manifest.id)).rejects.toThrow('defaultStart');
});

it('leaves an unrelated folder unloaded and out of identity while retaining opt-in dependency identities', async () => {
  const pack = (id: string, dependencies: string[] = [], marked = false): PackInput => ({
    source: `mods/${id}`,
    manifest: {
      id,
      version: '1',
      tier: 'theme',
      product: false,
      dependencies,
      overrides: [],
      files: [{ path: 'rows.json', kind: 'content' }],
      ...(marked ? { optIn: true } : {}),
    },
    files: [{ source: 'rows.json', data: {} }],
  });
  const shared = pack('fixture.shared');
  const entry = pack(PRODUCT_ENTRY_PACK, [shared.manifest.id]);
  const unrelated = pack('fixture.unrelated');
  const optionalDependency = pack('fixture.optional-dependency');
  const optIn = pack('fixture.opt-in', [shared.manifest.id, optionalDependency.manifest.id], true);
  const all = [entry, shared, unrelated, optionalDependency, optIn];
  const available = selectAvailableProductPacks(all);
  expect(available).not.toContain(unrelated);
  expect(available).toContain(optIn);
  expect(available).toContain(optionalDependency);
  const defines = await bundledPackDefines(available, PRODUCT_ENTRY_PACK);
  const listed = (name: string) => JSON.parse(defines[name]!).map(({ id }: { id: string }) => id);
  expect(listed('__SKELLY_CONTENT_PACKS__')).toEqual(ids(admitPacks([entry, shared]).packs));
  expect(new Set(listed('__SKELLY_OPT_IN_PACKS__'))).toEqual(new Set(ids([optionalDependency, optIn])));
  const content = await createBundledContent({
    entryPack: PRODUCT_ENTRY_PACK,
    packs: bundledPacksFrom(
      Object.fromEntries(available.map(({ source, manifest }) => [`${source}/pack/manifest.json`, manifest])),
    ),
    files: Object.fromEntries(all.map(({ source }) => [`${source}/rows.json`, {}])),
  });
  expect(new Set(ids(content.bundledPackInputs))).toEqual(new Set(ids([entry, shared])));
  expect(ids(content.availablePackInputs)).not.toContain(unrelated.manifest.id);
  const selected = selectFolderClosure([optIn.manifest.id], content.availablePackInputs, content.bundledPackInputs);
  expect(new Set(ids(selected))).toEqual(new Set(ids([optionalDependency, optIn])));
  expect(content.buildBundledContent(selected).issues).toEqual([]);
});
