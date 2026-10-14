import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildCityPlan, cityGridOf, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';
import { buildingLootEvidence, buildingVariants, cityBuildingDraws } from './fixtures/cityBuildings.ts';
import { fixturePool, fixtureScenario, fixtureScenarioSources, fixtureService } from './fixtures/scenario.ts';

const BUNDLED_CONTENT = buildBundledContent();

it('resolves one repeatable variant per slot and varies city assemblies across buildings and seeds', () => {
  const data = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  const grid = {
    street: 4,
    blockX: 14,
    blockZ: 12,
    pad: 2,
    gap: 2,
    blend: 2,
    blocksX: 1,
    blocksZ: 1,
    templates: [{ id: 'fixture_route', weight: 1 }],
  };
  const plan = (seed: number) => buildCityPlan({ seed, registry, floor: 0, grid });
  const variants = (result: ReturnType<typeof plan>) =>
    result.placements.map((placement) => {
      const choices = new Set(
        placement.template
          .provenance!.filter((owner) => owner?.slotPath === 'fixture_route/front')
          .map((owner) => owner!.variant),
      );
      expect(choices.size).toBe(1);
      return [...choices][0]!;
    });
  const selections = Array.from({ length: 8 }, (_, seed) => {
    const first = plan(seed);
    const selected = variants(first);
    expect(variants(plan(seed))).toEqual(selected);
    expect(first.placements.length).toBeGreaterThan(1);
    expect(first.placements.every((placement) => placement.template.id === 'fixture_route')).toBe(true);
    return selected;
  });
  expect(new Set(selections.flat())).toEqual(new Set(['room_a', 'room_b']));
  expect(selections.some((selected) => new Set(selected).size > 1)).toBe(true);
});

it('rejects ambiguous city pool identities instead of choosing a template or assembly namespace', () => {
  const data = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  data.templates = [
    {
      id: 'fixture_route',
      size: [1, 1, 1],
      palette: { '.': 'air' },
      layers: [['.']],
      lootContext: data.mapAssemblies![0]!.lootContext,
    },
  ];
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  registry.mapPools.set('fixture_pool', {
    id: 'fixture_pool',
    choices: [{ ref: { kind: 'template', id: 'fixture_route' }, weight: 1 }],
  });
  expect(scenarioPlanIssues(registry, fixtureScenario())).toContainEqual([
    '.city.pool.choices[0].ref',
    'ambiguous template and assembly "fixture_route"',
  ]);
});

