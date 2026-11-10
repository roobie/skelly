import { describe, expect, it, vi } from 'vitest';
import { buildCityPlan, cityGridOf, scenarioPlanIssues, servicePlacement } from '../src/core/cityPlan.ts';
// biome-ignore lint/performance/noNamespaceImport: A module spy observes every scenario-source handoff.
import * as lootSelection from '../src/core/loot.ts';
import { composeScenario } from '../src/core/scenarioComposition.ts';
import { startIssues } from '../src/core/startIssues.ts';
import { compileTemplate, placedPieces } from '../src/core/templates.ts';
import { Inventory } from '../src/engine/inventory.ts';
import { discoveryForPlan } from '../src/engine/sim.ts';
import { CitySite, makeScale, toChunk } from '../src/engine/world.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();
const PROMISED_STOCK_ERROR = /Promised stock/;
const OVERRIDE_STOCK_ERROR = /fixture_start.*2,1,2.*fixture_home_token/;

import { fixtureLootContext } from './economyFixtures.ts';
import { defaultStartOf, composedFixture as fixture, fixtureStart, fixtureStartRow } from './fixtures/scenario.ts';

const eventFixture = () => {
  const { profile, registry } = fixture();
  const host = {
    id: 'fixture_event_host',
    eligibility: { settlementKinds: ['fixture_city'] },
    lootContext: fixtureLootContext(),
    size: [5, 3, 5] as [number, number, number],
    palette: { '.': 'air', '=': 'fixture_solid', H: { furniture: 'fixture_event_host_piece' } },
    layers: [
      ['=====', '=====', '=====', '=====', '====='],
      ['.....', '.HH..', '.....', '.....', '.....'],
      ['.....', '.....', '.....', '.....', '.....'],
    ],
  };
  const event = {
    id: 'fixture_event',
    lootContext: { usage: ['Military'] as 'Military'[], tier: 'Tier2' as const },
    size: [1, 2, 1] as [number, number, number],
    palette: { '.': 'air', '=': { ground: true as const }, E: { furniture: 'fixture_crate' } },
    layers: [['='], ['E']],
  };
  registry.furniture.set('fixture_event_host_piece', {
    ...registry.furniture.get('fixture_crate')!,
    id: 'fixture_event_host_piece',
    size: [2, 1, 1],
  });
  registry.templates.set(host.id, host);
  registry.templates.set(event.id, event);
  profile.city.fillRows = false;
  profile.city.lots = [
    { id: 'fixture_event_lot', position: [-10, -10], size: [5, 5], turn: 1, source: { kind: 'template', id: host.id } },
  ];
  profile.composition!.events = [
    {
      template: event.id,
      lot: 'fixture_event_lot',
      at: [0, 0, 0],
      fixedLoot: [{ at: [0, 1, 0], items: [{ item: 'fixture_event_token' }] }],
    },
  ];
  return { profile, registry, host, event };
};

