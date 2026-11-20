import { buildRegistry } from '@skelly/engine/content';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { anchorCleared, composedSiteIssues, composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { onPlacementGrid, snapToPlacementGrid } from '@skelly/engine/internal/core/placementGrid.ts';
import { SiteLayoutSchema } from '@skelly/engine/internal/core/schema/layouts.ts';
import { type ComposedSiteDef, ComposedSiteSchema } from '@skelly/engine/internal/core/schema/scenarios.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { gameHours } from '@skelly/engine/internal/core/time.ts';
import { makeScale } from '@skelly/engine/world';
import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { fixtureLootContext } from './economyFixtures.ts';
import { fixtureScenario, fixtureScenarioSources, fixtureStartRow } from './fixtures/scenario.ts';

// The fixture kit's route assembly, which an ask names by id as a layout building does.
const { damageKinds: _, ...KITS } = JSON.parse(
  compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet'),
) as ContentFile;
const ROUTE = 'fixture_route';
const kitsAdmitting = (kinds: string[]): ContentFile => ({
  ...KITS,
  mapAssemblies: KITS.mapAssemblies!.map((assembly) =>
    assembly.id === ROUTE ? { ...assembly, eligibility: { settlementKinds: kinds } } : assembly,
  ),
});

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
    population: { authoredMarkers: false },
  });
};

const load = (
  scenario = scenarioFixture(),
  kinds?: string[],
  markers = false,
  kits: ContentFile = kitsAdmitting([scenario.settlementKind]),
) => {
  const sources = [...fixtureScenarioSources(), { source: 'fixture-kits.json', data: kits }];
  const data = sources[0]!.data as ContentFile;
  data.scenarios = [scenario];
  data.starts = [fixtureStartRow(null, { site: scenario.id })];
  data.templates!.push({
    id: 'fixture_cabin',
    lootContext: fixtureLootContext(),
    size: [3, 5, 4],
    palette: { '=': 'fixture_solid', '.': 'air', ...(markers ? { '@': { spawn: 'fixture_settlement_actor' } } : {}) },
    layers: [
      ['===', '===', '===', '==='],
      ['...', markers ? '.@.' : '...', '...', '...'],
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

it.each([11, 73])('a fixed ask stands at its own position whatever the seed (seed %s)', (seed) => {
  const scenario = scenarioFixture();
  scenario.asks[0] = { ...scenario.asks[0]!, at: [10, -20] };
  const { registry } = load(scenario);
  const { layout } = composeLayout(seed, registry, scenario);
  expect(layout.buildings[0]?.position[0]).toBe(10);
  expect(layout.buildings[0]?.position[2]).toBe(-20);
});

it('a position the placement snaps to is one the schema accepts as on the grid', () => {
  for (const metres of [-20.2, 10.2, 10.25, 10.75, 0]) {
    expect(onPlacementGrid(snapToPlacementGrid(metres))).toBe(true);
  }
  expect(onPlacementGrid(10.2)).toBe(false);
});

it('rejects a fixed spot off the placement grid rather than moving it', () => {
  const scenario = scenarioFixture();
  const asks = [{ ...scenario.asks[0]!, at: [10.2, -20.2] }, ...scenario.asks.slice(1)];
  expect(() => parse(ComposedSiteSchema, { ...scenario, asks })).toThrow('the placement grid');
});

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

const routeAsk = (): ComposedSiteDef['asks'][number] => ({
  kind: 'place',
  id: 'route',
  template: ROUTE,
  supplies: [],
  distance: {
    from: 'home',
    curve: [
      [10, 1],
      [60, 0],
    ],
  },
});

it('places an ask naming an assembly as a layout building compiled from that assembly', () => {
  const scenario = scenarioFixture();
  scenario.asks.push(routeAsk());
  const { registry, issues } = load(scenario);
  expect(issues).toEqual([]);
  expect(composedSiteIssues(registry, scenario)).toEqual([]);
  const { layout } = composeLayout(11, registry, scenario);
  const index = layout.buildings.findIndex(({ template }) => template === ROUTE);
  expect(index).toBeGreaterThanOrEqual(0);
  const placement = new AuthoredSite(11, registry, makeScale(0.5), layout).placements[index]!;
  expect(placement.template.provenance?.some((owner) => owner?.slotPath.startsWith(`${ROUTE}/`))).toBe(true);
});

it('reports an ask naming an assembly its eligibility excludes from the settlement kind', () => {
  const scenario = scenarioFixture();
  scenario.asks.push(routeAsk());
  expect(load(scenario, undefined, false, kitsAdmitting(['other_kind'])).issues).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining(`.asks[${scenario.asks.length - 1}].template`),
      message: expect.stringContaining(scenario.settlementKind),
    }),
  );
});

// A pool whose only drawable row is the route assembly; the cabin row stays listed at zero weight.
const ROUTE_POOL = 'fixture_ask_pool';
const kitsWithRoutePool = (scenario: ComposedSiteDef): ContentFile => ({
  ...kitsAdmitting([scenario.settlementKind]),
  mapPools: [
    {
      id: ROUTE_POOL,
      choices: [
        { ref: { kind: 'template', id: 'fixture_cabin' }, weight: 0 },
        { ref: { kind: 'assembly', id: ROUTE }, weight: 1 },
      ],
    },
  ],
});

it('places an ask naming a pool as a building drawn from its positive-weight rows', () => {
  const scenario = scenarioFixture();
  const { template: _template, ...route } = routeAsk();
  scenario.asks.push({ ...route, pool: ROUTE_POOL });
  const { registry, issues } = load(scenario, undefined, false, kitsWithRoutePool(scenario));
  expect(issues).toEqual([]);
  expect(composeLayout(11, registry, scenario).layout.buildings.at(-1)?.template).toBe(ROUTE);
});

it('reports a start ask whose pool can draw a building without an entrance', () => {
  const scenario = scenarioFixture();
  const { template: _template, ...home } = scenario.asks[0]!;
  scenario.asks[0] = { ...home, pool: ROUTE_POOL };
  expect(load(scenario, undefined, false, kitsWithRoutePool(scenario)).issues).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining('.asks[0].pool'),
      message: expect.stringMatching(new RegExp(`"${ROUTE}".*entrance`)),
    }),
  );
});

