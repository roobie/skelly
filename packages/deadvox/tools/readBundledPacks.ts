// biome-ignore-all lint/correctness/noNodejsModules: bundled file provider for build tools and the CLI.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parse } from 'valibot';
import { canonicalJson } from '../src/core/canonicalJson.ts';
import { admitPacks, type PackInput, PackManifestSchema, packContentHash } from '../src/core/packAdmission.ts';

export const readBundledPacks = (packageRoot: string, stack?: string): PackInput[] => {
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
              relative(resolve(packageRoot, 'src/game'), resolve(directory, entry.name)).split(sep).join('/'),
            )
        : [];
    })
    .sort();
  const inputs = roots.map((root) => {
    const manifest = parse(
      PackManifestSchema,
      JSON.parse(readFileSync(resolve(packageRoot, 'src/game', root, 'pack/manifest.json'), 'utf8')),
    );
    const directory = resolve(packageRoot, 'src/game', root);
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
      files: manifest.files.map(({ path, kind }) => {
        const bytes = readFileSync(resolve(directory, path));
        const data: unknown = kind === 'asset' ? undefined : JSON.parse(bytes.toString('utf8'));
        return {
          source: path,
          data:
            kind === 'content'
              ? data
              : createHash('sha256')
                  .update(kind === 'json' ? canonicalJson(data) : bytes)
                  .digest('hex'),
        };
      }),
    };
  });
  if (stack === undefined) {
    return inputs;
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
const FILE_HASHES_DEFINE = '__SKELLY_FILE_HASHES__';

export const bundledPackDefines = async (inputs: readonly PackInput[]): Promise<Record<string, string>> => {
  const { packs, issues } = admitPacks(inputs);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  const identities = await Promise.all(
    packs.map(async (pack) => ({
      id: pack.manifest.id,
      version: pack.manifest.version,
      canonicalHash: await packContentHash(pack),
    })),
  );
  const hashes = Object.fromEntries(
    packs.flatMap((pack) =>
      pack.manifest.files
        .filter(({ kind }) => kind !== 'content')
        .map(({ path }) => [`${pack.source}/${path}`, pack.files.find(({ source }) => source === path)!.data]),
    ),
  );
  return {
    [CONTENT_PACKS_DEFINE]: JSON.stringify(identities),
    [FILE_HASHES_DEFINE]: JSON.stringify(hashes),
  };
};
