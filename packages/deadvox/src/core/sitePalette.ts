// Resolves the site-generation content's block and template names to registry ids. Content
// validation (`checkSiteGeneration` in `content.ts`) guarantees every name exists.
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { TerrainBlocks, TerrainShape } from './worldgen.ts';

export interface SitePalette {
  readonly terrain: TerrainBlocks;
  readonly paving: number;
  readonly trees: { readonly trunk: number; readonly branch: number; readonly leaves: number };
  readonly leafLitter: number;
}

export const siteGenerationOf = (registry: Pick<Registry, 'siteGeneration'>) => {
  const entry = registry.siteGeneration.get(CORE_CONTENT_IDS.authoredSite);
  if (!entry) {
    throw new Error('Missing site generation content');
  }
  return entry;
};

export const terrainShapeOf = (registry: Pick<Registry, 'siteGeneration'>): TerrainShape =>
  siteGenerationOf(registry).terrain;

export const sitePalette = (registry: Pick<Registry, 'siteGeneration' | 'blockIds'>): SitePalette => {
  const { palette } = siteGenerationOf(registry);
  const block = (name: string): number => {
    const id = registry.blockIds.get(name);
    if (id === undefined) {
      throw new Error(`Site generation names unknown block "${name}"`);
    }
    return id;
  };
  return {
    terrain: {
      grass: block(palette.terrain.grass),
      dirt: block(palette.terrain.dirt),
      rock: block(palette.terrain.rock),
      sand: block(palette.terrain.sand),
    },
    paving: block(palette.paving),
    trees: {
      trunk: block(palette.trees.trunk),
      branch: block(palette.trees.branch),
      leaves: block(palette.trees.leaves),
    },
    leafLitter: block(palette.leafLitter),
  };
};
