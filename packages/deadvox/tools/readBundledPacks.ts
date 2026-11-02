// biome-ignore-all lint/correctness/noNodejsModules: bundled file provider for build tools and the CLI.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'valibot';
import { admitPacks, type PackInput, PackManifestSchema, packContentHash } from '../src/core/packAdmission.ts';
import { bundledPacks } from '../src/game/bundledPacks.ts';

export const readBundledPacks = (packageRoot: string): PackInput[] =>
  bundledPacks.map(({ root }) => {
    const manifest = parse(
      PackManifestSchema,
      JSON.parse(readFileSync(resolve(packageRoot, 'src/game', root, 'pack/manifest.json'), 'utf8')),
    );
    return {
      source: root,
      manifest,
      files: manifest.files.map(({ path, kind }) => {
        const bytes = readFileSync(resolve(packageRoot, 'src/game', root, path));
        return {
          source: path,
          data:
            kind === 'asset'
              ? createHash('sha256').update(bytes).digest('hex')
              : (JSON.parse(bytes.toString('utf8')) as unknown),
        };
      }),
    };
  });

const CONTENT_PACKS_DEFINE = '__DEADVOX_CONTENT_PACKS__';
const ASSET_HASHES_DEFINE = '__DEADVOX_ASSET_HASHES__';

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
  const assets = Object.fromEntries(
    packs.flatMap((pack) =>
      pack.manifest.files
        .filter(({ kind }) => kind === 'asset')
        .map(({ path }) => [`${pack.source}/${path}`, pack.files.find(({ source }) => source === path)!.data]),
    ),
  );
  return {
    [CONTENT_PACKS_DEFINE]: JSON.stringify(identities),
    [ASSET_HASHES_DEFINE]: JSON.stringify(assets),
  };
};
