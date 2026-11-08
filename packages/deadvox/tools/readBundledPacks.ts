// biome-ignore-all lint/correctness/noNodejsModules: bundled file provider for build tools and the CLI.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parse } from 'valibot';
import { canonicalJson } from '../src/core/canonicalJson.ts';
import { admitPacks, type PackInput, PackManifestSchema, packContentHash } from '../src/core/packAdmission.ts';
import { logicalKey, type PackFileEntry, type PackLocation, resolvePhysical } from '../src/core/packFiles.ts';
import { EXTERNAL_ASSET_ROOT } from '../src/product/externalRoot.ts';

/** Pack roots are relative to the product modules that glob them; see `src/product/packs.ts`, `bundledPacks`. */
export const PACK_ROOT_BASE = 'src/product';

/**
 * Every shipped pack, opt-in ones included, as the bundle stamp and file hashes cover them. `external` is the shared
 * root of built files, relative to `PACK_ROOT_BASE` as pack roots are; only the namespaces of the packs found here are
 * listed, and a file there that its pack does not declare is an error.
 */
export const readAvailablePacks = (packageRoot: string, external: string = EXTERNAL_ASSET_ROOT): PackInput[] => {
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
    const namespace = resolve(packageRoot, PACK_ROOT_BASE, external, manifest.id);
    const claimed = new Set(manifest.files.filter(({ kind }) => kind !== 'content').map(({ path }) => path));
    const externalFiles = existsSync(namespace)
      ? readdirSync(namespace, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
      : [];
    for (const entry of externalFiles) {
      const path = relative(namespace, resolve(entry.parentPath, entry.name)).split(sep).join('/');
      if (!claimed.has(path)) {
        throw new Error(`Pack ${manifest.id}: unlisted external file ${path}`);
      }
    }
    return {
      source: root,
      manifest,
      files: manifest.files.map((entry) => {
        const file = resolve(
          packageRoot,
          PACK_ROOT_BASE,
          resolvedKey(packageRoot, { root, manifest }, entry, external),
        );
        if (entry.kind === 'content') {
          return { source: entry.path, data: JSON.parse(readFileSync(file, 'utf8')) as unknown };
        }
        return { source: entry.path, data: fileDigest(readFileSync(file), entry.kind) };
      }),
    };
  });
  return inputs;
};

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** Canonical JSON digests by the digest of the bytes they were computed from. */
const canonicalDigests = new Map<string, string>();

/**
 * A declared file's identity hash: an asset's bytes, or a `json` entry's canonical JSON. Build tools and tests read
 * the packs many times per process, and canonicalising the pinned actor files dominates each read, so the same bytes
 * keep their canonical digest. Hashing the raw bytes costs a small part of parsing and canonicalising them.
 */
const fileDigest = (bytes: Buffer, kind: 'json' | 'asset'): string => {
  const raw = sha256(bytes);
  if (kind === 'asset') {
    return raw;
  }
  let digest = canonicalDigests.get(raw);
  if (digest === undefined) {
    digest = sha256(canonicalJson(JSON.parse(bytes.toString('utf8'))));
    canonicalDigests.set(raw, digest);
  }
  return digest;
};

/** Where an entry's bytes live, relative to `PACK_ROOT_BASE`: the one candidate present on disk. */
const resolvedKey = (packageRoot: string, pack: PackLocation, entry: PackFileEntry, external: string): string => {
  const resolved = resolvePhysical(
    pack,
    entry,
    { has: (key) => existsSync(resolve(packageRoot, PACK_ROOT_BASE, key)) },
    external,
  );
  if ('issue' in resolved) {
    throw new Error(resolved.issue.message);
  }
  return resolved.key;
};

const readResolved = (
  packageRoot: string,
  pack: PackLocation,
  entry: PackFileEntry,
  external: string,
): Buffer<ArrayBuffer> =>
  readFileSync(resolve(packageRoot, PACK_ROOT_BASE, resolvedKey(packageRoot, pack, entry, external)));

/** The bytes of one file a pack declares, from wherever the reader resolves it. */
export const packFileBytes = (
  packageRoot: string,
  pack: PackInput,
  path: string,
  external: string = EXTERNAL_ASSET_ROOT,
): Buffer<ArrayBuffer> => {
  const entry = pack.manifest.files.find((file) => file.path === path);
  if (!entry) {
    throw new Error(`Pack ${pack.manifest.id}: no declared file ${path}`);
  }
  return readResolved(packageRoot, { root: pack.source, manifest: pack.manifest }, entry, external);
};

/** Whether a declared json or asset entry resolves under the external root rather than its pack's root. */
export const packFileOrigin = (
  packageRoot: string,
  pack: PackInput,
  path: string,
  external: string = EXTERNAL_ASSET_ROOT,
): 'external' | 'local' => {
  const entry = pack.manifest.files.find((file) => file.path === path);
  if (!entry) {
    throw new Error(`Pack ${pack.manifest.id}: no declared file ${path}`);
  }
  const key = resolvedKey(packageRoot, { root: pack.source, manifest: pack.manifest }, entry, external);
  return key === logicalKey({ root: pack.source }, path) ? 'local' : 'external';
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