it('names the ask when its footprint cannot fit within the content retry budget', () => {
  const scenario = scenarioFixture();
  scenario.bounds = { x0: 0, z0: 0, x1: 1, z1: 1 };
  scenario.placement.attempts = 1;
  const { registry } = load(scenario);
  expect(() => composeLayout(11, registry, scenario)).toThrow('ask "home" did not fit after 1 attempts');
});

it('suppresses authored template actors only when composed population disallows markers', () => {
  const scenario = scenarioFixture();
  const { registry, issues } = load(scenario, undefined, true);
  expect(issues).toEqual([]);
  const { layout } = composeLayout(11, registry, scenario);
  const enabled = new AuthoredSite(11, registry, makeScale(0.5), layout, { authoredMarkers: true });
  const disabled = new AuthoredSite(11, registry, makeScale(0.5), layout, { authoredMarkers: false });
  const [x, , z] = layout.player.position;
  const column = [Math.floor(x / 16), Math.floor(z / 16)] as const;
  expect(enabled.actorsIn(...column).length).toBeGreaterThan(0);
  expect(disabled.actorsIn(...column)).toEqual([]);
});

const edgeAnchor = (id: string): ComposedSiteDef['anchors'][number] => ({
  kind: 'edge',
  id,
  minDistance: 40,
  clearOf: ['woodland', 'building'],
  spawnMarginMetres: 2,
  woodlandDensityFloor: 0.1,
});

it('resolves anchors once and gives each wave a named anchor cell without append coupling', () => {
  const scenario = scenarioFixture();
  scenario.anchors = [edgeAnchor('approach_a'), edgeAnchor('approach_b')];
  scenario.eventRules = [
    {
      id: 'first',
      trigger: { kind: 'elapsed', afterGameHours: gameHours(1) },
      conditions: [],
      effects: [
        { kind: 'releaseHorde', actor: 'fixture_settlement_actor', count: 1, at: ['approach_a', 'approach_b'] },
      ],
    },
    {
      id: 'second',
      trigger: { kind: 'elapsed', afterGameHours: gameHours(2) },
      conditions: [],
      effects: [{ kind: 'releaseHorde', actor: 'fixture_settlement_actor', count: 1, at: 'approach_b' }],
    },
  ];
  const { registry, issues } = load(scenario);
  expect(issues).toEqual([]);
  const resolved = composeLayout(11, registry, scenario);
  expect(Object.keys(resolved.anchors).length).toBe(scenario.anchors.length);
  expect(resolved.eventRules.length).toBe(scenario.eventRules.length);
  for (const anchor of scenario.anchors) {
    const cell = resolved.anchors[anchor.id]!;
    expect(
      Math.hypot(
        cell[0] * 0.5 - resolved.layout.player.position[0],
        cell[2] * 0.5 - resolved.layout.player.position[2],
      ),
    ).toBeGreaterThanOrEqual(anchor.minDistance);
    expect(
      anchorCleared(anchor, cell, resolved.layout, {
        reservations: resolved.reservations.filter((r) => r.ask !== anchor.id),
        densityAt: () => 0,
      }),
    ).toBe(true);
    expect(resolved.reservations.some((r) => r.ask === anchor.id && r.kind === 'anchor')).toBe(true);
  }
  for (const rule of resolved.eventRules) {
    for (const effect of rule.effects) {
      expect(Object.values(resolved.anchors)).toContainEqual(effect.at);
    }
  }
  expect(resolved.eventRules[1]!.effects[0]!.at).toEqual(resolved.anchors.approach_b);
  scenario.anchors.push(edgeAnchor('extra'));
  scenario.eventRules.push({ ...scenario.eventRules[0]!, id: 'later' });
  const appended = composeLayout(11, registry, scenario);
  for (const [id, cell] of Object.entries(resolved.anchors)) {
    expect(appended.anchors[id]).toEqual(cell);
  }
  expect(appended.eventRules.slice(0, resolved.eventRules.length)).toEqual(resolved.eventRules);
});

