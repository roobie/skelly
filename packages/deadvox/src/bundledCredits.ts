import { mergeManifests } from './core/assets.ts';

const manifests = {
  ...import.meta.glob<unknown>('../mods/*/assets/manifest.json', { eager: true, import: 'default' }),
  ...import.meta.glob<unknown>('../../mods/*/assets/manifest.json', { eager: true, import: 'default' }),
};

/** Every bundled pack's credits, so moving an asset between packs cannot drop its credit. */
export const bundledCredits = () =>
  mergeManifests(
    Object.keys(manifests)
      .sort()
      // Named as the game names them from src/game, so a sound's origin finds its own pack's credits.
      .map((path) => ({ source: `../${path}`, data: manifests[path] })),
  );
