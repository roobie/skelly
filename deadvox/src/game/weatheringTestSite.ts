import { blockId, type Registry } from '../core/content.ts';
import type { Site } from '../core/site.ts';
import type { MetreBox } from '../core/structure.ts';
import { type BlockBox, rasterize, stampChunk } from '../core/structure.ts';
import type { Surface } from '../core/worldgen.ts';
import { terrainHeightMetres } from '../core/worldgen.ts';
import type { GameConfig } from './config.ts';

/** Two concrete walls straddling the debug weathering split, with a shared pad and small eaves. */
export class DebugWeatheringTestSite implements Site {
  readonly spawn: Site['spawn'];
  readonly surface: Surface;
  private readonly structures: BlockBox[];
  private readonly padTop: number;

  constructor(config: GameConfig, registry: Registry) {
    const { seed, scale } = config;
    const { blockSize } = scale;
    const floor = Math.round(terrainHeightMetres(seed, 0, 0) / blockSize) * blockSize;
    const concrete = blockId(registry, 'concrete');
    const boxes: MetreBox[] = [
      { min: [-10, floor, -2], max: [10, floor + 0.5, 1], block: concrete },
      { min: [-8, floor + 0.5, 0], max: [-2, floor + 4.5, 0.35], block: concrete },
      { min: [2, floor + 0.5, 0], max: [8, floor + 4.5, 0.35], block: concrete },
      { min: [-8.5, floor + 4, -0.5], max: [-1.5, floor + 4.5, 0.85], block: concrete },
      { min: [1.5, floor + 4, -0.5], max: [8.5, floor + 4.5, 0.85], block: concrete },
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
