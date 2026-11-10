import type { PackManifest } from '@skelly/engine/packs';
import { type BundledPack, bundledPacksFrom } from '@skelly/engine/packs';

// Only the product names its mod roots. Pack roots are the glob keys relative to this directory, which the
// content and asset globs beside it share, so asset keys resolve to their owning pack.
export const bundledPacks: readonly BundledPack[] = bundledPacksFrom({
  ...import.meta.glob<PackManifest>('../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
  ...import.meta.glob<PackManifest>('../../../mods/*/pack/manifest.json', { eager: true, import: 'default' }),
});
