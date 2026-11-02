// biome-ignore-all lint/suspicious/noMisplacedAssertion: Shared routing assertions are called only by tests.
import { describe, expect, it, vi } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { StressCity } from '../src/core/city.ts';
import type { Registry } from '../src/core/content.ts';
import { toChunk } from '../src/core/coords.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
// biome-ignore lint/performance/noNamespaceImport: The spy observes the actual site-to-selector handoff.
import * as selection from '../src/core/loot.ts';
import { placementLootIssues } from '../src/core/placementLoot.ts';
import { makeScale } from '../src/core/scale.ts';
import { lootSourcesOf, type Site } from '../src/core/site.ts';
import { compileTemplate, type Placement, placedPieces } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureEconomy } from './economyFixtures.ts';

const content = startupContent();
const stock = 'fixture_economy_stock';
const fixtureRegistry = (): Registry => {
  const base = content.registry;
  const registry = {
    ...base,
    items: new Map(base.items),
    loot: new Map(base.loot),
    furniture: new Map(base.furniture),
    templates: new Map(base.templates),
  };
  registry.items.set(stock, {
    id: stock,
    name: 'Fixture stock',
    category: 'misc',
    size: [1, 1],
    weight: 1,
    economy: fixtureEconomy(),
    workInProgress: false,
    notLoot: false,
  });
  for (const [id] of registry.loot) {
    registry.loot.set(id, { id, rolls: [1, 1], entries: [{ item: stock, weight: 1 }] });
  }
  registry.loot.set('fixture_source', { id: 'fixture_source', rolls: [1, 1], entries: [{ item: stock, weight: 1 }] });
  const container = [...base.furniture.values()].find((definition) => definition.container !== undefined)!;
  registry.furniture.set('fixture_container', { ...container, id: 'fixture_container', size: [1, 1, 1] });
  registry.templates.set('fixture_template', {
    id: 'fixture_template',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [1, 1, 1],
    palette: { F: { furniture: 'fixture_container', loot: 'fixture_source' } },
    layers: [['F']],
  });
  return registry;
};

const sourceColumn = (placements: readonly Placement[]) => {
  const piece = placements.flatMap(placedPieces).find((candidate) => candidate.loot !== undefined);
  if (!piece) {
    throw new Error('Source fixture needs one table-bearing furniture anchor');
  }
  return [toChunk(piece.pos[0]), toChunk(piece.pos[2])] as const;
};

const expectRoutedColumn = (site: Site, placements: readonly Placement[]) => {
  const [cx, cz] = sourceColumn(placements);
  const points = site.lootPointsIn(cx, cz);
  expect(points.length).toBeGreaterThan(0);
  const roll = vi.spyOn(selection, 'rollLootParts');
  const spawns = site.furnitureIn(cx, cz);
  expect(roll.mock.calls.map(([, point]) => point.id)).toEqual(expect.arrayContaining(points.map((point) => point.id)));
  roll.mockRestore();
  expect(spawns.flatMap((spawn) => [...spawn.loot, ...(spawn.surfaceLoot ?? [])]).length).toBeGreaterThan(0);
  for (const spawn of spawns) {
    for (const [channel, entries] of [
      ['container', spawn.loot],
      ['surface', spawn.surfaceLoot ?? []],
    ] as const) {
      for (const entry of entries) {
        const point = points.find(
          (candidate) =>
            candidate.channel === channel &&
            candidate.destination.every((value, axis) => value === spawn.spec.pos[axis]),
        );
        expect(point).toBeDefined();
        expect(entry.count).toBeGreaterThan(0);
      }
    }
  }
};

