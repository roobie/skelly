import { buildRegistry } from '@skelly/engine/content';
import { buildingFootprint, layoutBuildingSite, placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { lotOf } from '@skelly/engine/internal/core/authoredTerrain.mjs';
import { createAuthoredGround } from '@skelly/engine/internal/core/authoredTerrainEvaluator.ts';
import { claimed } from '@skelly/engine/internal/core/capabilities.ts';
import { anchorCleared, composedSiteIssues, composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { SiteLayoutSchema } from '@skelly/engine/internal/core/schema/layouts.ts';
import { type ComposedSiteDef, ComposedSiteSchema } from '@skelly/engine/internal/core/schema/scenarios.ts';
import type { ContentFile, SiteLayoutDef } from '@skelly/engine/internal/core/schema.ts';
import { templateBodySpace } from '@skelly/engine/internal/core/templateSpatial.ts';
import type { Placement } from '@skelly/engine/internal/core/templates.ts';
import { placedPort, portsMate } from '@skelly/engine/internal/core/templates.ts';
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
      anchorCleared(
        anchor,
        cell,
        resolved.layout,
        resolved.reservations.filter((r) => r.ask !== anchor.id),
      ),
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
  expect(anchorCleared(anchor, at, composed.layout, composed.reservations)).toBe(false);
  expect(anchorCleared({ ...anchor, clearOf: [] }, at, composed.layout, composed.reservations)).toBe(true);
  expect(anchorCleared({ ...anchor, minDistance: 1, clearOf: [] }, at, composed.layout, [])).toBe(false);
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
        density: 0.8,
      },
    ],
  };
  expect(anchorCleared(anchor, at, layout, [])).toBe(false);
  expect(anchorCleared({ ...anchor, woodlandDensityFloor: 0.9 }, at, layout, [])).toBe(true);
  scenario.anchors = [anchor];
  expect(() => composeLayout(11, registry, scenario)).toThrow('anchor "blocked" could not resolve');
  anchor.clearOf = [];
  expect(composeLayout(11, registry, scenario).anchors.blocked).toEqual(at);
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

// A two-compound site joined by one dirt road: the fixture kit's road assemblies and profile (see
// `packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet`, `roadProfiles`).
const roadScenario = (links: ComposedSiteDef['links']): ComposedSiteDef => {
  const base = scenarioFixture();
  return {
    ...base,
    id: 'fixture_roads',
    start: { ask: 'homestead' },
    asks: [
      { kind: 'place', id: 'homestead', template: 'fixture_homestead', supplies: [] },
      {
        kind: 'place',
        id: 'barn',
        template: 'fixture_barn',
        supplies: [],
        distance: {
          from: 'homestead',
          curve: [
            [6, 3],
            [16, 3],
            [30, 0],
          ],
        },
      },
    ],
    guarantee: {},
    links,
  };
};
const LANE: ComposedSiteDef['links'] = [
  {
    id: 'lane',
    from: { ask: 'homestead', port: 'gate' },
    to: { ask: 'barn', port: 'gate' },
    transition: { assembly: 'fixture_corner', gate: 'gate', outward: 'outward' },
    surface: 'fixture_floor',
  },
];
const roadFixture = () => {
  const scenario = roadScenario(LANE);
  return { scenario, ...composeRoads(scenario, true) };
};
const composeRoads = (
  scenario: ComposedSiteDef,
  clean = false,
  kits: ContentFile = kitsAdmitting([scenario.settlementKind]),
) => {
  const sources = [
    ...fixtureScenarioSources(),
    { source: 'fixture-kits.json', data: kits },
    {
      source: 'fixture-roads.json',
      data: { scenarios: [scenario], starts: [fixtureStartRow(null, { site: scenario.id })] },
    },
  ];
  const { registry, issues } = buildRegistry(sources);
  if (clean && issues.length > 0) {
    throw new Error(`fixture scenario did not load cleanly: ${JSON.stringify(issues)}`);
  }
  return { registry };
};
const gatePort = (
  context: { registry: ReturnType<typeof buildRegistry>['registry']; seed: number; layout: SiteLayoutDef },
  index: number,
  id: string,
) => {
  const building = context.layout.buildings[index]!;
  const placement = placementOf(
    context.registry,
    building,
    context.layout.lootContext,
    layoutBuildingSite(context.seed, context.layout.id, index),
  );
  const port = placement.template.ports!.find((candidate) => candidate.id === id)!;
  return placedPort(placement, port);
};

