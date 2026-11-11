import { blockId, type Registry } from '../core/content.ts';
import type { Site } from '../core/site.ts';
import { terrainShapeOf } from '../core/sitePalette.ts';
import type { MetreBox } from '../core/structure.ts';
import { rasterize } from '../core/structure.ts';
import { createWeatheringTerrain } from '../core/weatheringTerrainEvaluator.ts';
import type { Surface } from '../core/worldgen.ts';
import { terrainHeightMetres } from '../core/worldgen.ts';
import type { GameConfig } from './config.ts';

/** Concrete, brick and wood comparison bands share a world-x split and one viewing pad. */
export class DebugWeatheringTestSite implements Site {
  readonly spawn: Site['spawn'];
  readonly surface: Surface;
  private readonly stampTerrain: Site['stamp'];
  readonly weatheringMaterialBoxes: readonly {
    id: 'concrete' | 'brick' | 'planks';
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }[];

  constructor(config: GameConfig, registry: Registry) {
    const { seed, scale } = config;
    const { blockSize } = scale;
    const floor = Math.round(terrainHeightMetres(seed, terrainShapeOf(registry), 0, 0) / blockSize) * blockSize;
    const concrete = blockId(registry, 'concrete');
    const brick = blockId(registry, 'brick');
    const planks = blockId(registry, 'planks');
    const bands = [
      { id: 'concrete' as const, block: concrete, minY: 0.5, maxY: 1.8 },
      { id: 'brick' as const, block: brick, minY: 1.8, maxY: 3.1 },
      { id: 'planks' as const, block: planks, minY: 3.1, maxY: 4.5 },
    ];
    const rasterizedLower = (height: number): number => Math.floor((floor + height) / blockSize) * blockSize;
    const visibleBands = [
      { id: 'concrete' as const, minY: rasterizedLower(0.5), maxY: rasterizedLower(1.8) },
      { id: 'brick' as const, minY: rasterizedLower(1.8), maxY: rasterizedLower(3.1) },
      { id: 'planks' as const, minY: rasterizedLower(3.1), maxY: rasterizedLower(4) },
    ];
    this.weatheringMaterialBoxes = visibleBands.map(({ id, minY, maxY }) => ({
      id,
      min: [-8, minY, 0] as const,
      max: [8, maxY, Math.ceil(0.35 / blockSize) * blockSize] as const,
    }));
    const boxes: MetreBox[] = [
      { min: [-10, floor, -2], max: [10, floor + 0.5, 1], block: concrete },
      ...bands.map(
        ({ block, minY, maxY }): MetreBox => ({
          min: [-8, floor + minY, 0],
          max: [8, floor + maxY, 0.35],
          block,
        }),
      ),
      { min: [-8.5, floor + 4, -0.5], max: [8.5, floor + 4.5, 0.85], block: concrete },
    ];
    const evaluated = createWeatheringTerrain({
      blockSize,
      padTop: floor / blockSize - 1,
      heightPad: { x0: -12, x1: 12, z0: -16, z1: 16 },
      materialPad: { x0: -10, x1: 10, z0: -2, z1: 1 },
      concrete,
      structures: rasterize(boxes, blockSize),
    });
    this.surface = evaluated.surface;
    this.stampTerrain = evaluated.stamp;
    this.spawn = { pos: [0, floor, 12], yaw: 0 };
  }

  stamp(chunk: Parameters<Site['stamp']>[0]): void {
    this.stampTerrain(chunk);
  }

  lootPointsIn() {
    return [];
  }

  supplySourcesIn() {
    return [];
  }

  furnitureIn(): ReturnType<Site['furnitureIn']> {
    return [];
  }

  actorsIn(): ReturnType<Site['actorsIn']> {
    return [];
  }
}

export const buildDebugWeatheringTestSite = (
  config: GameConfig,
  registry: Registry,
): DebugWeatheringTestSite | undefined =>
  config.site === 'weatheringTest' && config.debug ? new DebugWeatheringTestSite(config, registry) : undefined;