describe('authored scenario composition', () => {
  it('places fixed container and surface items at the turned anchor independent of column requests', () => {
    const { profile, registry } = fixture();
    const grid = cityGridOf(registry, profile.city);
    const start = fixtureStart();
    const base = buildCityPlan({ seed: 7, registry, floor: 32, grid, scenario: profile, start });
    const compiled = compileTemplate(registry, registry.templates.get(profile.serviceTemplate)!);
    for (const turn of [0, 1, 2, 3] as const) {
      const service = servicePlacement({ template: compiled, floor: 32, grid, cell: [-1, 0], turn });
      const composition = composeScenario(registry, profile, service, {
        floor: 32,
        start: { definition: start, placement: base.composition!.start!.placement },
      })!;
      const site = new CitySite(7, registry, makeScale(0.5), {
        ...base,
        service,
        composition,
        placements: [service, ...composition.leads, ...composition.landmarks],
      });
      const anchor = placedPieces(service).find((piece) => piece.furniture === 'fixture_crate')!.pos;
      const read = () =>
        site
          .furnitureIn(toChunk(anchor[0]), toChunk(anchor[2]))
          .find((spawn) => spawn.spec.pos.join(',') === anchor.join(','))!;
      const selection = vi.spyOn(lootSelection, 'rollLootParts');
      const before = read();
      expect(before).toBeDefined();
      const points = site.lootPointsIn(toChunk(anchor[0]), toChunk(anchor[2]));
      expect(points.some((point) => point.channel === 'container' && point.required)).toBe(true);
      expect(points.some((point) => point.channel === 'surface' && point.required)).toBe(true);
      expect(selection.mock.calls.map(([, point]) => point.id)).toEqual(
        expect.arrayContaining(points.map((point) => point.id)),
      );
      selection.mockRestore();
      for (const [channel, entries] of [
        ['container', before.loot],
        ['surface', before.surfaceLoot!],
      ] as const) {
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          const point = points.find(
            (candidate) => candidate.channel === channel && candidate.destination.join(',') === anchor.join(','),
          )!;
          expect(point.context.usage).toEqual(['Medical']);
          expect(entry.count).toBeGreaterThan(0);
        }
      }
      expect(
        before.loot.filter((item) => item.type === 'fixture_token').reduce((sum, item) => sum + item.count, 0),
      ).toBeGreaterThanOrEqual(3);
      expect(before.surfaceLoot?.map((item) => item.type)).toEqual(['fixture_token']);
      site.furnitureIn(90, -90);
      expect(read()).toEqual(before);
      expect(composition.resources[0]!.at).toEqual(anchor);
      expect(Object.isFrozen(composition.descents[0]!.lower)).toBe(true);
      expect(site.authoredPlacements).toBe(site.placements);
    }
  });

  it('checks event stock under the event context, not its host context', () => {
    const { profile, registry, event } = eventFixture();
    expect(scenarioPlanIssues(registry, profile)).toEqual([]);
    registry.templates.set(event.id, { ...event, lootContext: fixtureLootContext() });
    expect(
      scenarioPlanIssues(registry, profile).filter(([path]) => path.startsWith('.composition.events')),
    ).toHaveLength(1);
  });

  it('refuses an event outside its lot', () => {
    const { profile, registry } = eventFixture();
    profile.composition!.events![0]!.at = [5, 0, 0];
    expect(scenarioPlanIssues(registry, profile)).toContainEqual([
      '.composition.events[0].at',
      'an event lies outside its lot',
    ]);
  });

  it('refuses an event over every cell of a host furniture footprint', () => {
    const { profile, registry } = eventFixture();
    profile.composition!.events![0]!.at = [2, 0, 1];
    expect(scenarioPlanIssues(registry, profile)).toContainEqual([
      '.composition.events[0].at',
      "an event overlaps its host's blocks or furniture",
    ]);
  });

  it('refuses an event over its host blocks', () => {
    const { profile, registry, host } = eventFixture();
    registry.templates.set(host.id, {
      ...host,
      layers: [host.layers[0]!, ['.....', '.HH..', '.....', '...=.', '.....'], host.layers[2]!],
    });
    profile.composition!.events![0]!.at = [3, 0, 3];
    expect(scenarioPlanIssues(registry, profile)).toContainEqual([
      '.composition.events[0].at',
      "an event overlaps its host's blocks or furniture",
    ]);
  });

  it('composes event stock at its lot turn without making an event a lead', () => {
    const { profile, registry } = eventFixture();
    const plan = buildCityPlan({
      seed: 5,
      registry,
      floor: 32,
      grid: cityGridOf(registry, profile.city),
      scenario: profile,
      start: fixtureStart(),
    });
    const composition = plan.composition!;
    expect(composition.events[0]!.turn).toBe(plan.lots![0]!.placement!.turn);
    expect(composition.lootSources.some(({ placement }) => placement === composition.events[0])).toBe(true);
    expect(composition.leads).toHaveLength(profile.composition!.leads.length);
  });

  it('rejects dangling resource, unreadable public lead and out-of-block landmark metadata', () => {
    const { profile, registry } = fixture();
    profile.composition!.resources[0]!.at = [0, 0, 0];
    profile.composition!.leads[0] = { template: 'fixture_small_house' };
    profile.composition!.landmarks[0] = profile.serviceTemplate;
    const issues = scenarioPlanIssues(registry, profile);
    expect(issues.some(([path]) => path === '.composition.resources[0].at')).toBe(true);
    expect(issues.some(([path]) => path === '.composition.leads[0]')).toBe(true);
    expect(issues.some(([path]) => path === '.composition.landmarks[0]')).toBe(true);
  });

  it('accepts a readable surface item lead and discovers its placed pile cell, not its support', () => {
    const { profile, registry } = fixture();
    const item = registry.items.get('fixture_token')!;
    registry.items.set(item.id, {
      ...item,
      category: 'note',
      readable: { title: 'Fixture paper', text: 'Independent directions.' },
    });
    const [lead] = profile.composition!.leads;
    const crate = registry.furniture.get('fixture_crate')!;
    registry.furniture.set('fixture_paper_support', { ...crate, id: 'fixture_paper_support', size: [2, 2, 2] });
    const template = registry.templates.get(lead.template)!;
    registry.templates.set(template.id, {
      ...template,
      palette: { '=': 'fixture_solid', N: { furniture: 'fixture_paper_support' } },
      size: [2, 3, 2],
      layers: [
        ['==', '=='],
        ['NN', 'NN'],
        ['NN', 'NN'],
      ],
    });
    lead.fixedLoot = [{ at: [0, 1, 0], items: [{ item: item.id, placement: 'surface' }] }];
    expect(scenarioPlanIssues(registry, profile)).toEqual([]);
    const plan = buildCityPlan({
      seed: 8,
      registry,
      floor: 32,
      grid: cityGridOf(registry, profile.city),
      scenario: profile,
      start: fixtureStart(),
    });
    const site = new CitySite(8, registry, makeScale(0.5), plan);
    const support = placedPieces(plan.composition!.leads[0]!)[0]!;
    const spawn = site
      .furnitureIn(toChunk(support.pos[0]), toChunk(support.pos[2]))
      .find(({ spec }) => spec.pos.join(',') === support.pos.join(','))!;
    const inventory = new Inventory(registry);
    expect(inventory.furnish(spawn.spec, spawn.loot, spawn.surfaceLoot)).toBeDefined();
    const pile = [...inventory.piles.values()].find((candidate) =>
      candidate.items.some((entry) => entry.item.type === item.id),
    );
    expect(pile).toBeDefined();
    const { clues } = discoveryForPlan(plan, registry)!;
    expect(clues).toContainEqual(pile!.pos);
    expect(clues).not.toContainEqual(support.pos);
    expect(
      site
        .lootPointsIn(toChunk(support.pos[0]), toChunk(support.pos[2]))
        .some((point) => point.channel === 'surface' && point.position.join(',') === pile!.pos.join(',')),
    ).toBe(true);
    registry.items.set(item.id, item);
    expect(scenarioPlanIssues(registry, profile).some(([, message]) => message.includes('readable source'))).toBe(true);
  });

  it('keeps public leads at separate locations and destination landmarks in the finished plan', () => {
    const { profile, registry } = fixture();
    const grid = cityGridOf(registry, profile.city);
    const plan = buildCityPlan({
      seed: 8,
      registry,
      floor: 32,
      grid,
      scenario: profile,
      start: fixtureStart(),
    });
    const { leads, landmarks } = plan.composition!;
    expect(leads[0]!.origin).not.toEqual(leads[1]!.origin);
    for (const placement of [...leads, ...landmarks]) {
      expect(plan.placements).toContain(placement);
    }
    const benchmark = buildCityPlan({ seed: 8, registry, floor: 32, grid });
    expect(new CitySite(8, registry, makeScale(0.5), benchmark).authoredPlacements).toEqual([]);
  });
});

