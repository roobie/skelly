import { buildRegistry } from '@skelly/engine/content';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { anchorCleared, composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { SiteLayoutSchema } from '@skelly/engine/internal/core/schema/layouts.ts';
import { type ComposedSiteDef, ComposedSiteSchema } from '@skelly/engine/internal/core/schema/scenarios.ts';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { gameHours } from '@skelly/engine/internal/core/time.ts';
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
    population: { authoredMarkers: false },
  });
};

const load = (scenario = scenarioFixture(), kinds?: string[], markers = false) => {
  const sources = fixtureScenarioSources();
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
