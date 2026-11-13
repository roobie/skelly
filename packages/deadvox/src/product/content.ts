import { type BundledContent, createBundledContent } from '@skelly/engine/packs';
import { PRODUCT_ENTRY_PACK } from './packSelection.ts';
import { bundledPacks } from './packs.ts';

// Glob keys are relative to this directory, as the pack roots of `src/product/packs.ts`, `bundledPacks`, are.
export const productContent: BundledContent = await createBundledContent({
  entryPack: PRODUCT_ENTRY_PACK,
  packs: bundledPacks,
  files: {
    ...import.meta.glob<unknown>('../../mods/*/*.json', { eager: true, import: 'default' }),
    ...import.meta.glob<unknown>('../../../mods/*/*.json', { eager: true, import: 'default' }),
  },
});

export const { bundledPackInputs, availablePackInputs, baseSources, buildBundledContent } = productContent;
