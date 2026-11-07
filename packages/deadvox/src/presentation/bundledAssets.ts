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
}

const bundledAssetKey = (packId: string, path: string): string => `${packId}/${path}`;
const owningPack = (packs: readonly BundledPack[], path: string): BundledPack | undefined =>
  packs.find(({ root }) => path.startsWith(`${root}/`));

/** Keys asset URLs, given by path under a pack root, by their owning pack, so identical paths stay apart. */
export const bundledAssetFiles = (
  files: Readonly<Record<string, string>>,
  packs: readonly BundledPack[],
): PackAssetFiles => ({
  packs,
  urls: Object.fromEntries(
    Object.entries(files).map(([path, url]) => {
      const pack = owningPack(packs, path);
      if (!pack) {
        throw new Error(`No bundled pack for asset ${path}`);
      }
      return [bundledAssetKey(pack.manifest.id, path.slice(pack.root.length + 1)), url];
    }),
  ),
});

/** The URL of `path` in the pack that owns `source`, a content file under a pack root. */
export const bundledAssetUrl = (
  files: PackAssetFiles,
  source: string | undefined,
  path: string,
): string | undefined => {
  const pack = source === undefined ? undefined : owningPack(files.packs, source);
  return pack ? files.urls[bundledAssetKey(pack.manifest.id, path)] : undefined;
};
