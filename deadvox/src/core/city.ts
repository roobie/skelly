// Stacked benchmark buildings deliberately do not promise playable upper floors or population.
import { benchmarkCityGrid, buildCityPlan } from './cityPlan.ts';
import { CitySite } from './citySite.ts';
import type { Registry } from './content.ts';
import type { Scale } from './scale.ts';
import { lootPointsOf } from './site.ts';
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
        floor: terrainHeight(seed, scale, 0, 0),
        grid: benchmarkCityGrid(),
        maxStoreys: Math.max(1, maxStoreys),
      }),
    );
  }

  override lootPointsIn(cx: number, cz: number) {
    return (this.byColumn.get(`${cx},${cz}`) ?? []).flatMap((placement) =>
      lootPointsOf(this.registry, 'city', placement, [cx, cz]),
    );
  }
}
