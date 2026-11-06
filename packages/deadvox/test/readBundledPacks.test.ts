import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { validate } from '../src/cli/validate.ts';
import { buildRegistry } from '../src/core/content.ts';
import { admitPacks, packContentHash } from '../src/core/packAdmission.ts';
import { bundledPackDefines, readAvailablePacks, readBundledPacks } from '../tools/readBundledPacks.ts';
import { stampPacks } from '../tools/stampBundle.ts';

it('injects exporter JSON digests without model payloads while preserving runtime pack identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-digests-'));
  const directory = join(root, 'mods/skelly.deadvox.residual');
  try {
    mkdirSync(join(directory, 'pack'), { recursive: true });
    writeFileSync(
      join(directory, 'pack/manifest.json'),
      JSON.stringify({
        id: 'fixture.digests',
        version: '1',
        tier: 'theme',
        product: false,
        dependencies: [],
        overrides: [],
        files: [
          { path: 'rows.json', kind: 'content' },
          { path: 'export.model.json', kind: 'json' },
          { path: 'model.glb', kind: 'asset' },
        ],
      }),
    );
    writeFileSync(join(directory, 'rows.json'), JSON.stringify({ items: [] }));
    const modelPath = join(directory, 'export.model.json');
    writeFileSync(modelPath, JSON.stringify({ fixtureGeometry: 1, fixtureMaterial: 'plain' }));
    writeFileSync(join(directory, 'model.glb'), new Uint8Array([1, 2, 3]));
    const [input] = readBundledPacks(root);
    const defines = await bundledPackDefines([input!]);
    const hashesDefine = '__SKELLY_FILE_HASHES__';
    const identitiesDefine = '__SKELLY_CONTENT_PACKS__';
    const hashes: Record<string, string> = JSON.parse(defines[hashesDefine]!);
    const identities = JSON.parse(defines[identitiesDefine]!);
    expect(JSON.stringify(hashes)).not.toContain('fixtureGeometry');
    expect(typeof hashes[`${input!.source}/export.model.json`]).toBe('string');
    const runtime = {
      ...input!,
      files: input!.manifest.files.map(({ path, kind }) => ({
        source: path,
        data:
          kind === 'content'
            ? input!.files.find(({ source }) => source === path)!.data
            : hashes[`${input!.source}/${path}`],
      })),
    };
    const original = await packContentHash(runtime);
    expect(original).toBe(identities[0].canonicalHash);
    writeFileSync(modelPath, JSON.stringify({ fixtureMaterial: 'plain', fixtureGeometry: 1 }));
    expect(await packContentHash(readBundledPacks(root)[0]!)).toBe(original);
    writeFileSync(modelPath, JSON.stringify({ fixtureGeometry: 2, fixtureMaterial: 'plain' }));
    expect(await packContentHash(readBundledPacks(root)[0]!)).not.toBe(original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('keeps opt-in packs out of the default identity and no-stack set while hashing them for selection', async () => {
  const root = mkdtempSync(join(tmpdir(), 'opt-in-packs-'));
  try {
    const write = (id: string, extra: object) => {
      mkdirSync(join(root, 'mods', id, 'pack'), { recursive: true });
      writeFileSync(
        join(root, 'mods', id, 'pack/manifest.json'),
        JSON.stringify({ id, version: '1', tier: 'scenario', product: false, overrides: [], files: [], ...extra }),
      );
    };
    write('fixture.default', { dependencies: [] });
    write('fixture.opt-in', { optIn: true, dependencies: ['fixture.default'] });
    const ids = (packs: readonly { manifest: { id: string } }[]) => packs.map(({ manifest }) => manifest.id);
    expect(ids(readBundledPacks(root))).toEqual(['fixture.default']);
    expect(ids(readBundledPacks(root, 'fixture.opt-in'))).toEqual(['fixture.default', 'fixture.opt-in']);
    const available = readAvailablePacks(root);
    const defines = await bundledPackDefines(available);
    const listed = (define: string) => JSON.parse(defines[define]!).map(({ id }: { id: string }) => id);
    expect(listed('__SKELLY_CONTENT_PACKS__')).toEqual(['fixture.default']);
    expect(listed('__SKELLY_OPT_IN_PACKS__')).toEqual(['fixture.opt-in']);
    const optIn = available.find(({ manifest }) => manifest.optIn)!;
    expect(JSON.parse(defines.__SKELLY_OPT_IN_PACKS__!)[0].canonicalHash).toBe(await packContentHash(optIn));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const withMultiRootFixture = async (check: (root: string) => void | Promise<void>): Promise<void> => {
  const temporary = mkdtempSync(join(tmpdir(), 'multi-root-mods-'));
  const root = join(temporary, 'packages/deadvox');
  const shared = join(temporary, 'packages/mods/fixture.shared');
  const entry = join(root, 'mods/fixture.entry');
  try {
    mkdirSync(join(shared, 'pack'), { recursive: true });
    mkdirSync(join(entry, 'pack'), { recursive: true });
    mkdirSync(join(root, 'src/config'), { recursive: true });
    const definitions = join(root, 'mods/fixture.definitions');
    mkdirSync(join(definitions, 'pack'), { recursive: true });
    // The shipped entry's dependencies are the whole stack; the fixture pack stands in for it without its product flag.
    const shipped = JSON.parse(readFileSync('mods/skelly.deadvox/pack/manifest.json', 'utf8'));
    writeFileSync(
      join(definitions, 'pack/manifest.json'),
      JSON.stringify({ ...shipped, id: 'fixture.definitions', product: false, defaultStart: undefined }),
    );
    for (const dependency of shipped.dependencies as string[]) {
      const modRoot = existsSync(resolve('../mods', dependency)) ? '../mods' : 'mods';
      symlinkSync(resolve(modRoot, dependency), join(root, modRoot, dependency), 'dir');
    }
    writeFileSync(join(root, 'src/config/bundled-mods.json'), JSON.stringify({ mods: [] }));
    const sharedManifest = {
      id: 'fixture.shared',
      version: '1',
      tier: 'theme',
      product: false,
      dependencies: [],
      overrides: [],
      files: [{ path: 'rows.json', kind: 'content' }],
    };
    writeFileSync(join(shared, 'pack/manifest.json'), JSON.stringify(sharedManifest));
    writeFileSync(join(shared, 'rows.json'), JSON.stringify({ soundFamilies: [{ id: 'fixture_family' }] }));
    const entryManifest = {
      id: 'fixture.entry',
      version: '1',
      tier: 'product',
      product: true,
      dependencies: ['fixture.definitions', sharedManifest.id],
      overrides: [],
      files: [] as { path: string; kind: string }[],
    };
    writeFileSync(join(entry, 'pack/manifest.json'), JSON.stringify(entryManifest));
    await check(root);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

it('loads a shared-root row through bundled intake and refuses an undeclared cross-root conflict', () =>
  withMultiRootFixture((root) => {
    const inputs = readBundledPacks(root, 'fixture.entry');
    expect(inputs.some(({ source }) => source === '../../../mods/fixture.shared')).toBe(true);
    const admitted = admitPacks(inputs);
    expect(admitted.issues).toEqual([]);
    const loaded = buildRegistry(admitted.sources);
    expect(loaded.issues).toEqual([]);
    expect(loaded.registry.soundFamilies.has('fixture_family')).toBe(true);
    const entry = inputs.find(({ manifest }) => manifest.id === 'fixture.entry')!;
    entry.manifest.files.push({ path: 'conflict.json', kind: 'content' });
    entry.files.push({ source: 'conflict.json', data: { soundFamilies: [{ id: 'fixture_family' }] } });
    const conflict = admitPacks(inputs);
    expect(conflict.sources).toEqual([]);
    expect(conflict.issues.some(({ message }) => message.includes('soundFamilies:fixture_family'))).toBe(true);
  }));

it('validates the requested multi-root stack and rejects missing stack arguments and ids', () =>
  withMultiRootFixture((root) => {
    const output: string[] = [];
    expect(
      validate(['--stack', 'fixture.entry'], (line) => output.push(line), root),
      output.join('\n'),
    ).toBe(0);
    expect(validate(['--stack', 'fixture.absent'], (line) => output.push(line), root)).toBe(1);
    expect(validate(['--stack'], (line) => output.push(line), root)).toBe(1);
  }));

it('stamps each pack in a multi-root stack with its own content identity', () =>
  withMultiRootFixture(async (root) => {
    const inputs = readBundledPacks(root, 'fixture.entry');
    const stamps = await stampPacks(inputs, 'fixture-proof');
    expect(Object.keys(stamps).sort()).toEqual(inputs.map(({ manifest }) => manifest.id).sort());
    const hashes = await Promise.all(inputs.map(packContentHash));
    inputs.forEach((input, index) => {
      expect(stamps[input.manifest.id]!.sourceHash).toBe(hashes[index]);
    });
  }));
