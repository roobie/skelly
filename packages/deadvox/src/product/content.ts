import type { PackManifest } from '../core/packAdmission.ts';
import { type BundledContent, createBundledContent } from '../game/bundledContent.ts';

// Only the product names its mod roots; runtime admission receives these maps. Glob keys are relative to this file,
// so pack roots share a base with the asset keys of `src/product/assets.ts`, `productAssets`.
export const productContent: BundledContent = await createBundledContent({
  manifests: {
    ...import.meta.glob<PackManifest>('../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
    ...import.meta.glob<PackManifest>('../../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
  },
  files: {
    ...import.meta.glob<unknown>('../../mods/*/*.json', { eager: true, import: 'default' }),
    ...import.meta.glob<unknown>('../../../mods/*/*.json', { eager: true, import: 'default' }),
  },
});

export const {
  packs: bundledPacks,
  bundledPackInputs,
  availablePackInputs,
  baseSources,
  buildBundledContent,
} = productContent;
