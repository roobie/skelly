// Stacked benchmark buildings deliberately do not promise playable upper floors or population.
import { benchmarkCityGrid, buildCityPlan } from './cityPlan.ts';
import { CitySite } from './citySite.ts';
import type { Registry } from './content.ts';
import type { Scale } from './scale.ts';
import { terrainShapeOf } from './sitePalette.ts';
import { terrainHeight } from './worldgen.ts';

export class StressCity extends CitySite {
  constructor(seed: number, registry: Registry, scale: Scale, maxStoreys = 1) {
    super(
      seed,
      registry,
      scale,
      buildCityPlan({
        seed,
        registry,
        floor: terrainHeight(seed, terrainShapeOf(registry), scale, 0, 0),
        grid: benchmarkCityGrid(registry),
        maxStoreys: Math.max(1, maxStoreys),
      }),
    );
  }
}
