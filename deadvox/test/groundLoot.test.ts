import { describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { lootPointStream, lootPointsByColumn, rollLoot } from '../src/core/loot.ts';
import { groundLootSupplyIssues } from '../src/core/placementLoot.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { furnitureOf, lootSourcesOf, type Site } from '../src/core/site.ts';
import { templateGroundLootIssues, templateGroundLootReservations } from '../src/core/templateSpatial.ts';
import { compileTemplate, type Placement, stackTemplate } from '../src/core/templates.ts';
import { simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';

const base = baseRegistry();
const seed = 7;
const floor = { id: 'fixture_floor', name: 'Fixture floor', solid: true, color: '#808080' };
const fixtureData = (): ContentFile => ({
  blocks: [floor],
  inventory: [...base.inventory.values()],
  items: [
    {
      id: 'fixture_allowed',
      name: 'Allowed',
      category: 'misc',
      weight: 1,
      size: [1, 1],
      economy: { usage: ['Medical'], tiers: ['Tier1'] },
    },
    {
      id: 'fixture_wrong_usage',
      name: 'Wrong usage',
      category: 'misc',
      weight: 1,
      size: [1, 1],
      economy: { usage: ['Industrial'], tiers: ['Tier1'] },
    },
    {
      id: 'fixture_wrong_tier',
      name: 'Wrong tier',
      category: 'misc',
      weight: 1,
      size: [1, 1],
      economy: { usage: ['Medical'], tiers: ['Tier3'] },
    },
  ],
  loot: [
    {
      id: 'fixture_supply',
      rolls: [1, 1],
      entries: [
        { item: 'fixture_allowed', weight: 1 },
        { item: 'fixture_wrong_usage', weight: 100 },
        { item: 'fixture_wrong_tier', weight: 100 },
      ],
    },
  ],
  furniture: [
    {
      id: 'fixture_container',
      name: 'Fixture container',
      size: [1, 1, 1],
      color: '#808080',
      container: { pockets: [{ grid: [2, 2], handlingSimSeconds: simSeconds(0) }] },
    },
  ],
  templates: [
    {
      id: 'fixture_ground',
      lootContext: { usage: ['Medical'], tier: 'Tier1' },
      size: [8, 6, 8],
      palette: {
        '#': 'fixture_floor',
        '.': 'air',
        L: { groundLoot: { kind: 'table', table: 'fixture_supply' } },
        C: { furniture: 'fixture_container', loot: 'fixture_supply' },
      },
      layers: [
        new Array(8).fill('########'),
        ['........', '........', '..L.....', '........', '.....C..', '........', '........', '........'],
        ...Array.from({ length: 3 }, () => new Array(8).fill('........')),
        new Array(8).fill('########'),
      ],
    },
  ],
});

const fixture = (withFurniture = true, supply: 'table' | 'fixed' = 'table') => {
  const data = fixtureData();
  if (supply === 'fixed') {
    data.templates![0]!.palette.L = { groundLoot: { kind: 'fixed', items: [{ item: 'fixture_allowed' }] } };
  }
  if (!withFurniture) {
    data.templates![0]!.layers[1]![4] = '........';
  }
  const parsed = buildRegistry([{ source: 'ground-fixture', data }]);
  if (parsed.issues.length > 0) {
    throw new Error(JSON.stringify(parsed.issues));
  }
  const registry = {
    ...base,
    blocks: [...base.blocks, parsed.registry.blocks[parsed.registry.blockIds.get(floor.id)!]!],
    blockIds: new Map([...base.blockIds, [floor.id, base.blocks.length]]),
    items: new Map([...base.items, ...parsed.registry.items]),
    furniture: new Map([...base.furniture, ...parsed.registry.furniture]),
    loot: new Map([...base.loot, ...parsed.registry.loot]),
    templates: new Map([...base.templates, ...parsed.registry.templates]),
  };
  const placement: Placement = {
    template: compileTemplate(registry, registry.templates.get('fixture_ground')!),
    origin: [0, 0, 0],
    turn: 0,
  };
  const points = lootPointsByColumn(lootSourcesOf(registry, 'fixture_site', placement));
  const site: Site = {
    surface: { height: () => 0, top: () => registry.blockIds.get(floor.id) },
    spawn: { pos: [2.5, 1, 3.5], yaw: 0 },
    stamp: () => undefined,
    lootPointsIn: (cx, cz) => points.get(`${cx},${cz}`) ?? [],
    furnitureIn: (cx, cz) => furnitureOf({ registry, seed }, placement, [cx, cz], site.lootPointsIn(cx, cz)),
    zombiesIn: () => [],
  };
  const session = (restore?: Readonly<SaveSnapshot>) =>
    createSession({
      registry,
      seed,
      scale: makeScale(0.5),
      world: new World(),
      isSolid: (_x, y) => y < 1,
      isOpaque: () => false,
      start: 0,
      spawn: site.spawn.pos,
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
      ...(restore ? { restore } : {}),
    });
  return { registry, placement, site, session };
};

const version = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: {},
  contentPacks: [{ id: 'fixture', version: '1', canonicalHash: 'b'.repeat(64) }],
};

describe('ground loot', () => {
  it.each(['table', 'fixed'] as const)(
    '%s ground supply uses container admission without a furniture destination',
    (supply) => {
      const { registry, site, placement } = fixture(true, supply);
      const points = site.lootPointsIn(0, 0);
      const ground = points.find((point) => point.channel === 'ground')!;
      const container = points.find((point) => point.channel === 'container')!;
      expect(ground).toBeDefined();
      expect(container).toBeDefined();
      expect(site.furnitureIn(0, 0).some(({ spec }) => spec.pos.join(',') === ground.destination.join(','))).toBe(
        false,
      );
      for (const point of [ground, container]) {
        const rolled = rollLoot(registry, point, lootPointStream(seed, point));
        expect(rolled.length).toBeGreaterThan(0);
        expect(rolled.every((item) => item.type === 'fixture_allowed')).toBe(true);
      }
      if (supply === 'fixed') {
        const { template } = placement;
        expect(groundLootSupplyIssues(registry, template)).toEqual([]);
        for (const item of ['fixture_wrong_usage', 'fixture_wrong_tier']) {
          expect(registry.items.has(item)).toBe(true);
          const rejected = groundLootSupplyIssues(registry, {
            ...template,
            groundLoot: [{ ...template.groundLoot![0]!, supply: { kind: 'fixed', items: [{ item }] } }],
          });
          expect(rejected.map(([path]) => path)).toEqual(['.groundLoot[0].supply.items[0].item']);
        }
      }
    },
  );

  it('keeps a looted furniture-free column empty across revisits and a save round-trip', async () => {
    const { registry, site, session } = fixture(false);
    const runtime = session();
    runtime.onColumn(0, 0, site);
    const pile = [...runtime.inventory.piles.values()][0]!;
    expect(pile).toBeDefined();
    const { item } = pile.items[0]!;
    expect(runtime.inventory.move(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(runtime.inventory.piles.has(pile.pos.join(','))).toBe(false);
    runtime.onColumnUnload(0, 0);
    runtime.onColumn(0, 0, site);
    expect(runtime.inventory.piles.has(pile.pos.join(','))).toBe(false);
    expect(runtime.inventory.hands.right?.uid).toBe(item.uid);
    const snapshot = runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.rolledColumns).toContain('0,0');
    const encoded = await encodeSave(snapshot, {
      generation: 1,
      version,
      worldOptions: { blockSize: 0.5, site: 'forest', storeys: 1, density: null },
    });
    const decoded = await decodeSave(encoded, {
      version,
      contentLookup: (kind, id) => contentLookup(registry, kind, id),
    });
    expect(decoded.snapshot.world.rolledColumns).toEqual(snapshot.world.rolledColumns);
    const restored = session(decoded.snapshot);
    restored.onColumn(0, 0, site);
    expect(restored.inventory.piles.has(pile.pos.join(','))).toBe(false);
    expect(restored.inventory.hands.right?.uid).toBe(item.uid);
  });

  it('marks empty columns and skips both furniture and loot enumeration on return', () => {
    const { site, session } = fixture(false);
    const runtime = session();
    const furnishing = vi.spyOn(site, 'furnitureIn');
    const points = vi.spyOn(site, 'lootPointsIn');
    runtime.onColumn(1, 0, site);
    expect(furnishing).toHaveBeenCalledWith(1, 0);
    expect(points).toHaveBeenCalledWith(1, 0);
    const snapshot = runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.rolledColumns).toContain('1,0');
    furnishing.mockClear();
    points.mockClear();
    runtime.onColumnUnload(1, 0);
    runtime.onColumn(1, 0, site);
    expect(furnishing).not.toHaveBeenCalled();
    expect(points).not.toHaveBeenCalled();
    runtime.onColumn(0, 0, site);
    expect([...runtime.inventory.piles.values()].some((pile) => pile.items.length > 0)).toBe(true);
  });

  it('carries ground sources through rotation and stacked floors without aliasing', () => {
    const { registry, placement } = fixture(false);
    const stacked = stackTemplate(placement.template, 2);
    const first: Placement = { ...placement, template: stacked, origin: [32, 10, -32], turn: 1 };
    const points = [...lootPointsByColumn(lootSourcesOf(registry, 'fixture_site', first)).values()].flat();
    expect(points.length).toBeGreaterThan(0);
    expect(new Set(points.map((point) => point.id)).size).toBe(points.length);
    expect(
      points.every((point) => point.channel === 'ground' && point.destination[0] >= 32 && point.destination[2] < 0),
    ).toBe(true);
    expect(points.some((point) => point.destination[1] > first.origin[1] + placement.template.size[1] - 1)).toBe(true);
    const local = placement.template.groundLoot![0]!.pos;
    expect(points.every((point) => point.destination[0] - first.origin[0] === stacked.size[2] - 1 - local[2])).toBe(
      true,
    );
    expect(points.every((point) => point.destination[2] - first.origin[2] === local[0])).toBe(true);
    expect(templateGroundLootIssues(registry, stacked)).toEqual([]);
  });

  it('rejects an anchor inside a wall through content validation', () => {
    const data = fixtureData();
    expect(buildRegistry([{ source: 'wall-fixture', data }]).issues).toEqual([]);
    data.templates![0]!.layers[2]![2] = '..#.....';
    const { issues } = buildRegistry([{ source: 'wall-fixture', data }]);
    expect(issues.map(({ path }) => path)).toEqual(['templates[0].groundLoot[0]']);
  });

  it('keeps anchors out of reserved circulation and route poses', () => {
    const { registry, placement } = fixture(false);
    expect(templateGroundLootIssues(registry, placement.template)).toEqual([]);
    const reserved = new Uint8Array(placement.template.blocks.length);
    const point = placement.template.groundLoot![0]!;
    const [x, y, z] = point.pos;
    const [sx, , sz] = placement.template.size;
    reserved[x + sx * (z + sz * y)] = 1;
    const issues = templateGroundLootIssues(registry, { ...placement.template, reserved });
    expect(issues.map(([path]) => path)).toEqual(['.groundLoot[0]']);
    expect(templateGroundLootReservations(placement.template, [[x + 0.5, y, z + 0.5]]).length).toBeGreaterThan(0);
  });
});
