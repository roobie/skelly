import { declaredAsset } from '../../../engine/src/packs.ts';
import type { BundledPack } from '../game/bundledContent.ts';

/** Asset URLs keyed by owning pack id and path, with the packs whose roots own them; the product globs both. */
export interface PackAssetFiles {
  readonly packs: readonly BundledPack[];
  readonly urls: Readonly<Record<string, string>>;
}

/** The product's pack assets, passed in by the product, which globs its own mod roots. */
export interface PresentationAssets {
  readonly audio: PackAssetFiles;
  readonly models: PackAssetFiles;
  readonly cursors: PackAssetFiles;
  /** Actor body and clip files; a session start fetches the ones its stack's figure rows name. */
  readonly figures: PackAssetFiles;
}

const bundledAssetKey = (packId: string, path: string): string => `${packId}/${path}`;
const owningPack = (packs: readonly BundledPack[], path: string): BundledPack | undefined =>
  packs.find(({ root }) => path.startsWith(`${root}/`));

/**
 * Keys asset URLs, given by path under a pack root or under the external root, by their owning pack, so identical
 * paths stay apart. A key in another product's external namespace is dropped; one inside a bundled namespace that its
 * pack does not declare, or a declared path found in both roots, is an error.
 */
export const bundledAssetFiles = (
  files: Readonly<Record<string, string>>,
  packs: readonly BundledPack[],
  external?: string,
): PackAssetFiles => {
  const urls: Record<string, string> = {};
  for (const [physical, url] of Object.entries(files)) {
    const owner = declaredAsset(packs, physical, external);
    if (owner.kind === 'foreign') {
      continue;
    }
    if (owner.kind === 'orphan') {
      throw new Error(`No bundled pack for asset ${physical}`);
    }
    const key = bundledAssetKey(owner.pack.manifest.id, owner.path);
    if (key in urls) {
      throw new Error(`Pack ${owner.pack.manifest.id}: file found in both roots ${owner.path}`);
    }
    urls[key] = url;
  }
  return { packs, urls };
};

/** The URL of `path` in the pack that owns `source`, a content file under a pack root. */
export const bundledAssetUrl = (
  files: PackAssetFiles,
  source: string | undefined,
  path: string,
): string | undefined => {
  const pack = source === undefined ? undefined : owningPack(files.packs, source);
  return pack ? files.urls[bundledAssetKey(pack.manifest.id, path)] : undefined;
};
