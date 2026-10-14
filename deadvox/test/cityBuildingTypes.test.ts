import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildCityPlan, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { lootSpawnPoint, lootTypeIssue } from '../src/core/loot.ts';
import { hash3 } from '../src/core/random.ts';
import type { ContentFile, MapAssemblyDef } from '../src/core/schema.ts';
import { lootSourcesOf } from '../src/core/site.ts';
import { STAIR_BODY_HALF_WIDTH } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions } from '../src/core/templateSpatial.ts';
import { type CompiledTemplate, compileAssembly } from '../src/core/templates.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const tableItems = (registry: Registry, root: string): string[] => {
  const pending = [root];
  const seen = new Set<string>();
  const items: string[] = [];
  while (pending.length > 0) {
    const table = pending.pop()!;
    if (seen.has(table)) {
      continue;
    }
    seen.add(table);
    for (const entry of registry.loot.get(table)!.entries) {
      if (entry.table) {
        pending.push(entry.table);
      }
      if (entry.item) {
        items.push(entry.item);
      }
    }
  }
  return items;
};

const buildingLootEvidence = (registry: Registry, template: CompiledTemplate) => {
  const reachable = templateReachableStandingPositions(registry, template);
  const sources = lootSourcesOf(registry, 'building_contract', { template, origin: [0, 0, 0], turn: 0 });
  return {
    standing: reachable.length,
    sources: sources.map((source) => {
      const piece = template.pieces.find(({ pos }) => pos.join(',') === source.anchor.join(','))!;
      const [x, feet, z] = piece.pos;
      const accessible = reachable.some(
        ([px, py, pz]) =>
          py === feet &&
          Math.hypot(Math.max(x - px, 0, px - (x + piece.size[0])), Math.max(z - pz, 0, pz - (z + piece.size[2]))) <=
            STAIR_BODY_HALF_WIDTH + 0.5,
      );
      const point = lootSpawnPoint(source);
      const items = point.supply.kind === 'table' ? tableItems(registry, point.supply.table) : [];
      return {
        label: `${template.id}: ${piece.furniture}`,
        accessible,
        items,
        issues: items
          .map((item) => lootTypeIssue(registry, item, point.context))
          .filter((issue) => issue !== undefined),
      };
    }),
  };
};

const buildingVariants = (registry: Registry, assembly: MapAssemblyDef): CompiledTemplate[] => {
  const alternatives = Math.max(1, ...assembly.slots.map((slot) => slot.choices.length));
  return Array.from({ length: alternatives }, (_, variant) =>
    compileAssembly(
      registry,
      {
        ...assembly,
        slots: assembly.slots.map((slot) => ({ ...slot, choices: [slot.choices[variant % slot.choices.length]!] })),
      },
      { seed: 1, siteId: 'building_contract' },
    ),
  );
};

