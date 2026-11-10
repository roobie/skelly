import { type BundledContent, createBundledContent } from '../../../engine/src/game/entries/packs.ts';
import { bundledPacks } from './packs.ts';

// Glob keys are relative to this directory, as the pack roots of `src/product/packs.ts`, `bundledPacks`, are.
export const productContent: BundledContent = await createBundledContent({
  packs: bundledPacks,
  files: {
    ...import.meta.glob<unknown>('../../mods/*/*.json', { eager: true, import: 'default' }),
    ...import.meta.glob<unknown>('../../../mods/*/*.json', { eager: true, import: 'default' }),
  },
});

export const { bundledPackInputs, availablePackInputs, baseSources, buildBundledContent } = productContent;