it('enforces cell-anchor clearance classes and distance rather than silently relocating it', () => {
  const scenario = scenarioFixture();
  const { registry } = load(scenario);
  const composed = composeLayout(11, registry, scenario);
  const home = composed.layout.player.position;
  const at: [number, number, number] = home.map((v) => v * 2) as [number, number, number];
  const anchor = { ...edgeAnchor('blocked'), kind: 'cell' as const, at, minDistance: 0 };
  expect(anchorCleared(anchor, at, composed.layout, { reservations: composed.reservations, densityAt: () => 0 })).toBe(
    false,
  );
  expect(
    anchorCleared({ ...anchor, clearOf: [] }, at, composed.layout, {
      reservations: composed.reservations,
      densityAt: () => 0,
    }),
  ).toBe(true);
  expect(
    anchorCleared({ ...anchor, minDistance: 1, clearOf: [] }, at, composed.layout, {
      reservations: [],
      densityAt: () => 0,
    }),
  ).toBe(false);
  const layout = {
    ...composed.layout,
    woodlands: [
      {
        polygon: [
          [-80, -80],
          [80, -80],
          [80, 80],
          [-80, 80],
        ] as [number, number][],
        profile: 'woodland',
      },
    ],
  };
  expect(anchorCleared(anchor, at, layout, { reservations: [], densityAt: () => 0.8 })).toBe(false);
  expect(
    anchorCleared({ ...anchor, woodlandDensityFloor: 0.9 }, at, layout, { reservations: [], densityAt: () => 0.8 }),
  ).toBe(true);
  scenario.anchors = [anchor];
  expect(() => composeLayout(11, registry, scenario)).toThrow('anchor "blocked" could not resolve');
  anchor.clearOf = [];
  expect(composeLayout(11, registry, scenario).anchors.blocked).toEqual(at);
});

it('admits composed anchors against resolved low-density cover before applying their own exclusion', () => {
  const scenario = scenarioFixture();
  const { registry } = load(scenario);
  const tuning = [...registry.siteGeneration.values()][0]!;
  tuning.vegetation.openDensity = 0.3;
  tuning.vegetation.forestDensityField = { wavelengthMetres: 8, seedSalt: 0, floor: 1, gain: 0, ceiling: 1 };
  tuning.vegetation.regionProfiles = {
    forest: { density: 1, edgeWavelengthMetres: 8, edgeVariationMetres: 0, treeMix: ['broadleaf'] },
    field: { density: 0, edgeWavelengthMetres: 8, edgeVariationMetres: 0, treeMix: ['young'] },
  };
  const polygon: [number, number][] = [
    [-80, -80],
    [80, -80],
    [80, 80],
    [-80, 80],
  ];
  scenario.woodlands = [
    { polygon, profile: 'forest' },
    { polygon, profile: 'field' },
  ];
  scenario.anchors = [
    { ...edgeAnchor('field-arrival'), kind: 'cell', at: [-158, 1, -158], minDistance: 0, clearOf: ['woodland'] },
  ];
  const result = composeLayout(11, registry, scenario);
  expect(result.layout.woodlands).toEqual(scenario.woodlands);
  expect(result.anchors['field-arrival']).toEqual(
    scenario.anchors[0]!.kind === 'cell' ? scenario.anchors[0]!.at : undefined,
  );
  scenario.woodlands = scenario.woodlands.slice(0, 1);
  expect(() => composeLayout(11, registry, scenario)).toThrow('anchor "field-arrival" could not resolve');
});

it('rejects missing and duplicate anchor references at load and never accepts wave cells', () => {
  const scenario = scenarioFixture();
  scenario.anchors = [edgeAnchor('same'), edgeAnchor('same')];
  scenario.eventRules = [
    {
      id: 'wave',
      trigger: { kind: 'elapsed', afterGameHours: gameHours(1) },
      conditions: [],
      effects: [{ kind: 'releaseHorde', actor: 'fixture_settlement_actor', count: 1, at: 'missing' }],
    },
  ];
  const { issues } = load(scenario);
  expect(issues).toContainEqual(expect.objectContaining({ path: expect.stringContaining('.anchors[1].id') }));
  expect(issues).toContainEqual(
    expect.objectContaining({ path: expect.stringContaining('.eventRules[0].effects[0].at') }),
  );
  expect(() =>
    parse(ComposedSiteSchema, {
      ...scenario,
      eventRules: [
        {
          ...scenario.eventRules[0],
          effects: [{ kind: 'releaseHorde', actor: 'fixture_settlement_actor', count: 1, at: [0, 1, 0] }],
        },
      ],
    }),
  ).toThrow();
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
