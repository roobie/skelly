import { describe, expect, it } from 'vitest';
import { StressCity } from '../src/core/city.ts';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { sitePalette } from '../src/core/sitePalette.ts';
import { compileTemplate, stackTemplate } from '../src/core/templates.ts';
import { fixtureScenarioSources } from './fixtures/scenario.ts';
import { content as BUNDLED_CONTENT, siteFromUrl } from './fixtures/startupContent.ts';

const { registry } = BUNDLED_CONTENT;
const scale = makeScale(0.5);

describe('the stress-test city', () => {
  it('retains benchmark extent and street spawning without population', () => {
    const city = new StressCity(2, registry, scale);
    expect(city.placements.length).toBeGreaterThan(0);
    const [x, , z] = city.spawn.pos.map((m) => m / scale.blockSize);
    expect(city.surface.top(Math.floor(x!), Math.floor(z!))).toBe(sitePalette(registry).paving);
    expect((city.bounds.x1 - city.bounds.x0) * scale.blockSize).toBeGreaterThanOrEqual(
      2 * [...registry.cityBenchmarks.values()][0]!.reachMetres,
    );
    expect(city.plan.service).toBeUndefined();
    expect(city.zombiesIn(0, 0)).toEqual([]);
  });

  it('stacks owned storeys and their nonempty furniture without duplicating the foundation', () => {
    const fixture = buildRegistry(fixtureScenarioSources());
    expect(fixture.issues).toEqual([]);
    const house = compileTemplate(fixture.registry, fixture.registry.templates.get('fixture_house')!);
    expect(house.pieces.length).toBeGreaterThan(0);
    const tall = stackTemplate(house, 3);
    const [, sy] = house.size;
    expect(tall.size[1]).toBe(1 + 3 * (sy - 1));
    expect(tall.pieces).toHaveLength(3 * house.pieces.length);
    expect(stackTemplate(house, 1)).toBe(house);
  });

  it('is chosen from the URL', () => {
    expect(siteFromUrl(new URLSearchParams(''), 'hamlet')).toEqual({ site: 'hamlet', storeys: 1, density: null });
    expect(siteFromUrl(new URLSearchParams('site=city&storeys=6'), 'testHouse')).toEqual({
      site: 'city',
      storeys: 6,
      density: null,
    });
    expect(siteFromUrl(new URLSearchParams('site=city&storeys=99'), 'hamlet')).toEqual({
      site: 'city',
      storeys: 1,
      density: null,
    });
    expect(siteFromUrl(new URLSearchParams('site=testHouse'), 'hamlet')).toEqual({
      site: 'testHouse',
      storeys: 1,
      density: null,
    });
    expect(siteFromUrl(new URLSearchParams('site=bogus'), 'hamlet')).toEqual({
      site: 'hamlet',
      storeys: 1,
      density: null,
    });
  });
});
