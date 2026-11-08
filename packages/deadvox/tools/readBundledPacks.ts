// biome-ignore-all lint/correctness/noNodejsModules: bundled file provider for build tools and the CLI.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parse } from 'valibot';
import { canonicalJson } from '../src/core/canonicalJson.ts';
import { admitPacks, type PackInput, PackManifestSchema, packContentHash } from '../src/core/packAdmission.ts';
import { logicalKey, type PackFileEntry, type PackLocation, resolvePhysical } from '../src/core/packFiles.ts';

/** Pack roots are relative to the product modules that glob them; see `src/product/packs.ts`, `bundledPacks`. */
export const PACK_ROOT_BASE = 'src/product';

/** Every shipped pack, opt-in ones included, as the bundle stamp and file hashes cover them. */
export const readAvailablePacks = (packageRoot: string): PackInput[] => {
  const roots = ['mods', '../mods']
    .flatMap((root) => {
      const directory = resolve(packageRoot, root);
      return existsSync(directory)
        ? readdirSync(directory, { withFileTypes: true })
            .filter(
              (entry) =>
                (entry.isDirectory() || entry.isSymbolicLink()) &&
                existsSync(resolve(directory, entry.name, 'pack/manifest.json')),
            )
            .map((entry) =>
              relative(resolve(packageRoot, PACK_ROOT_BASE), resolve(directory, entry.name)).split(sep).join('/'),
            )
        : [];
    })
    // The save identity lists packs in this order, so it follows the game's: `src/game/bundledContent.ts`,
    // `createBundledContent`.
    .sort((left, right) => `${left}/pack/manifest.json`.localeCompare(`${right}/pack/manifest.json`));
  const inputs = roots.map((root) => {
    const manifest = parse(
      PackManifestSchema,
      JSON.parse(readFileSync(resolve(packageRoot, PACK_ROOT_BASE, root, 'pack/manifest.json'), 'utf8')),
    );
    const directory = resolve(packageRoot, PACK_ROOT_BASE, root);
    const declared = new Set(['pack/manifest.json', ...manifest.files.map(({ path }) => path)]);
    for (const file of readdirSync(directory, { recursive: true, encoding: 'utf8' })) {
      const path = file.split(sep).join('/');
      if (path.endsWith('.json') && !declared.has(path)) {
        throw new Error(`Pack ${manifest.id}: unlisted JSON file ${path}`);
      }
    }
    return {
      source: root,
      manifest,
      files: manifest.files.map((entry) => {
        const bytes = readResolved(packageRoot, { root, manifest }, entry);
        const data: unknown = entry.kind === 'asset' ? undefined : JSON.parse(bytes.toString('utf8'));
        return {
          source: entry.path,
          data:
            entry.kind === 'content'
              ? data
              : createHash('sha256')
                  .update(entry.kind === 'json' ? canonicalJson(data) : bytes)
                  .digest('hex'),
        };
      }),
    };
  });
  return inputs;
};

// No external root is supplied yet, so every entry resolves to its one local candidate.
const readResolved = (packageRoot: string, pack: PackLocation, entry: PackFileEntry): Buffer<ArrayBuffer> => {
  const physical = (key: string) => resolve(packageRoot, PACK_ROOT_BASE, key);
  const resolved = resolvePhysical(pack, entry, { has: (key) => existsSync(physical(key)) });
  if ('issue' in resolved) {
    throw new Error(resolved.issue.message);
  }
  return readFileSync(physical(resolved.key));
};

/** The bytes of one file a pack declares, from wherever the reader resolves it. */
export const packFileBytes = (packageRoot: string, pack: PackInput, path: string): Buffer<ArrayBuffer> => {
  const entry = pack.manifest.files.find((file) => file.path === path);
  if (!entry) {
    throw new Error(`Pack ${pack.manifest.id}: no declared file ${path}`);
  }
  return readResolved(packageRoot, { root: pack.source, manifest: pack.manifest }, entry);
};

/** The default packs, or the named stack's closure, which may include opt-in packs it names. */
export const readBundledPacks = (packageRoot: string, stack?: string): PackInput[] => {
  const inputs = readAvailablePacks(packageRoot);
  if (stack === undefined) {
    return inputs.filter(({ manifest }) => !manifest.optIn);
  }
  const selected = new Set<string>();
  const visit = (id: string): void => {
    if (selected.has(id)) {
      return;
    }
    selected.add(id);
    const pack = inputs.find(({ manifest }) => manifest.id === id);
    if (!pack) {
      throw new Error(`Unknown stack pack "${id}"`);
    }
    pack.manifest.dependencies.forEach(visit);
  };
  visit(stack);
  return inputs.filter(({ manifest }) => selected.has(manifest.id));
};

/** A stack's content files, following its packs so a reader keeps seeing a row when its mod moves. */
export const readStackContentFiles = (packageRoot: string, stack: string) =>
  readBundledPacks(packageRoot, stack).flatMap(({ source: pack, manifest, files }) =>
    manifest.files
      .filter(({ kind }) => kind === 'content')
      .map(({ path: file }) => ({ pack, file, data: files.find(({ source }) => source === file)!.data })),
  );

/** A stack's content as sources labelled by file name, in a stable order. */
export const readStackContentSources = (packageRoot: string, stack: string) =>
  readStackContentFiles(packageRoot, stack)
    .map(({ file, data }) => ({ source: file, data }))
    .sort((left, right) => left.source.localeCompare(right.source));

const CONTENT_PACKS_DEFINE = '__SKELLY_CONTENT_PACKS__';
const OPT_IN_PACKS_DEFINE = '__SKELLY_OPT_IN_PACKS__';
const FILE_HASHES_DEFINE = '__SKELLY_FILE_HASHES__';

const admitted = (inputs: readonly PackInput[]): PackInput[] => {
  const { packs, issues } = admitPacks(inputs);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  return packs;
};

const identities = (packs: readonly PackInput[]) =>
  Promise.all(
    packs.map(async (pack) => ({
      id: pack.manifest.id,
      version: pack.manifest.version,
      canonicalHash: await packContentHash(pack),
    })),
  );

/** Identities of the default packs and, separately, of the opt-in packs, plus every available pack's file hashes. */
export const bundledPackDefines = async (inputs: readonly PackInput[]): Promise<Record<string, string>> => {
  const packs = admitted(inputs);
  const defaults = admitted(inputs.filter(({ manifest }) => !manifest.optIn));
  const hashes = Object.fromEntries(
    packs.flatMap((pack) =>
      pack.manifest.files
        .filter(({ kind }) => kind !== 'content')
        .map(({ path }) => [
          logicalKey({ root: pack.source }, path),
          pack.files.find(({ source }) => source === path)!.data,
        ]),
    ),
  );
  return {
    [CONTENT_PACKS_DEFINE]: JSON.stringify(await identities(defaults)),
    [OPT_IN_PACKS_DEFINE]: JSON.stringify(await identities(packs.filter(({ manifest }) => manifest.optIn))),
    [FILE_HASHES_DEFINE]: JSON.stringify(hashes),
  };
};
