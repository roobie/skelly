import { buildRegistry } from '@skelly/engine/content';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { SiteLayoutSchema } from '@skelly/engine/internal/core/schema/layouts.ts';
import { type ComposedSiteDef, ComposedSiteSchema } from '@skelly/engine/internal/core/schema/scenarios.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { makeScale } from '@skelly/engine/world';
import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { fixtureLootContext } from './economyFixtures.ts';
import { fixtureScenario, fixtureScenarioSources, fixtureStartRow } from './fixtures/scenario.ts';

const scenarioFixture = (): ComposedSiteDef => {
  const city = fixtureScenario();
  return parse(ComposedSiteSchema, {
    id: 'fixture_composed',
    kind: 'composedSite',
    outbreakAgeGameHours: city.outbreakAgeGameHours,
    decalLimit: city.decalLimit,
    body: city.body,
    compression: city.compression,
    lootContext: fixtureLootContext(),
    bounds: { x0: -80, z0: -80, x1: 80, z1: 80 },
    ground: 0,
    settlementKind: 'fixture_city',
    start: { ask: 'home' },
    placement: { apronMetres: 2, attempts: 100 },
    asks: [
      { kind: 'place', id: 'home', template: 'fixture_cabin', supplies: ['timber'] },
      {
        kind: 'place',
        id: 'stock',
        template: 'fixture_cabin',
        supplies: ['timber'],
        distance: {
          from: 'home',
          curve: [
            [10, 2],
            [40, 1],
            [60, 0],
          ],
        },
      },
    ],
    guarantee: { timber: 2 },
    population: { ...city.population, settlementPressure: false, authoredMarkers: false, hordes: 0 },
  });
};

const load = (scenario = scenarioFixture(), kinds?: string[]) => {
  const sources = fixtureScenarioSources();
  const data = sources[0]!.data as ContentFile;
  data.scenarios = [scenario];
  data.starts = [fixtureStartRow(null, { site: scenario.id })];
  data.templates!.push({
    id: 'fixture_cabin',
    lootContext: fixtureLootContext(),
    size: [3, 5, 4],
    palette: { '=': 'fixture_solid', '.': 'air' },
    layers: [
      ['===', '===', '===', '==='],
      ['...', '...', '...', '...'],
      ['...', '...', '...', '...'],
      ['...', '...', '...', '...'],
      ['...', '...', '...', '...'],
    ],
    access: { ground: 'ground', entrance: [1, 1, 1], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
    ...(kinds ? { eligibility: { settlementKinds: kinds } } : {}),
  });
  return buildRegistry(sources);
};

it.each([11, 73])(
  'compiles flat asks to a loadable layout with disjoint reservations inside bounds (seed %s)',
  (seed) => {
    const scenario = scenarioFixture();
    const { registry, issues } = load(scenario);
    expect(issues).toEqual([]);
    const { layout, reservations } = composeLayout(seed, registry, scenario);
    expect(parse(SiteLayoutSchema, layout)).toEqual(layout);
    expect(layout.buildings).toHaveLength(scenario.asks.length);
    expect(reservations).toHaveLength(scenario.asks.length);
    expect(reservations.some((r) => r.kind === 'start')).toBe(true);
    for (const [i, rect] of reservations.entries()) {
      expect(rect.x0).toBeGreaterThanOrEqual(scenario.bounds.x0);
      expect(rect.z0).toBeGreaterThanOrEqual(scenario.bounds.z0);
      expect(rect.x1).toBeLessThanOrEqual(scenario.bounds.x1);
      expect(rect.z1).toBeLessThanOrEqual(scenario.bounds.z1);
      for (const other of reservations.slice(i + 1)) {
        expect(rect.x1 <= other.x0 || other.x1 <= rect.x0 || rect.z1 <= other.z0 || other.z1 <= rect.z0).toBe(true);
      }
    }
    const site = new AuthoredSite(seed, registry, makeScale(0.5), layout);
    expect(site.spawn.pos).toEqual(layout.player.position);
    expect(site.authoredPlacements).toHaveLength(layout.buildings.length);
  },
);

it('appending an ask preserves every earlier placement and reservation', () => {
  const scenario = scenarioFixture();
  const { registry } = load(scenario);
  const earlier = composeLayout(11, registry, scenario);
  scenario.asks.push({ kind: 'place', id: 'extra', template: 'fixture_cabin', supplies: [] });
  const appended = composeLayout(11, registry, scenario);
  expect(appended.layout.buildings.slice(0, -1)).toEqual(earlier.layout.buildings);
  expect(appended.reservations.slice(0, -1)).toEqual(earlier.reservations);
  expect(appended.layout.player).toEqual(earlier.layout.player);
});

it('reports insufficient supply counts at content load, counting each ask once', () => {
  const scenario = scenarioFixture();
  scenario.asks[0]!.supplies.push('timber');
  scenario.guarantee.timber = scenario.asks.length + 1;
  expect(load(scenario).issues).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining('.guarantee.timber'),
      message: expect.stringContaining('sources'),
    }),
  );
});

it('passes settlement eligibility down and permits direct templates without eligibility', () => {
  const scenario = scenarioFixture();
  expect(load(scenario).issues).toEqual([]);
  expect(load(scenario, ['fixture_city']).issues).toEqual([]);
  expect(load(scenario, ['other_kind']).issues).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining('.asks[0].template'),
      message: expect.stringContaining('fixture_city'),
    }),
  );
  for (const ask of scenario.asks) {
    ask.settlementKind = 'other_kind';
  }
  expect(load(scenario, ['other_kind']).issues).toEqual([]);
});

it('names the ask when its footprint cannot fit within the content retry budget', () => {
  const scenario = scenarioFixture();
  scenario.bounds = { x0: 0, z0: 0, x1: 1, z1: 1 };
  scenario.placement.attempts = 1;
  const { registry } = load(scenario);
  expect(() => composeLayout(11, registry, scenario)).toThrow('ask "home" did not fit after 1 attempts');
});

it('rejects distance references that are missing or not earlier in authored order', () => {
  const scenario = scenarioFixture();
  scenario.asks[0]!.distance = {
    from: 'stock',
    curve: [
      [0, 1],
      [40, 1],
    ],
  };
  expect(load(scenario).issues).toContainEqual(
    expect.objectContaining({ path: expect.stringContaining('.asks[0].distance.from') }),
  );
});
