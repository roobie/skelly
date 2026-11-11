// First-look forest workload. No foliage-specific renderer, LOD or cut-out path in this round.
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { createForestTerrain } from './forestTerrainEvaluator.ts';
import type { Scale } from './scale.ts';
import type { Rect, Site } from './site.ts';
import { siteGenerationOf, sitePalette, terrainShapeOf } from './sitePalette.ts';
import type { SiteTerrainPlan } from './terrainPlan.ts';
import { forestDensityAt, type TreePlacement, vegetationPlacements } from './vegetation.ts';
import { type Surface, terrainHeight } from './worldgen.ts';

export class Forest implements Site {
  readonly bounds: Rect;
  readonly trees: readonly TreePlacement[];
  readonly spawn: { pos: Vec3; yaw: number };
  readonly surface: Surface;
  readonly terrain: SiteTerrainPlan;
  private readonly stampTerrain: (chunk: Chunk) => void;

  constructor(seed: number, registry: Registry, scale: Scale, density: number | null = null) {
    const reach = siteGenerationOf(registry).vegetation.forestHalfExtentMetres / scale.blockSize;
    this.bounds = { x0: -reach, z0: -reach, x1: reach, z1: reach };
    // Flat inland ground isolates tree cost; extent covers the full 162m route plus the view radius.
    const floor = Math.max(Math.ceil(16 / scale.blockSize), terrainHeight(seed, terrainShapeOf(registry), scale, 0, 0));
    this.spawn = { pos: [0, (floor + 1) * scale.blockSize, 0], yaw: 0 };
    const clearing = 4 / scale.blockSize;
    this.trees = vegetationPlacements({
      seed,
      registry,
      scale,
      area: this.bounds,
      density: density ?? ((x, z) => forestDensityAt(registry, seed, x, z)),
      ground: () => floor,
      reserved: [{ x0: -clearing, z0: -clearing, x1: clearing, z1: clearing }],
    });
    const data = {
      bounds: this.bounds,
      floor,
      trees: this.trees,
      litter: sitePalette(registry).leafLitter,
    };
    this.terrain = { kind: 'forest-flat', data };
    const evaluated = createForestTerrain(data);
    this.surface = evaluated.surface;
    this.stampTerrain = evaluated.stamp;
  }

  stamp(chunk: Chunk): void {
    this.stampTerrain(chunk);
  }
  lootPointsIn() {
    return [];
  }
  supplySourcesIn() {
    return [];
  }
  furnitureIn() {
    return [];
  }
  actorsIn() {
    return [];
  }
}
