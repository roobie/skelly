import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { buildCityPlan, cityGridOf, scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { buildRegistry, type ContentSource, type Registry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { ownershipCell } from '../src/core/templateOwnership.ts';
import { type CompiledTemplate, compileAssembly, type PlacedPiece, placedPoint } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';
import { buildingLootEvidence, buildingVariants, cityBuildingDraws } from './fixtures/cityBuildings.ts';
import { fixturePool, fixtureScenario, fixtureScenarioSources, fixtureService } from './fixtures/scenario.ts';
import { sweepGroup } from './sweeps.ts';

const BUNDLED_CONTENT = startupContent();

it('resolves one repeatable variant per slot and varies city assemblies across buildings and seeds', () => {
  const data = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  const grid = {
    street: 4,
    blockX: 14,
    blockZ: 12,
    pad: 2,
    gap: 2,
    blend: 2,
    rows: 2,
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

describe('authored city grounding', () => {
  it('aligns the authored ground course with the city surface while keeping cellar floors below it', () => {
    const data = JSON.parse(
      compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet'),
    ) as ContentFile;
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
        rows: 2,
        blocksX: 1,
        blocksZ: 1,
        templates: [{ id: building.id, weight: 1 }],
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

it('reports an unknown style on a pool row or a slot ref with its source path', () => {
  const data = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  const pooled = buildRegistry([
    {
      source: 'fixture-city-style.json',
      data: {
        ...data,
        mapPools: [
          fixturePool([{ ref: { kind: 'assembly', id: 'fixture_route', style: 'no_such_style' }, weight: 1 }]),
        ],
      },
    },
  ]).registry;
  expect(scenarioPlanIssues(pooled, fixtureScenario())).toContainEqual([
    '.city.pool.choices[0].ref.style',
    'no style "no_such_style"',
  ]);
  const assembly = registry.mapAssemblies.get('fixture_route')!;
  const slot = assembly.slots[0]!;
  const styled = {
    ...assembly,
    slots: [
      { ...slot, choices: [{ ...slot.choices![0]!, ref: { ...slot.choices![0]!.ref, style: 'no_such_style' } }] },
    ],
  };
  expect(() => compileAssembly(registry, styled, { seed: 1, siteId: 'unknown_style' })).toThrow(
    new RegExp(`slot=fixture_route/${slot.id}: unknown style no_such_style`),
  );
});

it('rejects ambiguous city pool identities instead of choosing a template or assembly namespace', () => {
  const data = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  data.templates = [
    {
      id: 'fixture_route',
      size: [1, 1, 1],
      palette: { '.': 'air' },
      layers: [['.']],
      lootContext: data.mapAssemblies![0]!.lootContext,
    },
  ];
  data.mapPools = [fixturePool([{ ref: { kind: 'template', id: 'fixture_route' }, weight: 1 }])];
  const { registry, issues } = buildRegistry([{ source: 'fixture-city-kits.json', data }]);
  expect(issues).toEqual([]);
  expect(scenarioPlanIssues(registry, fixtureScenario())).toContainEqual([
    '.city.pool.choices[0].ref',
    'ambiguous template and assembly "fixture_route"',
  ]);
});

const UNMET_QUOTA = /fixture_pool.*fixture_small_house.*scenario:fixture_scenario:city/;

describe('city pool quotas', () => {
  const quotaSetup = (choices: { id: string; weight: number; atLeast?: number; atMost?: number }[]) => {
    const scenario = fixtureScenario();
    const pool = fixturePool(choices.map(({ id, ...row }) => ({ ref: { kind: 'template' as const, id }, ...row })));
    const admitted = buildRegistry(fixtureScenarioSources(scenario, fixtureService(), pool));
    return { scenario, ...admitted };
  };
  const countsOf = (plan: ReturnType<typeof buildCityPlan>) => {
    const counts = new Map<string, number>();
    for (const { template } of plan.placements) {
      counts.set(template.id, (counts.get(template.id) ?? 0) + 1);
    }
    return counts;
  };
  const Seeds = [1, 11, 73, 191, 307, 1009, 4099];

  it('meets every atLeast and exceeds no atMost for any seed, however unlikely the draw', () => {
    const { scenario, registry, issues } = quotaSetup([
      { id: 'fixture_house', weight: 100, atMost: 4 },
      { id: 'fixture_small_house', weight: 1, atLeast: 2 },
    ]);
    expect(issues).toEqual([]);
    const grid = cityGridOf(registry, scenario.city);
    for (const seed of Seeds) {
      const counts = countsOf(buildCityPlan({ seed, registry, floor: 0, grid, scenario }));
      expect(counts.get('fixture_small_house') ?? 0).toBeGreaterThanOrEqual(2);
      expect(counts.get('fixture_house') ?? 0).toBeLessThanOrEqual(4);
    }
  });

  it('forces a quota row even when its weight is zero', () => {
    const { scenario, registry } = quotaSetup([
      { id: 'fixture_house', weight: 1 },
      { id: 'fixture_small_house', weight: 0, atLeast: 1 },
    ]);
    const grid = cityGridOf(registry, scenario.city);
    for (const seed of Seeds) {
      const plan = buildCityPlan({ seed, registry, floor: 0, grid, scenario });
      expect(countsOf(plan).get('fixture_small_house') ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('stops retrying once every quota is met', () => {
    const { scenario, registry } = quotaSetup([
      { id: 'fixture_house', weight: 1, atLeast: 1, atMost: 2 },
      { id: 'fixture_small_house', weight: 1, atLeast: 1 },
    ]);
    const base = cityGridOf(registry, scenario.city);
    const grid = { ...base, templates: base.templates.map((row) => ({ ...row, weight: 0 })) };
    for (const seed of Seeds) {
      const counts = countsOf(buildCityPlan({ seed, registry, floor: 0, grid, scenario }));
      expect(counts.get('fixture_house') ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.get('fixture_house') ?? 0).toBeLessThanOrEqual(2);
      expect(counts.get('fixture_small_house') ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps an earlier forced row when forcing a later one displaces a row that met its quota by weight', () => {
    const { scenario, registry } = quotaSetup([
      { id: 'fixture_house', weight: 1 },
      { id: 'fixture_small_house', weight: 1 },
    ]);
    const house = registry.templates.get('fixture_house')!;
    for (const id of ['quota_a', 'quota_b', 'filler']) {
      registry.templates.set(id, { ...house, id });
    }
    const gridWith = (templates: { id: string; weight: number; atLeast?: number; atMost?: number }[]) => ({
      ...cityGridOf(registry, scenario.city),
      blockX: 9,
      templates,
    });
    const quotaA = { id: 'quota_a', weight: 0 };
    const quotaB = { id: 'quota_b', weight: 1, atMost: 1 };
    const filler = { id: 'filler', weight: 2 };
    const placedB = (templates: Parameters<typeof gridWith>[0], seed: number) =>
      (countsOf(buildCityPlan({ seed, registry, floor: 0, grid: gridWith(templates), scenario })).get('quota_b') ?? 0) >
      0;
    // Displacement depends on the RNG stream, so pick seeds by the property instead of from `Seeds`.
    const displacing = Array.from({ length: 200 }, (_, seed) => seed).filter(
      (seed) => placedB([quotaA, quotaB, filler], seed) && !placedB([{ ...quotaA, atLeast: 1 }, quotaB, filler], seed),
    );
    expect(displacing.length).toBeGreaterThan(0);
    const grid = gridWith([{ ...quotaA, atLeast: 1 }, { ...quotaB, atLeast: 1 }, filler]);
    for (const seed of displacing) {
      const counts = countsOf(buildCityPlan({ seed, registry, floor: 0, grid, scenario }));
      expect(counts.get('quota_a') ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.get('quota_b') ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.get('quota_b') ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('resolves the same plan for the same seed', () => {
    const { scenario, registry } = quotaSetup([
      { id: 'fixture_house', weight: 3, atMost: 5 },
      { id: 'fixture_small_house', weight: 0, atLeast: 2 },
    ]);
    const grid = cityGridOf(registry, scenario.city);
    const ids = (seed: number) =>
      buildCityPlan({ seed, registry, floor: 0, grid, scenario }).placements.map(({ template, origin, turn }) => [
        template.id,
        origin,
        turn,
      ]);
    for (const seed of Seeds) {
      expect(ids(seed)).toEqual(ids(seed));
    }
  });

  it('aborts naming the pool and the choice when the grid cannot place a quota', () => {
    const { scenario, registry } = quotaSetup([
      { id: 'fixture_house', weight: 1 },
      { id: 'fixture_small_house', weight: 1, atLeast: 1 },
    ]);
    const base = cityGridOf(registry, scenario.city);
    const grid = {
      ...base,
      templates: base.templates.map((row) => (row.atLeast ? { ...row, atLeast: 1000 } : row)),
    };
    expect(() => buildCityPlan({ seed: 1, registry, floor: 0, grid, scenario })).toThrow(UNMET_QUOTA);
  });

  it('reports a quota the grid cannot guarantee, and a row whose atLeast exceeds its atMost', () => {
    const { issues } = quotaSetup([
      { id: 'fixture_house', weight: 1 },
      { id: 'fixture_small_house', weight: 1, atLeast: 1000 },
    ]);
    expect(issues.some(({ path, message }) => path.endsWith('.city.pool') && message.includes('1000'))).toBe(true);
    const inverted = quotaSetup([{ id: 'fixture_house', weight: 1, atLeast: 3, atMost: 1 }]);
    expect(inverted.issues.some(({ path }) => path.includes('mapPools[0].choices'))).toBe(true);
  });
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
      ring: undefined,
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
      ring: undefined,
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

  it('reports a service template whose decals exceed the scenario decal limit', () => {
    const { registry } = BUNDLED_CONTENT;
    const limitIssues = (decalLimit: number) =>
      [...registry.scenarios.values()].flatMap((scenario) =>
        scenarioPlanIssues(registry, { ...scenario, decalLimit }).filter(([path]) => path === '.decalLimit'),
      );
    expect(limitIssues(0).length).toBeGreaterThan(0);
    expect(limitIssues(1_000_000)).toEqual([]);
  });

  it('reports a pool ref that names no building of its kind', () => {
    const scenario = fixtureScenario();
    const refAt = (kind: 'template' | 'assembly', id: string) => {
      const pool = fixturePool([{ ref: { kind, id }, weight: 1 }]);
      const { issues } = buildRegistry(fixtureScenarioSources(scenario, fixtureService(), pool));
      return issues.filter(({ path }) => path.endsWith('.city.pool.choices[0].ref'));
    };
    expect(refAt('template', 'no_such_building')).toHaveLength(1);
    expect(refAt('assembly', 'fixture_house')).toHaveLength(1);
    expect(refAt('template', 'fixture_house')).toEqual([]);
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

  sweepGroup('in every bundled scenario city', () => {
    it('every authored city building has valid assemblies and reachable eligible loot', () => {
      expect(BUNDLED_CONTENT.issues).toEqual([]);
      const { registry } = BUNDLED_CONTENT;
      const scenarios = [...registry.scenarios.values()];
      expect(scenarios.length).toBeGreaterThan(0);
      for (const scenario of scenarios) {
        expect(scenarioPlanIssues(registry, scenario)).toEqual([]);
        const city = cityGridOf(registry, scenario.city);
        const enabled = [...city.templates, ...(city.ring?.templates ?? [])].filter(({ weight }) => weight > 0);
        expect(enabled.length).toBeGreaterThan(0);
        const { perimeter: _wall, ...open } = city;
        const plan = buildCityPlan({
          seed: 1,
          registry,
          grid: { ...open, ...(city.ring ? { ring: city.ring } : {}), streetProps: [] },
          floor: 0,
        });
        expect(plan.placements.length).toBeGreaterThan(0);
        expect(
          plan.placements.every(
            (placement) =>
              enabled.some(({ id }) => id === placement.template.id) ||
              plan.lots?.some((lot) => lot.placement === placement) ||
              plan.underground.some((element) => element.placement === placement),
          ),
        ).toBe(true);
      }
      const buildings = scenarios.flatMap((scenario) =>
        [
          ...cityGridOf(registry, scenario.city).templates,
          ...(cityGridOf(registry, scenario.city).ring?.templates ?? []),
        ]
          .filter(({ weight }) => weight > 0)
          .flatMap(({ id }) => buildingVariants(registry, registry.mapAssemblies.get(id)!)),
      );
      expect(buildings.length).toBeGreaterThan(0);
      const expectReachableRolledLoot = (template: CompiledTemplate): void => {
        const evidence = buildingLootEvidence(registry, template);
        expect(evidence.standing).toBeGreaterThan(0);
        // Fixed stock is an incidental bonus that validation checks. The building promises the rolled loot on the
        // storeys it declares; rolled loot below them (a bonus room) must still admit a real table, but need not be reached.
        const rolled = evidence.sources.filter(({ stocked }) => !stocked);
        expect(rolled.filter(({ onStorey }) => onStorey).length, template.id).toBeGreaterThan(0);
        for (const source of rolled) {
          if (source.onStorey) {
            expect(source.accessible, source.label).toBe(true);
          }
          expect(source.items.length, source.label).toBeGreaterThan(0);
        }
      };
      for (const template of buildings) {
        expectReachableRolledLoot(template);
      }
    });
  });
});

const insideKitPlane = (compiled: CompiledTemplate, x: number, z: number, y: number): boolean =>
  x >= 0 && z >= 0 && y >= 0 && x < compiled.size[0] && z < compiled.size[2] && y < compiled.size[1];

/** Floods a wall plane from the given cells and returns the bounding box, in cells. */
const floodOpening = (
  seed: readonly (readonly [number, number])[],
  solid: (y: number, along: number) => boolean,
): { across: number; height: number } => {
  const pending: [number, number][] = seed.map(([y, along]) => [y, along]);
  const seen = new Set<string>();
  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  while (pending.length > 0) {
    const [y, along] = pending.pop()!;
    const key = `${y},${along}`;
    if (seen.has(key) || solid(y, along)) {
      continue;
    }
    seen.add(key);
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    pending.push([y + 1, along], [y - 1, along], [y, along + 1], [y, along - 1]);
  }
  return { across: maxAlong - minAlong + 1, height: maxY - minY + 1 };
};

const doorOpening = (registry: Registry, compiled: CompiledTemplate, piece: PlacedPiece) => {
  const acrossX = piece.facing === 'e' || piece.facing === 'w';
  const [px, py, pz] = piece.pos;
  const [sx, sy, sz] = piece.size;
  const plane = acrossX ? px : pz;
  const alongStart = acrossX ? pz : px;
  const alongLength = acrossX ? sz : sx;
  const solid = (y: number, along: number): boolean => {
    const x = acrossX ? plane : along;
    const z = acrossX ? along : plane;
    return (
      !insideKitPlane(compiled, x, z, y) ||
      registry.blocks[compiled.blocks[ownershipCell(compiled.size, [x, y, z])]!]?.solid === true
    );
  };
  const seed: [number, number][] = [];
  for (let y = py; y < py + sy; y++) {
    for (let along = alongStart; along < alongStart + alongLength; along++) {
      seed.push([y, along]);
    }
  }
  return floodOpening(seed, solid);
};

describe('gauntlet door openings', () => {
  it('gives every wall door an opening large enough for its leaf', () => {
    const { registry } = BUNDLED_CONTENT;
    const assemblies = [...registry.mapAssemblies.values()].filter((assembly) => assembly.id.startsWith('gauntlet'));
    expect(assemblies.length).toBeGreaterThan(0);
    let doors = 0;
    for (const assembly of assemblies) {
      const compiled = compileAssembly(registry, assembly, { seed: 1, siteId: `door-openings:${assembly.id}` });
      for (const piece of compiled.pieces) {
        const def = registry.furniture.get(piece.furniture);
        // A hatch opens through the space above and below it, not across a wall.
        if (!def?.door || def.shape || def.door.hatch) {
          continue;
        }
        doors += 1;
        const [width, height, depth] = piece.size;
        const acrossX = piece.facing === 'e' || piece.facing === 'w';
        const opening = doorOpening(registry, compiled, piece);
        const label = `${assembly.id} ${piece.furniture} at ${piece.pos.join(',')}`;
        expect(opening.across, `${label} opening width`).toBeGreaterThanOrEqual(acrossX ? depth : width);
        expect(opening.height, `${label} opening height`).toBeGreaterThanOrEqual(height);
      }
    }
    expect(doors).toBeGreaterThan(0);
  });
});

const houseId = /^gauntlet_city_\d+/;

// The yard rows in front of a shop door, where a player walks up from the street.
const yardRows = 2;
const shopIds = (
  JSON.parse(
    compileJsonnetFile('packages/deadvox/src/content/base/gauntlet-city-building-types.libsonnet'),
  ) as ContentFile
).mapAssemblies!.map(({ id }) => id);

describe('gauntlet shop fronts', () => {
  // The street face and the yard in front of it: the rows a player sees from the road.
  const streetRows = 4;
  const streetBlocks = (assemblyId: string): Set<string> => {
    const { registry } = BUNDLED_CONTENT;
    const seen = new Set<string>();
    for (const seed of [1, 2, 3]) {
      const compiled = compileAssembly(registry, registry.mapAssemblies.get(assemblyId)!, {
        seed,
        siteId: `shop-front:${assemblyId}`,
      });
      const [sx, sy, sz] = compiled.size;
      const cells = sy * Math.min(streetRows, sz) * sx;
      for (let i = 0; i < cells; i++) {
        const x = i % sx;
        const z = Math.floor(i / sx) % Math.min(streetRows, sz);
        const y = Math.floor(i / (sx * Math.min(streetRows, sz)));
        const id = registry.blocks[compiled.blocks[ownershipCell(compiled.size, [x, y, z])]!]?.id;
        if (id && id !== 'air') {
          seen.add(id);
        }
      }
    }
    return seen;
  };

  it('gives every shop a street face that carries blocks no house shows, and no two shops share them', () => {
    const { registry } = BUNDLED_CONTENT;
    const houses = [...registry.mapAssemblies.keys()].filter((id) => houseId.test(id));
    expect(houses.length).toBeGreaterThan(0);
    const houseBlocks = new Set(houses.flatMap((id) => [...streetBlocks(id)]));
    const marks = shopIds.map((id) => ({
      id,
      marks: [...streetBlocks(id)].filter((block) => !houseBlocks.has(block)),
    }));
    for (const { id, marks: own } of marks) {
      expect(own.length, `${id} identifying blocks`).toBeGreaterThan(0);
    }
    const all = marks.flatMap(({ marks: own }) => own);
    expect(new Set(all).size, 'a block identifies more than one shop type').toBe(all.length);
  });

  it('leaves a standing body of headroom over every walkable street-side cell of every shop', () => {
    const { registry } = BUNDLED_CONTENT;
    let walkable = 0;
    for (const id of shopIds) {
      for (const seed of [1, 2, 3]) {
        const compiled = compileAssembly(registry, registry.mapAssemblies.get(id)!, { seed, siteId: `headroom:${id}` });
        const solid = (x: number, y: number, z: number): boolean =>
          registry.blocks[compiled.blocks[ownershipCell(compiled.size, [x, y, z])]!]?.solid === true;
        const yard = Array.from({ length: Math.min(yardRows, compiled.size[2]) * compiled.size[0] }, (_, i) => ({
          x: i % compiled.size[0],
          z: Math.floor(i / compiled.size[0]),
        })).filter(({ x, z }) => solid(x, 0, z) && !solid(x, 1, z));
        walkable += yard.length;
        const top = Math.min(compiled.size[1], Math.ceil(1 + STAIR_BODY_HEIGHT));
        const blocked = yard.flatMap(({ x, z }) =>
          Array.from({ length: top - 1 }, (_, i) => i + 1)
            .filter((y) => solid(x, y, z))
            .map((y) => `${x},${y},${z}`),
        );
        expect(blocked, `${id} seed ${seed} cells that block a standing body`).toEqual([]);
      }
    }
    expect(walkable).toBeGreaterThan(0);
  });
});
