import type { AuthoredGroundData, createAuthoredTerrain } from './authoredTerrainEvaluator.ts';
import type { CityPlan } from './cityPlan.ts';
import type { Vec3 } from './coords.ts';
import type { createForestTerrain } from './forestTerrainEvaluator.ts';
import type { Scale } from './scale.ts';
import type { BlockBox } from './structure.ts';
import type { CompiledTemplate, Placement, Turn } from './templates.ts';
import type { createWeatheringTerrain } from './weatheringTerrainEvaluator.ts';
import type { TerrainBlocks, TerrainShape } from './worldgen.ts';

export type TerrainTemplate = Pick<CompiledTemplate, 'size' | 'blocks' | 'ownership' | 'ground'>;
export interface TerrainPlacement {
  readonly template: TerrainTemplate;
  readonly origin: Vec3;
  readonly turn: Turn;
}

export type SiteTerrainPlan =
  | { readonly kind: 'natural' }
  | {
      readonly kind: 'city';
      readonly data: Pick<CityPlan, 'grid' | 'bounds' | 'core' | 'floor'>;
      readonly paving: number;
      readonly structures: readonly BlockBox[];
      readonly placements: readonly TerrainPlacement[];
    }
  | {
      readonly kind: 'authored';
      readonly ground: AuthoredGroundData;
      readonly data: Omit<Parameters<typeof createAuthoredTerrain>[0], 'ground' | 'placements'>;
      readonly placements: readonly TerrainPlacement[];
    }
  | { readonly kind: 'forest-flat'; readonly data: Parameters<typeof createForestTerrain>[0] }
  | { readonly kind: 'weathering-pad'; readonly data: Parameters<typeof createWeatheringTerrain>[0] };

export interface TerrainPlan {
  readonly seed: number;
  readonly scale: Scale;
  readonly blocks: TerrainBlocks;
  readonly shape: TerrainShape;
  readonly site: SiteTerrainPlan;
  /** Caller-supplied structures precede the site's ordered stamp stages. */
  readonly structures: readonly BlockBox[];
}

/** Strip gameplay metadata while retaining template sharing and buffer ownership on main. */
export function terrainPlacements(placements: readonly Placement[]): TerrainPlacement[] {
  const templates = new Map<CompiledTemplate, TerrainTemplate>();
  return placements.map(({ template, origin, turn }) => {
    let projected = templates.get(template);
    if (!projected) {
      projected = {
        size: template.size,
        blocks: template.blocks,
        ...(template.ownership && { ownership: template.ownership }),
        ...(template.ground && { ground: template.ground }),
      };
      templates.set(template, projected);
    }
    return { template: projected, origin, turn };
  });
}
