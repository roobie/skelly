import { describe, expect, it } from 'vitest';
import { buildCityPlan, cityGridOf } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

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

// Natural ground well above and well below the floor, so a held floor cannot pass by coincidence.
const naturals = [floor - 9, floor + 9];

describe('the city surface beyond its bounds', () => {
  it('stays at the floor at every distance when the surroundings are flat', () => {
    const site = siteWith(true);
    const { bounds } = site;
    for (const out of [1, 8, 16, 17, 200]) {
      for (const natural of naturals) {
        expect(site.surface.height(bounds.x1 + out, bounds.z0, natural)).toBe(floor);
        expect(site.surface.height(bounds.x0 - out, bounds.z1, natural)).toBe(floor);
      }
    }
  });

  it('blends to natural ground within the blend and keeps it beyond when the surroundings are not flat', () => {
    const site = siteWith(false);
    const { bounds } = site;
    for (const natural of naturals) {
      expect(site.surface.height(bounds.x1 + 1, bounds.z0, natural)).not.toBe(natural);
      expect(site.surface.height(bounds.x1 + 16, bounds.z0, natural)).toBe(natural);
      expect(site.surface.height(bounds.x1 + 200, bounds.z0, natural)).toBe(natural);
    }
  });

  it('leaves the ground inside the bounds at the floor either way', () => {
    for (const flat of [true, false]) {
      const site = siteWith(flat);
      const { bounds } = site;
      expect(site.surface.height(bounds.x0, bounds.z0, floor + 9)).toBe(floor);
    }
  });
});