/** A world point in metres turned back into a placement's own template coordinates. */
const localOf = (placement: Placement, [wx, wy, wz]: readonly [number, number, number]): Vec3 => {
  const u = wx / 0.5 - placement.origin[0] - 0.5;
  const v = wz / 0.5 - placement.origin[2] - 0.5;
  const [sx, , sz] = placement.template.size;
  switch (placement.turn) {
    case 1:
      return [v + 0.5, wy / 0.5 - placement.origin[1], sz - 0.5 - u];
    case 2:
      return [sx - 0.5 - u, wy / 0.5 - placement.origin[1], sz - 0.5 - v];
    case 3:
      return [sx - 0.5 - v, wy / 0.5 - placement.origin[1], u + 0.5];
    default:
      return [u + 0.5, wy / 0.5 - placement.origin[1], v + 0.5];
  }
};

// Seed 11 places the homestead at rotation 180 (gate opening west) and seed 73 at rotation 0 (gate opening
// east), so the pair covers the gate mate from opposite facings.
it.each([11, 73])('fulfils a link with mated gates, docked transitions and a drawn track (seed %s)', (seed) => {
  const { scenario, registry } = roadFixture();
  const { layout, reservations } = composeLayout(seed, registry, scenario);
  const placed = { registry, seed, layout };
  expect(parse(SiteLayoutSchema, layout)).toEqual(layout);
  expect(layout.buildings.map((building) => building.template)).toEqual([
    'fixture_homestead',
    'fixture_barn',
    'fixture_corner',
    'fixture_corner',
  ]);
  // The docked transitions mate their compound gates point for point, which only a real rotation achieves.
  const homesteadGate = gatePort(placed, 0, 'gate');
  const barnGate = gatePort(placed, 1, 'gate');
  const cornerA = gatePort(placed, 2, 'gate');
  const cornerB = gatePort(placed, 3, 'gate');
  expect(portsMate(homesteadGate, cornerA)).toBe(true);
  expect(portsMate(barnGate, cornerB)).toBe(true);
  // The track draws from the homestead's gate mouth to the barn's, at the profile's width.
  const track = layout.tracks[0]!;
  expect(track).toBeDefined();
  expect(track.width).toBe(1);
  expect(track.surface).toBe('fixture_floor');
  expect(track.points[0]).toEqual([homesteadGate.at[0] * 0.5, homesteadGate.at[2] * 0.5]);
  expect(track.points.at(-1)).toEqual([barnGate.at[0] * 0.5, barnGate.at[2] * 0.5]);
  // The road's own ground is reserved for it, named for the link.
  expect(reservations.filter((rect) => rect.kind === 'track' && rect.ask === 'lane').length).toBeGreaterThanOrEqual(3);
  // The start stands just outside its compound's road gate, facing along the road.
  const facing = homesteadGate.facing as 'n' | 'e' | 's' | 'w';
  const normal = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[facing]!;
  expect(layout.player.position).toEqual([
    (homesteadGate.at[0] + normal[0]!) * 0.5,
    homesteadGate.at[1] * 0.5,
    (homesteadGate.at[2] + normal[1]!) * 0.5,
  ]);
  expect(layout.player.bearing).toBe({ n: 0, e: 90, s: 180, w: 270 }[facing]);
  const site = new AuthoredSite(seed, registry, makeScale(0.5), layout);
  expect(site.authoredPlacements).toHaveLength(layout.buildings.length);
});

it("orients a transition's route from the gate mouth to the outward mouth however it was authored", () => {
  const scenario = roadScenario(LANE);
  const kits = structuredClone(kitsAdmitting([scenario.settlementKind]));
  // The corner's route authored mouth-to-mouth the other way round must still draw the track gate to gate.
  const bend = kits.mapPieces!.find((piece) => piece.id === 'road_bend')!;
  bend.route = [...bend.route!].reverse();
  const { registry } = composeRoads(scenario, true, kits);
  const { layout } = composeLayout(11, registry, scenario);
  const placed = { registry, seed: 11, layout };
  const homesteadGate = gatePort(placed, 0, 'gate');
  const barnGate = gatePort(placed, 1, 'gate');
  const [track] = layout.tracks;
  expect(track?.points[0]).toEqual([homesteadGate.at[0] * 0.5, homesteadGate.at[2] * 0.5]);
  expect(track?.points.at(-1)).toEqual([barnGate.at[0] * 0.5, barnGate.at[2] * 0.5]);
});

