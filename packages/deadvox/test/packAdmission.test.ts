import { expect, it } from 'vitest';
import { BundleAdmission } from '../src/core/bundleAdmission.ts';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { admitPacks, type PackInput, packContentHash } from '../src/core/packAdmission.ts';

const pack = (id: string, dependencies: string[] = []): PackInput => ({
  source: `${id}/pack.json`,
  manifest: {
    id,
    version: '1',
    tier: 'theme',
    product: false,
    dependencies,
    overrides: [],
    files: [{ path: 'rows.json', kind: 'content' }],
  },
  files: [{ source: 'rows.json', data: {} }],
});

it('refuses a missing dependency without admitting any of the stack', () => {
  const input = pack('fixture.consumer', ['fixture.missing']);
  const result = admitPacks([input]);
  expect(result.sources).toEqual([]);
  expect(result.issues).toEqual([expect.objectContaining({ message: expect.stringContaining('fixture.consumer') })]);
  expect(result.issues[0]!.message).toContain('fixture.missing');
});

it('refuses an undeclared entry override and admits a declared dependency override in dependency order', () => {
  const owner = pack('fixture.owner');
  const consumer = pack('fixture.consumer', [owner.manifest.id]);
  owner.files[0]!.data = { blocks: [{ id: 'fixture_block' }] };
  consumer.files[0]!.data = { blocks: [{ id: 'fixture_block' }] };
  const refused = admitPacks([consumer, owner]);
  expect(refused.sources).toEqual([]);
  expect(refused.issues[0]!.message).toContain('fixture.consumer');
  expect(refused.issues[0]!.message).toContain('blocks:fixture_block');
  expect(refused.issues[0]!.message).toContain(owner.manifest.id);
  consumer.manifest.overrides.push({ pack: owner.manifest.id, entry: 'blocks:fixture_block' });
  const admitted = admitPacks([consumer, owner]);
  expect(admitted.issues).toEqual([]);
  expect(admitted.packs.map(({ manifest }) => manifest.id)).toEqual([owner.manifest.id, consumer.manifest.id]);
  expect(admitted.sources.map(({ data }) => data)).toEqual([owner.files[0]!.data, consumer.files[0]!.data]);
  expect(admitPacks([owner, consumer])).toEqual(admitted);
  consumer.manifest.dependencies = [];
  expect(admitPacks([owner, consumer]).issues[0]!.message).toContain('dependency');
});

it('a compatibility pack settles independent entry setters only by declaring both dependency overrides', () => {
  const first = pack('fixture.first');
  const second = pack('fixture.second');
  const resolver = pack('fixture.resolver', [first.manifest.id, second.manifest.id]);
  for (const input of [first, second, resolver]) {
    input.files[0]!.data = { blocks: [{ id: 'fixture_shared' }] };
  }
  expect(admitPacks([first, second]).sources).toEqual([]);
  resolver.manifest.overrides = [first, second].map(({ manifest }) => ({
    pack: manifest.id,
    entry: 'blocks:fixture_shared',
  }));
  const admitted = admitPacks([resolver, second, first]);
  expect(admitted.issues).toEqual([]);
  expect(admitted.packs.at(-1)).toBe(resolver);
  resolver.manifest.overrides.pop();
  expect(admitPacks([resolver, first, second]).sources).toEqual([]);
});

it('refuses a dependency cycle without admitting part of it', () => {
  const first = pack('fixture.first', ['fixture.second']);
  const second = pack('fixture.second', ['fixture.first']);
  const result = admitPacks([first, second]);
  expect(result.sources).toEqual([]);
  expect(result.issues[0]!.message).toContain('cycle');
  expect(result.issues[0]!.message).toContain(first.manifest.id);
  expect(result.issues[0]!.message).toContain(second.manifest.id);
});

it('a stale pack stamp falls back to reference checks rather than admitting a broken entry', async () => {
  const input = pack('fixture.references');
  const item = {
    id: 'fixture_lamp',
    name: 'Lamp',
    category: 'light',
    economy: { usage: [], tiers: [] },
    workInProgress: false,
    notLoot: false,
    weight: 400,
    size: [3, 1],
  };
  input.files[0]!.data = { items: [item] };
  const stamp = { sourceHash: await packContentHash(input), proofHash: '1'.repeat(64) };
  expect(await BundleAdmission.preparePack(input, stamp, stamp.proofHash)).toBeDefined();
  input.files[0]!.data = { items: [{ ...item, model: 'fixture_missing' }] };
  const selected = admitPacks([input]);
  expect(selected.issues).toEqual([]);
  expect(selected.sources.flatMap(validateContent)).toEqual([]);
  const bundle = await BundleAdmission.preparePack(input, stamp, stamp.proofHash);
  expect(bundle).toBeUndefined();
  const result = buildRegistry(selected.sources, { bundle });
  expect(result.issues).toEqual([
    expect.objectContaining({ path: 'items[0].model', message: expect.stringContaining('fixture_missing') }),
  ]);
  expect(result.registry.items.has(item.id)).toBe(false);
});

it('combined pack trust matches the stamped stack but expires when one non-content model changes', async () => {
  const packs = [pack('fixture.first'), pack('fixture.second')];
  const model = { source: 'fixture.model.json', data: { geometry: 1 } };
  packs[1]!.manifest.files.push({ path: model.source, kind: 'json' });
  packs[1]!.files.push(model);
  const proofHash = '1'.repeat(64);
  const admissions = await Promise.all(
    packs.map(async (input) => ({
      pack: input,
      admission: await BundleAdmission.preparePack(
        input,
        {
          sourceHash: await packContentHash(input),
          proofHash,
        },
        proofHash,
      ),
    })),
  );
  const combined = BundleAdmission.combine(admissions);
  expect(combined).toBeDefined();
  const { sources, issues } = admitPacks(packs);
  expect(issues).toEqual([]);
  expect(combined!.matches(sources)).toBe(true);
  model.data = { geometry: 2 };
  expect(combined!.matches(sources)).toBe(false);
});

it('hashes each pack model and rejects an admission stamp after that model changes', async () => {
  const input = pack('fixture.models');
  for (const directory of ['things', 'gungen']) {
    input.manifest.files.push({ path: `${directory}/fixture.model.json`, kind: 'json' });
    input.files.push({ source: `${directory}/fixture.model.json`, data: { geometry: 1 } });
  }
  const original = await packContentHash(input);
  const proofHash = '1'.repeat(64);
  const stamp = { sourceHash: original, proofHash };
  const admission = await BundleAdmission.preparePack(input, stamp, proofHash);
  expect(admission).toBeDefined();
  for (const model of input.files.slice(1)) {
    model.data = { geometry: 2 };
    // biome-ignore lint/performance/noAwaitInLoops: mutate one model at a time to isolate its identity contribution.
    expect(await packContentHash(input)).not.toBe(original);
    expect(admission!.matches(admitPacks([input]).sources)).toBe(false);
    expect(await BundleAdmission.preparePack(input, stamp, proofHash)).toBeUndefined();
    model.data = { geometry: 1 };
  }
});
