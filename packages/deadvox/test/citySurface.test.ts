import { buildRegistry } from '@skelly/engine/content';
import { buildCityPlan, cityGridOf } from '@skelly/engine/internal/core/cityPlan.ts';
import { ScenarioRouteSpace } from '@skelly/engine/internal/core/scenarioRoute.js';
import { type BlockBox, CHUNK, CitySite, makeScale, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';
import { terrainFor, withTerrainBoxes } from './fixtures/terrain.ts';

const profile = fixtureScenario();
const { registry, issues } = buildRegistry(fixtureScenarioSources(profile));
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const scale = makeScale(0.5);
const floor = CHUNK;

const siteWith = (flatSurroundings: boolean) => {
  const grid = { ...cityGridOf(registry, profile.city), flatSurroundings, blend: 16 };
  const plan = buildCityPlan({ seed: 73, registry, floor, grid, maxStoreys: 4, scenario: profile });
  return new CitySite(73, registry, scale, plan);
};

it('stamps ordered route terrain exactly once and reuses the loaded chunk', () => {
  const bounds = { x0: 0, x1: 8, z0: 0, z1: 8 };
  const point: Vec3 = [1, CHUNK + 1, 1];
  const first = registry.blockIds.get('fixture_solid')!;
  const last = registry.blockIds.get('asphalt')!;
  expect(first).not.toBe(last);
  const box = (block: number): BlockBox => ({ min: point, max: [2, CHUNK + 2, 2], block });
  const site = new CitySite(73, registry, scale, {
    grid: { ...cityGridOf(registry, profile.city), flatSurroundings: true, paving: [] },
    bounds,
    core: bounds,
    floor: 0,
    placements: [],
    underground: [],
    structures: [box(first)],
    service: undefined,
    serviceBlock: undefined,
    candidates: [],
    spawn: [0, 1, 0],
    portal: undefined,
    composition: undefined,
  });
  const space = new ScenarioRouteSpace(withTerrainBoxes(site, [box(last)]));
  space.blocked(...point);
  const chunk = space.world.getChunk(0, 1, 0)!;
  expect(chunk.get(1, 1, 1)).toBe(last);
  // Two different writes to an initially empty cell expose a repeated stamp pass.
  expect(chunk.revision).toBe(2);
  space.blocked(2, CHUNK + 1, 1);
  expect(space.world.getChunk(0, 1, 0)).toBe(chunk);
  expect(chunk.revision).toBe(2);
});

// Natural ground well above and well below the floor, so a held floor cannot pass by coincidence.
const naturals = [floor - 9, floor + 9];

describe('the city surface beyond its bounds', () => {
  it('stays at the floor at every distance when the surroundings are flat', () => {
    const site = siteWith(true);
    const { bounds } = site;
    for (const out of [1, 8, 16, 17, 200]) {
      for (const natural of naturals) {
        expect(
          terrainFor(site, site.registry, scale, site.seed).surface!.height(bounds.x1 + out, bounds.z0, natural),
        ).toBe(floor);
        expect(
          terrainFor(site, site.registry, scale, site.seed).surface!.height(bounds.x0 - out, bounds.z1, natural),
        ).toBe(floor);
      }
    }
  });

  it('blends to natural ground within the blend and keeps it beyond when the surroundings are not flat', () => {
    const site = siteWith(false);
    const { bounds } = site;
    for (const natural of naturals) {
      expect(
        terrainFor(site, site.registry, scale, site.seed).surface!.height(bounds.x1 + 1, bounds.z0, natural),
      ).not.toBe(natural);
      expect(
        terrainFor(site, site.registry, scale, site.seed).surface!.height(bounds.x1 + 16, bounds.z0, natural),
      ).toBe(natural);
      expect(
        terrainFor(site, site.registry, scale, site.seed).surface!.height(bounds.x1 + 200, bounds.z0, natural),
      ).toBe(natural);
    }
  });

  it('leaves the ground inside the bounds at the floor either way', () => {
    for (const flat of [true, false]) {
      const site = siteWith(flat);
      const { bounds } = site;
      expect(terrainFor(site, site.registry, scale, site.seed).surface!.height(bounds.x0, bounds.z0, floor + 9)).toBe(
        floor,
      );
    }
  });
});