const bundledScenario = () => {
  const profile = [...BUNDLED_CONTENT.registry.scenarios.values()].find((scenario) => scenario.composition)!;
  return structuredClone(profile);
};

describe('promised stop stock', () => {
  it('puts every promised core item in its stop building', () => {
    const { registry } = BUNDLED_CONTENT;
    const profile = bundledScenario();
    const plan = buildCityPlan({
      seed: 9,
      registry,
      floor: 64,
      grid: cityGridOf(registry, profile.city),
      scenario: profile,
      start: defaultStartOf(registry, profile),
    });
    const site = new CitySite(9, registry, makeScale(0.5), plan);
    const composition = profile.composition!;
    const promises = [
      { placement: plan.composition!.start!.placement, stock: defaultStartOf(registry, profile).fixedLoot ?? [] },
      ...(composition.stops ?? []).map((stop) => ({
        placement: plan.lots!.find(({ definition }) => definition.id === stop.lot)!.placement!,
        stock: stop.fixedLoot,
      })),
    ].flatMap(({ placement, stock }) => stock.map((source) => ({ placement, source })));
    expect(promises.length).toBeGreaterThan(0);
    for (const { placement, source } of promises) {
      const index = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === source.at.join(','));
      const { pos } = placedPieces(placement)[index]!;
      const spawn = site
        .furnitureIn(toChunk(pos[0]), toChunk(pos[2]))
        .find(({ spec }) => spec.pos.join(',') === pos.join(','))!;
      const items = source.items.map(({ item }) => item);
      const fixed = site
        .lootPointsIn(toChunk(pos[0]), toChunk(pos[2]))
        .filter((point) => point.destination.join(',') === pos.join(',') && point.supply.kind === 'fixed')
        .flatMap((point) => (point.supply.kind === 'fixed' ? point.supply.items.map(({ item }) => item) : []));
      expect(fixed).toEqual(expect.arrayContaining(items));
      const inventory = new Inventory(registry);
      inventory.furnish(spawn.spec, spawn.loot, spawn.surfaceLoot);
      const held = [...inventory.items()].map(({ item }) => item.type);
      expect(held).toEqual(expect.arrayContaining(items));
    }
  });

  it('refuses a promise without a container anchor or a fixed lot', () => {
    const { registry } = BUNDLED_CONTENT;
    const profile = bundledScenario();
    const composition = profile.composition!;
    const [stop] = composition.stops!;
    stop!.fixedLoot[0]!.at = [0, 0, 0];
    const startRow = [...registry.starts.values()].find((row) => row.defaultForSite && row.site === profile.id)!;
    const ownStart = structuredClone(startRow);
    ownStart.placement!.fixedLoot![0]!.at = [0, 0, 0];
    const poolLot = profile.city.lots!.find(({ source }) => source?.kind === 'pool')!;
    composition.stops!.push({ lot: poolLot.id, fixedLoot: structuredClone(stop!.fixedLoot) });
    const paths = scenarioPlanIssues(registry, profile).map(([path]) => path);
    expect(paths).toContain('.composition.stops[0].fixedLoot[0].at');
    expect(paths).toContain(`.composition.stops[${composition.stops!.length - 1}].lot`);
    const startPaths = startIssues({ ...registry, starts: new Map([[ownStart.id, ownStart]]) })
      .filter(({ id }) => id === ownStart.id)
      .map(({ path }) => path);
    expect(startPaths).toContain('.placement.fixedLoot[0].at');
    composition.stops!.pop();
    const grid = cityGridOf(registry, profile.city);
    expect(() =>
      buildCityPlan({
        seed: 9,
        registry,
        floor: 64,
        grid,
        scenario: profile,
        start: defaultStartOf(registry, profile),
      }),
    ).toThrow(PROMISED_STOCK_ERROR);
  });

  it('reports an item that only the start override puts out of context on that override, not the template', () => {
    const { registry } = fixture([fixtureStartRow()]);
    const row = [...registry.starts.values()][0]!;
    const template = structuredClone(registry.templates.get(row.placement!.template)!);
    registry.items.set('fixture_home_token', { ...registry.items.get('fixture_token')!, id: 'fixture_home_token' });
    registry.itemEconomy.set('fixture_home_token', {
      id: 'fixture_home_token',
      usage: ['Residential'],
      tiers: ['Tier1'],
      notLoot: false,
    });
    template.palette.C = { furniture: 'fixture_crate', items: [{ item: 'fixture_home_token' }] };
    template.layers[1]![2] = '..C.....==';
    registry.templates.set(template.id, template);
    const issues = () => startIssues(registry).filter(({ id }) => id === row.id);
    expect(issues()).toEqual([]);
    row.placement!.fixedLoot = [{ at: [2, 1, 2], lootUsage: ['Military'], items: [] }];
    expect(issues()).toEqual([
      {
        id: row.id,
        path: '.placement.fixedLoot[0].lootUsage',
        message: expect.stringMatching(OVERRIDE_STOCK_ERROR),
      },
    ]);
  });
});

it('stamps every occupied authored lot and leaves intentional open lots unstamped', () => {
  const { registry } = BUNDLED_CONTENT;
  const profile = [...registry.scenarios.values()].find((scenario) => scenario.composition)!;
  expect(profile).toBeDefined();
  const scale = makeScale(0.5);
  const plan = buildCityPlan({
    seed: 9,
    registry,
    floor: 64,
    grid: cityGridOf(registry, profile.city),
    scenario: profile,
    start: defaultStartOf(registry, profile),
  });
  const site = new CitySite(9, registry, scale, plan);
  expect(plan.lots!.length).toBeGreaterThan(0);
  expect(plan.lots!.some(({ definition }) => !definition.source)).toBe(true);
  for (const { definition, placement } of plan.lots!) {
    if (definition.source) {
      expect(placement).toBeDefined();
      expect(site.placements).toContain(placement);
    } else {
      expect(placement).toBeUndefined();
    }
  }
});
