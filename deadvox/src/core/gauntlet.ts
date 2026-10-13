import { buildCityPlan, scenarioPlanIssues } from './cityPlan.ts';
import { CitySite } from './citySite.ts';
import type { Registry } from './content.ts';
import { toChunk } from './coords.ts';
import { Rng } from './random.ts';
import type { Scale } from './scale.ts';
import type { ScenarioDef } from './schema.ts';
import type { ZombieSpawn } from './site.ts';
import { placedSpawns } from './templates.ts';
import { terrainHeight } from './worldgen.ts';

export class GauntletSite extends CitySite {
  readonly scenario: ScenarioDef;
  constructor(seed: number, registry: Registry, scale: Scale, scenario: ScenarioDef) {
    const issues = scenarioPlanIssues(registry, scenario);
    if (issues.length > 0) {
      throw new Error(issues.map(([path, message]) => `${path}: ${message}`).join('\n'));
    }
    super(
      seed,
      registry,
      scale,
      buildCityPlan({ seed, registry, floor: terrainHeight(seed, scale, 0, 0), grid: scenario.city, scenario }),
    );
    this.scenario = scenario;
  }

  override zombiesIn(cx: number, cz: number): ZombieSpawn[] {
    return this.placements
      .flatMap(placedSpawns)
      .filter((marker) => toChunk(marker.pos[0]) === cx && toChunk(marker.pos[2]) === cz)
      .filter((marker) =>
        Rng.stream(this.seed, `scenario:${this.scenario.id}:spawn:${marker.pos.join(',')}`).chance(marker.chance),
      )
      .map(({ zombie, pos, window: spawnWindow }) => ({
        type: zombie,
        pos,
        ...(spawnWindow ? { window: spawnWindow } : {}),
      }));
  }
}
