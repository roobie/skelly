import { bundledPacks } from '../game/bundledPacks.ts';

/** Asset URLs keyed by `bundledOriginAssetKey`, passed in by the product, which globs its own mod roots. */
export interface PresentationAssets {
  readonly audio: Readonly<Record<string, string>>;
  readonly models: Readonly<Record<string, string>>;
  readonly cursors: Readonly<Record<string, string>>;
}

const bundledAssetKey = (packId: string, path: string): string => `${packId}/${path}`;

export const bundledAssetFiles = (
  files: Readonly<Record<string, string>>,
  packs = bundledPacks,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(files).map(([path, url]) => {
      const pack = packs.find(({ root }) => path.startsWith(`${root}/`));
      if (!pack) {
        throw new Error(`No bundled pack for asset ${path}`);
      }
      return [bundledAssetKey(pack.manifest.id, path.slice(pack.root.length + 1)), url];
    }),
  );

export const bundledOriginAssetKey = (
  source: string | undefined,
  path: string,
  packs = bundledPacks,
): string | undefined => {
  const pack = packs.find(({ root }) => source?.startsWith(`${root}/`));
  return pack ? bundledAssetKey(pack.manifest.id, path) : undefined;
};