describe('loot source routing', () => {
  it('keeps exact anchor tiers local and gives fixed-loot tiers precedence in rolls and admission', () => {
    const registry = fixtureRegistry();
    registry.items.set(stock, {
      ...registry.items.get(stock)!,
      economy: { usage: ['Hunting'], tiers: ['Tier2'] },
    });
    const template = compileTemplate(registry, {
      id: 'fixture_tiers',
      size: [3, 1, 1],
      lootContext: { usage: ['Hunting'], tier: 'Tier1', lowerTiers: true },
      palette: {
        A: { furniture: 'fixture_container', loot: 'fixture_source', lootTier: 'Tier2', items: [{ item: stock }] },
        B: { furniture: 'fixture_container', loot: 'fixture_source' },
        C: { furniture: 'fixture_container', loot: 'fixture_source', lootTier: 'Tier3' },
      },
      layers: [['ABC']],
    });
    const placement: Placement = { template, origin: [0, 0, 0], turn: 0 };
    const sources = lootSourcesOf(registry, 'fixture_site', placement);
    expect(sources.map(({ context }) => context.tier)).toEqual(['Tier2', 'Tier1', 'Tier3']);
    expect(sources[0]!.context.lowerTiers).toBeUndefined();
    expect(
      sources.map((source) => selection.economyEligible(registry.items.get(stock)!.economy, source.context)),
    ).toEqual([true, false, false]);
    const override = {
      at: [2, 0, 0] as [number, number, number],
      lootTier: 'Tier2' as const,
      items: [{ item: stock }],
    };
    const overridden = lootSourcesOf(registry, 'fixture_site', placement, [override]);
    expect(overridden[2]!.context).toEqual({ usage: ['Hunting'], tier: 'Tier2' });
    expect(selection.economyEligible(registry.items.get(stock)!.economy, overridden[2]!.context)).toBe(true);
    const input = { registry, context: template.lootContext };
    expect(placementLootIssues(input, template, [override], 'fixture')).toEqual([]);
    const { lootTier: _tier, ...withoutTier } = override;
    expect(placementLootIssues(input, template, [withoutTier], 'fixture').length).toBeGreaterThan(0);
    const refused = placementLootIssues(
      input,
      template,
      [{ ...override, at: [0, 0, 0], lootTier: 'Tier1' }],
      'fixture',
    );
    expect(refused.some(([path]) => path.includes('.pieces[0].items'))).toBe(true);
  });

  it('routes city and authored-layout sources through their enumerated points', () => {
    const registry = fixtureRegistry();
    const scale = makeScale(0.5);
    const city = new StressCity(17, registry, scale);
    expectRoutedColumn(city, city.placements);
    const authored = new AuthoredSite(17, registry, scale, {
      id: 'fixture_layout',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      bounds: { x0: -16, z0: -16, x1: 16, z1: 16 },
      ground: 0,
      terrain: [],
      buildings: [
        {
          template: 'fixture_template',
          position: [0, 0, 0],
          rotation: 0,
          fixedLoot: [{ at: [0, 0, 0], items: [{ item: stock }, { item: stock, placement: 'surface' }] }],
        },
      ],
      player: { position: [4, 0, 4], bearing: 0 },
      shamblers: [],
      woodlands: [],
      tracks: [],
    });
    expectRoutedColumn(authored, authored.placements);
  });

  it.each([false, true])('lands admitted death and severing drops (full source: %s)', (full) => {
    const registry = fixtureRegistry();
    const severed = 'fixture_severed_item';
    registry.items.set(severed, { ...registry.items.get(stock)!, id: severed });
    const bulk = 'fixture_bulk';
    registry.items.set(bulk, { ...registry.items.get(stock)!, id: bulk, size: [PILE_GRID.w, PILE_GRID.h] });
    const forbidden = 'fixture_forbidden';
    registry.items.set(forbidden, {
      ...registry.items.get(stock)!,
      id: forbidden,
      economy: { usage: ['Military'], tiers: ['Tier2'] },
    });
    const table = 'fixture_corpse_supply';
    registry.loot.set(table, {
      id: table,
      rolls: [1, 1],
      entries: [
        { item: stock, weight: 1 },
        { item: forbidden, weight: 100 },
      ],
    });
    const world = new World();
    const block = registry.blocks.findIndex((entry) => entry.solid);
    for (let x = 2; x <= 6; x++) {
      for (let z = -1; z <= 1; z++) {
        world.setBlock(x, 0, z, block);
      }
    }
    const solid = (x: number, y: number, z: number) => registry.blocks[world.getBlock(x, y, z)]!.solid;
    const session = createSession({
      registry,
      world,
      isSolid: solid,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 17,
      start: 0,
      spawn: [0, 0, 0],
      ready: () => false,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => undefined,
    });
    if (full) {
      for (const y of [1, 4]) {
        expect(session.inventory.add(session.inventory.create(bulk), { kind: 'pile', pos: [4, y, 0] })).toBe(true);
      }
    }
    const base = [...registry.zombies.values()][0]!;
    const id = session.zombies.add(
      {
        ...base,
        id: 'fixture_corpse',
        loot: table,
        dismember: { chance: 0, headOnKillChance: 0 },
        severedItems: { head: null, torso: null, leftArm: severed, rightArm: null, leftLeg: null, rightLeg: null },
      },
      [4, 4, 0],
    );
    session.zombies.detonate({
      blast: { damageKind: 'blunt', radiusMetres: 6, damage: 1_000_000, impulse: 1 },
      fragments: { damageKind: 'pierce', origin: [0, 4, 0], directions: [], damage: 0, impulse: 0, rangeMetres: 0 },
    });
    expect(session.zombieStore.get(id)).toBeUndefined();
    const items = [...session.inventory.items()].map(({ item }) => item);
    const dropped = items.filter((item) => item.type === stock);
    expect(dropped.length).toBeGreaterThan(0);
    expect(items.some((item) => item.type === forbidden)).toBe(false);
    expect(items.some((item) => item.type === severed)).toBe(true);
    const emissions = [...session.inventory.items()].filter(({ item }) => [stock, severed].includes(item.type));
    expect(
      emissions.every(
        ({ location }) =>
          location.kind === 'pile' && solid(location.pile.pos[0], location.pile.pos[1] - 1, location.pile.pos[2]),
      ),
    ).toBe(true);
  });
});