it('chooses positive fitting building weights proportionally, not uniformly or by first-fitting fallback', () => {
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
  const seed = 73;
  const plan = buildCityPlan({ seed, registry, grid, floor: 0 });
  expect(plan.placements.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const placement of plan.placements) {
    const i = Math.floor(placement.origin[0] / (grid.street + grid.blockX));
    const j = Math.floor(placement.origin[2] / (grid.street + grid.blockZ));
    const row = placement.turn === 0 ? 0 : 1;
    const k =
      (placement.origin[0] - (i * (grid.street + grid.blockX) + grid.street + grid.pad)) / (house.size[0] + grid.gap);
    const draw = hash3(seed, i * 64 + k, j * 2 + row, 0);
    expect(placement.template.id).toBe(draw < 1 / 4 ? house.id : 'weighted_b');
    seen.add(placement.template.id);
  }
  expect(seen.size).toBe(2);
  const scaled = buildCityPlan({
    seed,
    registry,
    floor: 0,
    grid: { ...grid, templates: grid.templates.map((row) => ({ ...row, weight: row.weight * 10 })) },
  });
  expect(scaled.placements.map(({ template }) => template.id)).toEqual(
    plan.placements.map(({ template }) => template.id),
  );
  const tailGrid = {
    ...grid,
    blockX: 13,
    templates: [
      { id: house.id, weight: 9 },
      { id: 'fixture_small_house', weight: 1 },
      { id: 'disabled', weight: 0 },
    ],
  };
  const tail = buildCityPlan({ seed, registry, floor: 0, grid: tailGrid });
  expect(tail.placements.length).toBeGreaterThan(0);
  const ordinals = new Map<string, number>();
  let conditioned = 0;
  for (const placement of tail.placements) {
    const i = Math.floor(placement.origin[0] / (tailGrid.street + tailGrid.blockX));
    const j = Math.floor(placement.origin[2] / (tailGrid.street + tailGrid.blockZ));
    const row = placement.turn === 0 ? 0 : 1;
    const key = `${i},${j},${row}`;
    const k = ordinals.get(key) ?? 0;
    ordinals.set(key, k + 1);
    const remaining = (i + 1) * (tailGrid.street + tailGrid.blockX) - tailGrid.pad - placement.origin[0];
    const fits = remaining >= house.size[0];
    const draw = hash3(seed, i * 64 + k, j * 2 + row, 0);
    expect(placement.template.id).toBe(fits && draw < 9 / 10 ? house.id : 'fixture_small_house');
    conditioned += Number(!fits);
  }
  expect(conditioned).toBeGreaterThan(0);
});

it('rejects duplicate building identities and pools with no enabled weight', () => {
  const scenario = fixtureScenario();
  const row = scenario.city.templates[0]!;
  for (const templates of [[row, row], [{ ...row, weight: 0 }], [{ ...row, weight: -1 }]]) {
    const result = buildRegistry(fixtureScenarioSources({ ...scenario, city: { ...scenario.city, templates } }));
    expect(result.issues.some(({ path }) => path.includes('city.templates'))).toBe(true);
  }
});

it('every authored city building has valid assemblies and reachable eligible loot', () => {
  expect(BUNDLED_CONTENT.issues).toEqual([]);
  const { registry } = BUNDLED_CONTENT;
  const scenarios = [...registry.scenarios.values()];
  expect(scenarios.length).toBeGreaterThan(0);
  for (const scenario of scenarios) {
    expect(scenarioPlanIssues(registry, scenario)).toEqual([]);
    const enabled = scenario.city.templates.filter(({ weight }) => weight > 0);
    expect(enabled.length).toBeGreaterThan(0);
    const plan = buildCityPlan({ seed: 1, registry, grid: { ...scenario.city, streetProps: [] }, floor: 0 });
    expect(plan.placements.length).toBeGreaterThan(0);
    expect(plan.placements.every(({ template }) => enabled.some(({ id }) => id === template.id))).toBe(true);
  }
  const buildings = scenarios.flatMap((scenario) =>
    scenario.city.templates
      .filter(({ weight }) => weight > 0)
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

it('an ordered fixture mod reweights building ids without replacing geometry or the selector', () => {
  const files = import.meta.glob<unknown>('../src/content/base/*.json', { eager: true, import: 'default' });
  const mod = JSON.parse(
    compileJsonnetFile('deadvox/test/fixtures/jsonnet/gauntlet-gun-district.jsonnet'),
  ) as ContentFile;
  const admitted = buildRegistry([
    ...Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([source, data]) => ({ source, data })),
    { source: 'gun-district-mod.json', data: mod },
  ]);
  expect(admitted.issues).toEqual([]);
  const scenario = admitted.registry.scenarios.get(mod.scenarios![0]!.id)!;
  const enabled = scenario.city.templates.filter(({ weight }) => weight > 0);
  expect(enabled).toHaveLength(1);
  const plan = buildCityPlan({
    seed: 1,
    registry: admitted.registry,
    floor: 0,
    grid: { ...scenario.city, streetProps: [] },
  });
  expect(plan.placements.length).toBeGreaterThan(0);
  expect(plan.placements.every(({ template }) => template.id === enabled[0]!.id)).toBe(true);
});
