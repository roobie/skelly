import { type BundledContent, createBundledContent } from '@skelly/engine/packs';
import { markLoad, measureLoad } from '../loadTiming.ts';
import { PRODUCT_ENTRY_PACK } from './packSelection.ts';
import { bundledPacks } from './packs.ts';

const contentBuildStart = markLoad('content bundle build start');

// Glob keys are relative to this directory, as the pack roots of `src/product/packs.ts`, `bundledPacks`, are.
export const productContent: BundledContent = await createBundledContent({
  entryPack: PRODUCT_ENTRY_PACK,
  packs: bundledPacks,
  files: {
    ...import.meta.glob<unknown>('../../mods/*/*.json', { eager: true, import: 'default' }),
    ...import.meta.glob<unknown>('../../../mods/*/*.json', { eager: true, import: 'default' }),
  },
});

/** @internal Exported for tests; the game reads these through `productContent`. */
export const { bundledPackInputs, availablePackInputs, baseSources } = productContent;
measureLoad('content bundle build', contentBuildStart, markLoad('content bundle build end'));