it('proves a continuous standing passage along the joined road across gates, transitions and terrain', () => {
  const { scenario, registry } = roadFixture();
  const seed = 11;
  const { layout } = composeLayout(seed, registry, scenario);
  const [track] = layout.tracks;
  expect(track).toBeDefined();
  const placements = layout.buildings.map((building, index) =>
    placementOf(registry, building, layout.lootContext, layoutBuildingSite(seed, layout.id, index)),
  );
  const rects = layout.buildings.map((building, index) => ({
    rect: buildingFootprint(registry, building),
    placement: placements[index]!,
  }));
  const tuning = claimed(registry.siteGeneration, 'authoredSite');
  const ground = createAuthoredGround({
    blockSize: 0.5,
    seed,
    topography: tuning!.topography,
    layout,
    protectedBuildings: rects.map(({ rect }) => rect),
    spawnPoints: [],
    lots: layout.buildings.map((building, index) => lotOf(building, rects[index]!.rect)),
    tracks: layout.tracks.map(({ points, width, surface }) => ({
      points,
      width,
      surface: registry.blockIds.get(surface),
    })),
    catalogue: undefined,
  });
  // The route fixtures walk at template height 1, half a metre above the ground storey.
  const feet = 0.5;
  const bodyHalf = 0.3;
  let insideTemplates = 0;
  let acrossGround = 0;
  for (let index = 1; index < track!.points.length; index++) {
    const from = track!.points[index - 1]!;
    const to = track!.points[index]!;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(length / 0.25));
    for (let step = 0; step <= steps; step++) {
      const [x, z] = [from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps];
      const owners = rects.filter(
        ({ rect }) =>
          x > rect.x0 + bodyHalf && x < rect.x1 - bodyHalf && z > rect.z0 + bodyHalf && z < rect.z1 - bodyHalf,
      );
      if (owners.length > 0) {
        insideTemplates += 1;
        for (const { placement } of owners) {
          const local = localOf(placement, [x, feet, z]);
          expect(
            templateBodySpace(registry, placement.template).standing(local),
            `standing at ${JSON.stringify(local)} of ${placement.template.id}`,
          ).toBe(true);
        }
      } else {
        acrossGround += 1;
        // Between the compounds the road crosses open ground, which the authored surface holds level with the
        // gates whatever the natural terrain would say.
        expect(ground.height(Math.floor(x * 2), Math.floor(z * 2), 999_999), `flat under ${x},${z}`).toBe(
          layout.ground / 0.5,
        );
      }
    }
  }
  // The passage must actually cross through the placed buildings and across open ground, or the sample loop
  // proved nothing.
  expect(insideTemplates).toBeGreaterThan(0);
  expect(acrossGround).toBeGreaterThan(0);
});

