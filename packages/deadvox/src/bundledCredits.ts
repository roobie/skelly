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
      .map((source) => ({ source, data: manifests[source] })),
  );