describe('content-owned city building types', () => {
  it('chooses positive building weights proportionally and ignores their common scale', () => {
    const scenario = fixtureScenario();
    const admitted = buildRegistry(fixtureScenarioSources(scenario));
    expect(admitted.issues).toEqual([]);
    const { registry } = admitted;
    const house = registry.templates.get('fixture_house')!;
    registry.templates.set('weighted_b', { ...house, id: 'weighted_b' });
    registry.templates.set('disabled', { ...house, id: 'disabled' });
    const grid = {
      ...scenario.city,
      templates: [
        { id: house.id, weight: 1 },
        { id: 'weighted_b', weight: 3 },
        { id: 'disabled', weight: 0 },
      ],
    };
    const counts = new Map<string, number>();
    for (const seed of [11, 73, 191, 307]) {
      const plan = buildCityPlan({ seed, registry, grid, floor: 0 });
      for (const { template } of plan.placements) {
        counts.set(template.id, (counts.get(template.id) ?? 0) + 1);
      }
      const scaled = buildCityPlan({
        seed,
        registry,
        floor: 0,
        grid: { ...grid, templates: grid.templates.map((row) => ({ ...row, weight: row.weight * 10 })) },
      });
      expect(scaled.placements.map(({ template }) => template.id)).toEqual(
        plan.placements.map(({ template }) => template.id),
      );
    }
    expect(counts.has('disabled')).toBe(false);
    expect(counts.get(house.id) ?? 0).toBeGreaterThan(0);
    expect(counts.get('weighted_b') ?? 0).toBeGreaterThan(counts.get(house.id) ?? 0);
  });

  it('falls back to the first enabled fitting building when the weighted draw is too wide', () => {
    const scenario = fixtureScenario();
    const admitted = buildRegistry(fixtureScenarioSources(scenario));
    expect(admitted.issues).toEqual([]);
    const { registry } = admitted;
    const house = registry.templates.get('fixture_house')!;
    registry.templates.set('disabled', { ...house, id: 'disabled' });
    const small = registry.templates.get('fixture_small_house')!;
    registry.templates.set('other_small', { ...small, id: 'other_small' });
    const seed = 73;
    const tailGrid = {
      ...scenario.city,
      blockX: 13,
      templates: [
        { id: house.id, weight: 9 },
        { id: 'disabled', weight: 0 },
        { id: small.id, weight: 1 },
        { id: 'other_small', weight: 1 },
      ],
    };
    const tail = buildCityPlan({ seed, registry, floor: 0, grid: tailGrid });
    expect(tail.placements.length).toBeGreaterThan(0);
    let fallback = 0;
    for (const { id, draw, remaining } of cityBuildingDraws(tail, tailGrid, seed)) {
      const fits = remaining >= house.size[0];
      const secondary = draw < 10 / 11 ? small.id : 'other_small';
      const selected = draw < 9 / 11 ? house.id : secondary;
      expect(id).toBe(!fits && selected === house.id ? small.id : selected);
      fallback += Number(!fits && selected === house.id);
    }
    expect(fallback).toBeGreaterThan(0);
  });

  it('rejects duplicate building refs and pools with no enabled weight', () => {
    const { ref } = fixturePool().choices[0]!;
    for (const choices of [
      [
        { ref, weight: 1 },
        { ref, weight: 2 },
      ],
      [{ ref, weight: 0 }],
      [{ ref, weight: -1 }],
    ]) {
      const result = buildRegistry(fixtureScenarioSources(fixtureScenario(), fixtureService(), fixturePool(choices)));
      expect(result.issues.some(({ path }) => path.includes('mapPools[0].choices'))).toBe(true);
    }
  });

  it('reports a missing pool at the scenario city', () => {
    const scenario = fixtureScenario();
    const { registry } = buildRegistry(fixtureScenarioSources(scenario));
    scenario.city.pool = 'no_such_pool';
    expect(scenarioPlanIssues(registry, scenario)).toContainEqual(['.city.pool', 'no map pool "no_such_pool"']);
  });

  it('reports a pool ref that names no building of its kind, or one that does not fit', () => {
    const scenario = fixtureScenario();
    const { registry } = buildRegistry(fixtureScenarioSources(scenario));
    const refAt = (kind: 'template' | 'assembly', id: string) => {
      registry.mapPools.set('fixture_pool', { id: 'fixture_pool', choices: [{ ref: { kind, id }, weight: 1 }] });
      return scenarioPlanIssues(registry, scenario).filter(([path]) => path === '.city.pool.choices[0].ref');
    };
    expect(refAt('template', 'no_such_building')).toHaveLength(1);
    expect(refAt('assembly', 'fixture_house')).toHaveLength(1);
    expect(refAt('template', 'fixture_house')).toEqual([]);
    scenario.city.blockX = 6;
    expect(refAt('template', 'fixture_house')).toHaveLength(1);
  });

  it('lets one pool entry from a mod override a single building weight', () => {
    const scenario = fixtureScenario();
    const choices = [
      { ref: { kind: 'template' as const, id: 'fixture_house' }, weight: 1 },
      { ref: { kind: 'template' as const, id: 'fixture_small_house' }, weight: 1 },
    ];
    const sources = fixtureScenarioSources(scenario, fixtureService(), fixturePool(choices));
    const placed = (mod: ContentSource[]) => {
      const { registry, issues } = buildRegistry([...sources, ...mod]);
      expect(issues).toEqual([]);
      const ids = new Set<string>();
      for (const seed of [11, 73, 191, 307]) {
        for (const { template } of buildCityPlan({
          seed,
          registry,
          floor: 0,
          grid: cityGridOf(registry, scenario.city),
        }).placements) {
          ids.add(template.id);
        }
      }
      return ids;
    };
    expect(placed([])).toEqual(new Set(['fixture_house', 'fixture_small_house']));
    const override = fixturePool([{ ...choices[0]!, weight: 0 }, choices[1]!]);
    expect(placed([{ source: 'fixture-mod.json', data: { mapPools: [override] } }])).toEqual(
      new Set(['fixture_small_house']),
    );
  });

  it('every authored city building has valid assemblies and reachable eligible loot', () => {
    expect(BUNDLED_CONTENT.issues).toEqual([]);
    const { registry } = BUNDLED_CONTENT;
    const scenarios = [...registry.scenarios.values()];
    expect(scenarios.length).toBeGreaterThan(0);
    for (const scenario of scenarios) {
      expect(scenarioPlanIssues(registry, scenario)).toEqual([]);
      const city = cityGridOf(registry, scenario.city);
      const enabled = city.templates.filter(({ weight }) => weight > 0);
      expect(enabled.length).toBeGreaterThan(0);
      const plan = buildCityPlan({ seed: 1, registry, grid: { ...city, streetProps: [] }, floor: 0 });
      expect(plan.placements.length).toBeGreaterThan(0);
      expect(plan.placements.every(({ template }) => enabled.some(({ id }) => id === template.id))).toBe(true);
    }
    const buildings = scenarios.flatMap((scenario) =>
      cityGridOf(registry, scenario.city)
        .templates.filter(({ weight }) => weight > 0)
        .flatMap(({ id }) => buildingVariants(registry, registry.mapAssemblies.get(id)!)),
    );
    expect(buildings.length).toBeGreaterThan(0);
    for (const template of buildings) {
      const evidence = buildingLootEvidence(registry, template);
      expect(evidence.standing).toBeGreaterThan(0);
      expect(evidence.sources.length, template.id).toBeGreaterThan(0);
      for (const source of evidence.sources) {
        expect(source.accessible, source.label).toBe(true);
        expect(source.items.length, source.label).toBeGreaterThan(0);
        expect(source.issues, source.label).toEqual([]);
      }
    }
  });
});