it('refuses a destination the road cannot join, naming the link, profile and transition', () => {
  const scenario = roadScenario([LANE[0]!, { ...LANE[0]!, id: 'lane_too' }]);
  const { registry } = composeRoads(scenario);
  expect(() => composeLayout(11, registry, scenario)).toThrow(
    // biome-ignore lint/performance/useTopLevelRegex: one throw-message shape, safe to construct per call
    /ask "barn" did not fit after \d+ attempts: link "lane_too" cannot join ask "homestead" port "gate" to ask "barn" port "gate" through road profile "fixture_road" with transition "fixture_corner" \(fixture-kits\.json:mapAssemblies\[/,
  );
});

it('refuses a source ask whose road cannot leave, naming the same whole link contract', () => {
  // Bounds with room for the compound alone in every rotation leave no room for the docked transition and its
  // lead beside any gate, so the source ask exhausts its attempts for the link's own reason.
  const scenario = {
    ...roadScenario(LANE),
    bounds: { x0: 0, z0: 0, x1: 4, z1: 4 },
    placement: { apronMetres: 0, attempts: 20 },
  };
  const { registry } = composeRoads(scenario);
  expect(() => composeLayout(11, registry, scenario)).toThrow(
    // biome-ignore lint/performance/useTopLevelRegex: one throw-message shape, safe to construct per call
    /ask "homestead" did not fit after 20 attempts: link "lane" cannot join ask "homestead" port "gate" to ask "barn" port "gate" through road profile "fixture_road" with transition "fixture_corner" \(fixture-kits\.json:mapAssemblies\[\d+\]\): no room beside ask "homestead" for the road to leave/,
  );
});

it('rejects a transition whose route joins ports other than the named gate and outward', () => {
  const kits = structuredClone(kitsAdmitting(['fixture_city']));
  const bend = kits.mapPieces!.find((piece) => piece.id === 'road_bend')!;
  bend.ports.push({
    id: 'side',
    type: 'fixture_road',
    facing: 'e',
    at: [4, 1, 2],
    traversal: 'walk',
    aperture: [2, 4],
    clearance: { min: [2, 1, 1], size: [2, 4, 2] },
    standing: [3, 1, 2],
  });
  const corner = kits.mapAssemblies!.find((assembly) => assembly.id === 'fixture_corner')!;
  corner.ports.push({ id: 'side', slot: 'body', port: 'side' });
  const scenario = roadScenario([{ ...LANE[0]!, transition: { ...LANE[0]!.transition, gate: 'side' } }]);
  const { registry } = composeRoads(scenario, false, kits);
  expect(composedSiteIssues(registry, scenario)).toContainEqual([
    '.links[0].transition',
    'transition "fixture_corner" needs a route between ports "side" and "outward"',
  ]);
});

it('refuses at load a link whose ask can draw a building without its gate', () => {
  const kits = structuredClone(kitsAdmitting(['fixture_city']));
  kits.mapPools = [
    ...(kits.mapPools ?? []),
    {
      id: 'fixture_mixed',
      choices: [
        { ref: { kind: 'assembly', id: 'fixture_homestead' }, weight: 1 },
        { ref: { kind: 'piece', id: 'room_a' }, weight: 1 },
      ],
    },
  ];
  const scenario = roadScenario(LANE);
  scenario.asks[0] = { kind: 'place', id: 'homestead', pool: 'fixture_mixed', supplies: [] };
  const { registry } = composeRoads(scenario, false, kits);
  expect(composedSiteIssues(registry, scenario)).toContainEqual([
    '.links[0].from.ask',
    'link "lane" endpoint "homestead" must place an assembly carrying gate "gate", not "room_a"',
  ]);
});

it('rejects link endpoints that name no placed road gate', () => {
  const scenario = roadScenario([{ ...LANE[0]!, from: { ...LANE[0]!.from, port: 'nope' } }]);
  const { registry } = composeRoads(scenario);
  const issues = composedSiteIssues(registry, scenario);
  expect(issues).toContainEqual(['.links[0].from.port', expect.any(String)]);
  expect(issues.some(([path]) => path === '.links[0].from.port' || path.startsWith('.links'))).toBe(true);
});

it('rejects a link whose asks are not in placement order', () => {
  const scenario = roadScenario([
    { ...LANE[0]!, from: { ask: 'barn', port: 'gate' }, to: { ask: 'homestead', port: 'gate' } },
  ]);
  const { registry } = composeRoads(scenario);
  expect(composedSiteIssues(registry, scenario)).toContainEqual([
    '.links[0].from.ask',
    'link "lane" must leave an ask placed before "homestead"',
  ]);
});

it('rejects a transition that shares no road profile with the gates', () => {
  const scenario = roadScenario(LANE);
  const kits = structuredClone(kitsAdmitting([scenario.settlementKind]));
  const bend = kits.mapPieces!.find((piece) => piece.id === 'road_bend')!;
  for (const port of bend.ports) {
    port.type = 'corridor';
  }
  const { registry } = composeRoads(scenario, false, kits);
  expect(composedSiteIssues(registry, scenario)).toContainEqual([
    '.links[0].transition',
    'link "lane" gates and transition "fixture_corner" must share one walk road profile and aperture',
  ]);
});

it('rejects a transition with no route through it', () => {
  const scenario = roadScenario([
    {
      ...LANE[0]!,
      transition: { ...LANE[0]!.transition, assembly: 'fixture_homestead', gate: 'gate', outward: 'gate' },
    },
  ]);
  const { registry } = composeRoads(scenario);
  expect(composedSiteIssues(registry, scenario)).toContainEqual([
    '.links[0].transition',
    'transition "fixture_homestead" needs a route between ports "gate" and "gate"',
  ]);
});
