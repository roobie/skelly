import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildCityPlan, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { placedPoint } from '../src/core/templates.ts';
import { fixtureScenario } from './fixtures/scenario.ts';

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
    templates: ['fixture_route'],
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

describe('authored city grounding', () => {
  it('aligns the authored ground course with the city surface while keeping cellar floors below it', () => {
    const data = JSON.parse(compileJsonnetFile('deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
    const building = data.mapAssemblies![0]!;
    building.size[1] *= 2;
    data.mapPieces!.push({ ...data.mapPieces![0]!, id: 'street_room', ports: [] });
    building.slots.push({
      ...building.slots[0]!,
      id: 'street_room',
      at: [0, 5, 0],
      choices: [{ ref: { kind: 'piece', id: 'street_room' }, weight: 1 }],
    });
    building.access = {
      ground: 'street',
      entrance: [1, 6, 2],
      storeys: [
        { id: 'cellar', floor: 1 },
        { id: 'street', floor: 6 },
      ],
      stairs: [],
    };
    data.mapSites = [];
    const { registry, issues } = buildRegistry([{ source: 'fixture-city-cellar.json', data }]);
    expect(issues).toEqual([]);
    const floor = 20;
    const plan = buildCityPlan({
      seed: 1,
      registry,
      floor,
      grid: {
        street: 4,
        blockX: 14,
        blockZ: 12,
        pad: 2,
        gap: 2,
        blend: 2,
        blocksX: 1,
        blocksZ: 1,
        templates: [building.id],
      },
    });
    expect(plan.placements.length).toBeGreaterThan(0);
    for (const placement of plan.placements) {
      expect(placedPoint(placement, placement.template.access!.entrance)[1]).toBe(floor + 1);
      const cellar = placement.template.access!.storeys.find((storey) => storey.id === 'cellar')!;
      expect(placedPoint(placement, [1, cellar.floor, 2])[1]).toBeLessThan(floor);
    }
  });
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
  const scenario = fixtureScenario();
  scenario.city.templates = ['fixture_route'];
  expect(scenarioPlanIssues(registry, scenario)).toContainEqual([
    '.city.templates',
    'ambiguous template and assembly "fixture_route"',
  ]);
});
