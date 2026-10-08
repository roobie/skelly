import { blockId, type Registry } from '../core/content.ts';
import type { Site } from '../core/site.ts';
import type { MetreBox } from '../core/structure.ts';
import { type BlockBox, rasterize, stampChunk } from '../core/structure.ts';
import type { Surface } from '../core/worldgen.ts';
import { terrainHeightMetres } from '../core/worldgen.ts';
import type { GameConfig } from './config.ts';

/** Concrete, brick and wood comparison bands share a world-x split and one viewing pad. */
export class DebugWeatheringTestSite implements Site {
  readonly spawn: Site['spawn'];
  readonly surface: Surface;
  private readonly structures: BlockBox[];
  private readonly padTop: number;
  readonly weatheringMaterialBoxes: readonly {
    id: 'concrete' | 'brick' | 'planks';
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }[];

  constructor(config: GameConfig, registry: Registry) {
    const { seed, scale } = config;
    const { blockSize } = scale;
    const floor = Math.round(terrainHeightMetres(seed, 0, 0) / blockSize) * blockSize;
    const concrete = blockId(registry, 'concrete');
    const brick = blockId(registry, 'brick');
    const planks = blockId(registry, 'planks');
    const bands = [
      { id: 'concrete' as const, block: concrete, minY: 0.5, maxY: 1.8 },
      { id: 'brick' as const, block: brick, minY: 1.8, maxY: 3.1 },
      { id: 'planks' as const, block: planks, minY: 3.1, maxY: 4.5 },
    ];
    this.weatheringMaterialBoxes = bands.map(({ id, minY, maxY }) => ({
      id,
      min: [-8, Math.floor((floor + minY) / blockSize) * blockSize, 0] as const,
      max: [8, Math.ceil((floor + maxY) / blockSize) * blockSize, Math.ceil(0.35 / blockSize) * blockSize] as const,
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
    this.structures = rasterize(boxes, blockSize);
    this.padTop = floor / blockSize - 1;
    this.surface = {
      height: (x, z, natural) =>
        x * blockSize >= -12 && x * blockSize < 12 && z * blockSize >= -16 && z * blockSize < 16
          ? this.padTop
          : natural,
      top: (x, z) =>
        x * blockSize >= -10 && x * blockSize < 10 && z * blockSize >= -2 && z * blockSize < 1 ? concrete : undefined,
    };
    this.spawn = { pos: [0, floor, 12], yaw: 0 };
  }

  stamp(chunk: Parameters<Site['stamp']>[0]): void {
    stampChunk(chunk, this.structures);
  }

  furnitureIn(): ReturnType<Site['furnitureIn']> {
    return [];
  }

  zombiesIn(): ReturnType<Site['zombiesIn']> {
    return [];
  }
}

export const buildDebugWeatheringTestSite = (
  config: GameConfig,
  registry: Registry,
): DebugWeatheringTestSite | undefined =>
  config.site === 'weatheringTest' && config.debug ? new DebugWeatheringTestSite(config, registry) : undefined;
