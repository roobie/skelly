import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { validate } from '../src/cli/validate.ts';
import { buildRegistry } from '../src/engine/content.ts';
import { admitPacks, launcherModCatalogue, packContentHash } from '../src/engine/packs.ts';
import { declaredAssetGlobsPlugin } from '../tools/declaredAssetGlobsPlugin.ts';
import {
  bundledPackDefines,
  packFileBytes,
  packFileOrigin,
  readAvailablePacks,
  readBundledPacks,
} from '../tools/readBundledPacks.ts';
import { stampPacks } from '../tools/stampBundle.ts';

it('injects exporter JSON digests without model payloads while preserving runtime pack identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-digests-'));
  const directory = join(root, 'mods/fixture.digests');
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

/** A mod root with one default pack and one opt-in pack that depends on it. */
const withOptInPacks = async (check: (root: string) => void | Promise<void>): Promise<void> => {
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
    await check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

it('keeps opt-in packs out of the default identity and no-stack set while hashing them for selection', async () => {
  await withOptInPacks(async (root) => {
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
  });
});

it('lists a newly shipped opt-in pack in the launcher catalogue by its id, and no default pack', async () => {
  await withOptInPacks((root) => {
    const bundled = JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/config/bundled-mods.json'), 'utf8'));
    const { folderMods } = launcherModCatalogue(bundled, readAvailablePacks(root));
    expect(folderMods).toContain('fixture.opt-in');
    expect(folderMods).not.toContain('fixture.default');
  });
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
    // The shipped core tier carries the content every stack requires, so it stands in for the whole stack.
    const shipped = JSON.parse(readFileSync('mods/skelly.deadvox/pack/manifest.json', 'utf8'));
    const core = (shipped.dependencies as string[]).filter((dependency) => {
      const manifest = join(
        existsSync(resolve('../mods', dependency)) ? '../mods' : 'mods',
        dependency,
        'pack/manifest.json',
      );
      return JSON.parse(readFileSync(manifest, 'utf8')).tier === 'core';
    });
    writeFileSync(
      join(definitions, 'pack/manifest.json'),
      JSON.stringify({
        ...shipped,
        id: 'fixture.definitions',
        product: false,
        defaultStart: undefined,
        dependencies: core,
      }),
    );
    for (const dependency of core) {
      const modRoot = existsSync(resolve('../mods', dependency)) ? '../mods' : 'mods';
      symlinkSync(resolve(modRoot, dependency), join(root, modRoot, dependency), 'dir');
    }
    symlinkSync(resolve('../skelly-assets'), join(temporary, 'packages/skelly-assets'), 'dir');
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

it('validates the requested multi-root stack', () =>
  withMultiRootFixture((root) => {
    const output: string[] = [];
    expect(
      validate(['--stack', 'fixture.entry'], (line) => output.push(line), root),
      output.join('\n'),
    ).toBe(0);
  }));

it('rejects a missing stack argument and an unknown stack id', () =>
  withOptInPacks((root) => {
    const output: string[] = [];
    expect(validate(['--stack', 'fixture.absent'], (line) => output.push(line), root)).toBe(1);
    expect(validate(['--stack'], (line) => output.push(line), root)).toBe(1);
  }));

/** The external root of these fixtures, relative to `PACK_ROOT_BASE` as the product's is. */
const EXTERNAL = '../../built';
const EXPORT = 'things/built.model.json';
const MODEL = 'assets/models/built.glb';
const SHA256 = /^[0-9a-f]{64}$/;

/** One pack whose json and asset entries live only under the fixture's external root. */
const withExternalPack = async (check: (root: string) => void | Promise<void>): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), 'external-packs-'));
  try {
    const directory = join(root, 'mods/fixture.built');
    mkdirSync(join(directory, 'pack'), { recursive: true });
    writeFileSync(
      join(directory, 'pack/manifest.json'),
      JSON.stringify({
        id: 'fixture.built',
        version: '1',
        tier: 'theme',
        product: false,
        dependencies: [],
        overrides: [],
        files: [
          { path: 'rows.json', kind: 'content' },
          { path: EXPORT, kind: 'json' },
          { path: MODEL, kind: 'asset' },
        ],
      }),
    );
    writeFileSync(join(directory, 'rows.json'), JSON.stringify({ items: [] }));
    mkdirSync(join(root, 'built/fixture.built/things'), { recursive: true });
    mkdirSync(join(root, 'built/fixture.built/assets/models'), { recursive: true });
    writeFileSync(join(root, 'built/fixture.built', EXPORT), JSON.stringify({ fixtureGeometry: 1 }));
    writeFileSync(join(root, 'built/fixture.built', MODEL), new Uint8Array([1, 2, 3]));
    await check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

it('the build-time reader finds external files and hashes them', () =>
  withExternalPack((root) => {
    const [pack] = readAvailablePacks(root, EXTERNAL);
    expect([...packFileBytes(root, pack!, MODEL, EXTERNAL)]).toEqual([1, 2, 3]);
    expect(packFileOrigin(root, pack!, EXPORT, EXTERNAL)).toBe('external');
    expect(pack!.files.find(({ source }) => source === MODEL)!.data).toMatch(SHA256);
    mkdirSync(join(root, 'mods/fixture.built/assets/models'), { recursive: true });
    writeFileSync(join(root, 'mods/fixture.built', MODEL), new Uint8Array([1, 2, 3]));
    expect(() => readAvailablePacks(root, EXTERNAL)).toThrow(`file found in both roots ${MODEL}`);
    rmSync(join(root, 'mods/fixture.built', MODEL));
    rmSync(join(root, 'built/fixture.built', MODEL));
    expect(() => readAvailablePacks(root, EXTERNAL)).toThrow(`missing file ${MODEL}`);
  }));

it('leaves an unconsumed released model installed without declaring or hashing its files', () =>
  withExternalPack((root) => {
    const sidecar = 'gungen/built.model.json';
    rmSync(join(root, 'built/fixture.built', EXPORT));
    const unusedModel = 'assets/models/unused.glb';
    const unusedExport = 'things/unused.model.json';
    const auxiliary = 'needed.json';
    const body = 'actors/fixture.body.json';
    const clips = 'actors/fixture.clips.json';
    const files = [MODEL, sidecar, unusedModel, unusedExport, auxiliary, body, clips];
    const release = {
      packs: { 'fixture.built': { files } },
      models: [
        { id: 'built', pack: 'fixture.built', path: MODEL, credits: { author: 'Fixture', licence: 'CC0-1.0' } },
        { id: 'unused', pack: 'fixture.built', path: unusedModel, credits: { author: 'Fixture', licence: 'CC0-1.0' } },
      ],
    };
    writeFileSync(join(root, 'built/manifest.json'), JSON.stringify(release));
    for (const path of [sidecar, unusedModel, unusedExport, auxiliary, body, clips]) {
      mkdirSync(join(root, 'built/fixture.built', path, '..'), { recursive: true });
      writeFileSync(join(root, 'built/fixture.built', path), path.endsWith('.json') ? '{}' : 'unused');
    }
    const jsonnetSource = join(root, 'manifest.jsonnet');
    writeFileSync(
      jsonnetSource,
      `local select = import 'tools/jsonnet/lib/used-models.libsonnet';
       local built = import 'tools/jsonnet/lib/built-pack.libsonnet';
       local manifest = import 'tools/jsonnet/lib/pack-manifest.libsonnet';
       local index = [{id: 'built', file: '${MODEL}', extra: '${auxiliary}'}, {id: 'unused', file: '${unusedModel}'}];
       local admitted = {models: select(index, [{items: [{model: 'built'}]}]),
         actorFigures: [{id: 'fixture', body: '${body}', clips: '${clips}', mesh: '${MODEL}'}]};
       local selected = built.consumed('fixture.built', [admitted], ${JSON.stringify(release)});
       {admitted: admitted, pack: manifest(id='fixture.built', tier='theme', content=['rows'],
         assets={releasedFiles:: selected.files, sources: selected.sources})}`,
    );
    const { pack: manifest, admitted } = JSON.parse(compileJsonnetFile(jsonnetSource));
    expect(manifest.files.map(({ path }: { path: string }) => path).sort()).toEqual(
      ['rows.json', MODEL, sidecar, auxiliary, body, clips].sort(),
    );
    writeFileSync(join(root, 'mods/fixture.built/pack/manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'mods/fixture.built/rows.json'), JSON.stringify(admitted));
    const [pack] = readAvailablePacks(root, EXTERNAL);
    expect(pack!.files.map(({ source }) => source).sort()).toEqual(
      manifest.files.map(({ path }: { path: string }) => path).sort(),
    );
    expect(existsSync(join(root, 'built/fixture.built', unusedModel))).toBe(true);
    const plugin = declaredAssetGlobsPlugin(root, [pack!], EXTERNAL);
    const transformed = plugin.transform.call(
      {} as never,
      `const models = import.meta.glob(['./@skelly/released-models/*.glb']);
       const figures = import.meta.glob(['./@skelly/released-figures/*.{glb,json}']);`,
      resolve(root, 'src/product/assets.ts'),
    );
    expect(transformed).toContain(`${EXTERNAL}/fixture.built/${MODEL}`);
    expect(transformed).toContain(`${EXTERNAL}/fixture.built/${body}`);
    expect(transformed).toContain(`${EXTERNAL}/fixture.built/${clips}`);
    expect(transformed).not.toContain(unusedModel);
    expect(transformed).not.toContain('@skelly/');
  }));

it('rejects an undeclared external file absent from the pinned release manifest', () =>
  withExternalPack((root) => {
    writeFileSync(
      join(root, 'built/manifest.json'),
      JSON.stringify({ packs: { 'fixture.built': { files: [MODEL, EXPORT] } } }),
    );
    writeFileSync(join(root, 'built/fixture.built/assets/models/stray.glb'), new Uint8Array([0]));
    expect(() => readAvailablePacks(root, EXTERNAL)).toThrow('unlisted external file assets/models/stray.glb');
  }));

it('a directory under the external root naming no bundled pack is not listed and raises nothing', () =>
  withExternalPack((root) => {
    mkdirSync(join(root, 'built/fixture.other'), { recursive: true });
    writeFileSync(join(root, 'built/fixture.other/stray.json'), '{}');
    expect(readAvailablePacks(root, EXTERNAL).map(({ manifest }) => manifest.id)).toEqual(['fixture.built']);
  }));

it('external json and asset entries admit in the browser with the reader hashes', () =>
  withExternalPack(async (root) => {
    const [input] = readAvailablePacks(root, EXTERNAL);
    const defines = await bundledPackDefines([input!]);
    const hashes: Record<string, string> = JSON.parse(defines.__SKELLY_FILE_HASHES__!);
    const identities = JSON.parse(defines.__SKELLY_CONTENT_PACKS__!);
    // The browser looks each entry up by its logical key, as `src/game/bundledContent.ts` does.
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
    expect(runtime.files.every(({ data }) => data !== undefined)).toBe(true);
    expect(await packContentHash(runtime)).toBe(identities[0].canonicalHash);
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
