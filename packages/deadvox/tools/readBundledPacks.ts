// biome-ignore-all lint/correctness/noNodejsModules: bundled file provider for build tools and the CLI.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { parse } from 'valibot';
import { canonicalJson } from '../src/core/canonicalJson.ts';
import { admitPacks, type PackInput, PackManifestSchema, packContentHash } from '../src/core/packAdmission.ts';
import { bundledPacks } from '../src/game/bundledPacks.ts';

export const readBundledPacks = (packageRoot: string): PackInput[] =>
  bundledPacks.map(({ root }) => {
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

const CONTENT_PACKS_DEFINE = '__DEADVOX_CONTENT_PACKS__';
const FILE_HASHES_DEFINE = '__DEADVOX_FILE_HASHES__';

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
