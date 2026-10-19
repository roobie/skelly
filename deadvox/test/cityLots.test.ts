import { describe, expect, it } from 'vitest';
import { cityLotIssues, cityLotRouteIssues, lotRect, placeCityLots, rectsOverlap } from '../src/core/cityLots.ts';
import { buildCityPlan, cityGridOf } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { ScenarioRouteSpace } from '../src/core/scenarioRoute.ts';
import type { ScenarioDef } from '../src/core/schema.ts';
import { compileTemplate, footprint } from '../src/core/templates.ts';
import { fixturePool, fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const QUOTA_CANNOT_FIT = /quota cannot fit/;
type Lot = NonNullable<ScenarioDef['city']['lots']>[number];
const fixture = () => {
  const scenario = fixtureScenario();
  const built = buildRegistry(fixtureScenarioSources(scenario));
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  return { scenario, registry: built.registry };
};
const poolLot = (id: string, position: [number, number], size: [number, number]): Lot => ({
  id,
  position,
  size,
  turn: 0,
  source: { kind: 'pool', id: 'fixture_pool' },
});

describe('authored city lots', () => {
  it('matches guaranteed buildings to fitting lots before weighted fill can consume a constrained lot', () => {
    const { registry, scenario } = fixture();
    registry.mapPools.set(
      'fixture_pool',
      fixturePool([
        { ref: { kind: 'template', id: 'fixture_small_house' }, weight: 1, atLeast: 1, atMost: 1 },
        { ref: { kind: 'template', id: 'fixture_house' }, weight: 0, atLeast: 1, atMost: 1 },
      ]),
    );
    scenario.city.fillRows = false;
    scenario.city.lots = [poolLot('wide', [-20, -20], [4, 4]), poolLot('narrow', [-14, -20], [3, 4])];
    const compiler = {
      seed: 9,
      floor: 12,
      compiled: ({ id }: { id: string }) => compileTemplate(registry, registry.templates.get(id)!),
    };
    const lots = placeCityLots(registry, scenario.city, compiler);
    expect(lots.map(({ placement }) => placement!.template.id)).toEqual(['fixture_house', 'fixture_small_house']);
    expect(lots.every(({ placement }) => placement!.origin[1] === 12)).toBe(true);
    scenario.city.lots[1]!.size = [2, 4];
    expect(() => placeCityLots(registry, scenario.city, compiler)).toThrow(QUOTA_CANNOT_FIT);
  });

  it('keeps row fill outside reserved open and occupied lots while filling the far side', () => {
    const { registry, scenario } = fixture();
    const open: Lot = { id: 'open', position: [-18, -18], size: [5, 12], turn: 0 };
    scenario.city.lots = [open];
    const plan = buildCityPlan({ seed: 3, registry, floor: 0, grid: cityGridOf(registry, scenario.city) });
    expect(plan.placements.length).toBeGreaterThan(0);
    for (const placement of plan.placements) {
      const [width, depth] = footprint(placement);
      expect(
        rectsOverlap(lotRect(open), {
          x0: placement.origin[0],
          z0: placement.origin[2],
          x1: placement.origin[0] + width,
          z1: placement.origin[2] + depth,
        }),
      ).toBe(false);
    }
    expect(
      plan.placements.some(
        (placement) => placement.origin[0] > open.position[0] + open.size[0] && placement.origin[2] < 0,
      ),
    ).toBe(true);
  });

  it('rejects overlapping reservations even when one is intentionally empty', () => {
    const { registry, scenario } = fixture();
    scenario.city.lots = [
      poolLot('house', [-20, -20], [4, 4]),
      { id: 'open', position: [-18, -18], size: [4, 4], turn: 0 },
    ];
    expect(cityLotIssues(registry, scenario.city, { x0: -24, z0: -24, x1: 28, z1: 28 })).toEqual([
      ['.city.lots[1]', 'reserved lots must not overlap'],
    ]);
  });

  it('fixes the service cell and turn independently of the world seed', () => {
    const { registry, scenario } = fixture();
    scenario.city.service = { cell: [-1, -1], turn: 0 };
    scenario.city.fillRows = false;
    const plans = [1, 2].map((seed) =>
      buildCityPlan({ seed, registry, floor: 12, grid: cityGridOf(registry, scenario.city), scenario }),
    );
    for (const plan of plans) {
      expect(plan.serviceBlock).toEqual(scenario.city.service.cell);
      expect(plan.service!.turn).toBe(scenario.city.service.turn);
    }
    expect(plans[0]!.service!.origin).toEqual(plans[1]!.service!.origin);
  });

  it('keeps generated rows and street props inside an asymmetric authored frame', () => {
    const { registry, scenario } = fixture();
    scenario.city = {
      ...scenario.city,
      street: 8,
      blocksX: 2,
      blocksZ: 2,
      bounds: { x0: -56, z0: -28, x1: 36, z1: 36 },
      streetProps: ['fixture_small_house'],
    };
    const plan = buildCityPlan({ seed: 3, registry, floor: 0, grid: cityGridOf(registry, scenario.city) });
    expect(plan.placements.length).toBeGreaterThan(0);
    expect(plan.placements.some(({ template }) => template.id === 'fixture_small_house')).toBe(true);
    for (const placement of plan.placements) {
      const [width, depth] = footprint(placement);
      expect(placement.origin[0]).toBeGreaterThanOrEqual(plan.bounds.x0);
      expect(placement.origin[2]).toBeGreaterThanOrEqual(plan.bounds.z0);
      expect(placement.origin[0] + width).toBeLessThanOrEqual(plan.bounds.x1);
      expect(placement.origin[2] + depth).toBeLessThanOrEqual(plan.bounds.z1);
    }
  });

  it('requires a direct body crossing at a declared breach even when the fence can be walked around', () => {
    const { registry, scenario } = fixture();
    const rows = ['....#...', '....#...', '........', '........', '....#...', '....#...', '....#...'];
    const template = {
      ...registry.templates.get('fixture_house')!,
      id: 'yard_fixture',
      size: [8, 5, 7] as [number, number, number],
      palette: { '.': 'air', '#': 'fixture_solid', g: { ground: true as const } },
      layers: [Array.from({ length: 7 }, () => 'gggggggg'), rows, rows, rows, rows],
      access: {
        ground: 'ground',
        entrance: [2, 1, 3] as [number, number, number],
        storeys: [{ id: 'ground', floor: 1 }],
        stairs: [],
      },
    };
    registry.templates.set(template.id, template);
    scenario.city.fillRows = false;
    scenario.city.lots = [
      {
        id: 'yard',
        position: [-16, -16],
        size: [8, 7],
        turn: 0,
        source: { kind: 'template', id: template.id },
        routes: [{ id: 'breach', inside: [2, 1, 3], outside: [6, 1, 3] }],
      },
    ];
    const probe = () => {
      const plan = buildCityPlan({ seed: 2, registry, floor: 12, grid: cityGridOf(registry, scenario.city) });
      const site = new CitySite(2, registry, makeScale(0.5), { ...plan, service: plan.lots![0]!.placement });
      return cityLotRouteIssues(plan.lots!, new ScenarioRouteSpace(site), [[-10, 13, -13]]);
    };
    expect(probe()).toEqual([]);
    template.layers = [template.layers[0]!, ...Array.from({ length: 4 }, () => rows.map(() => '....#...'))];
    expect(probe().map(([path]) => path)).toEqual(['.city.lots[0].routes[0]']);
  });

  it('paves authored alleys outside the regular row rhythm without changing neighbouring ground', () => {
    const { registry, scenario } = fixture();
    scenario.city.paving = [{ x0: -18, z0: -18, x1: -15, z1: -15 }];
    const plan = buildCityPlan({ seed: 2, registry, floor: 12, grid: cityGridOf(registry, scenario.city) });
    const site = new CitySite(2, registry, makeScale(0.5), plan);
    expect(site.surface.top(-17, -17)).toBe(registry.blockIds.get('asphalt'));
    expect(site.surface.top(-14, -17)).toBeUndefined();
  });
});
