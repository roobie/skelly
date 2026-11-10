import { describe, expect, it } from 'vitest';
import { lootPointStream, lootPointsByColumn, rollLoot } from '../../engine/src/core/loot.ts';
import { groundLootSupplyIssues } from '../../engine/src/core/placementLoot.ts';
import type { ContentFile } from '../../engine/src/core/schema.ts';
import { furnitureOf, lootSourcesOf, type Site, SupplyFootprints } from '../../engine/src/core/site.ts';
import { templateGroundLootIssues, templateGroundLootReservations } from '../../engine/src/core/templateSpatial.ts';
import { compileTemplate, placedPieces, stackTemplate } from '../../engine/src/core/templates.ts';
import { simSeconds } from '../../engine/src/core/time.ts';
import { buildRegistry } from '../../engine/src/content.ts';
import type { SaveSnapshot } from '../../engine/src/save.ts';
import { makeScale, type Placement, World } from '../../engine/src/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
import { fixtureDamageContent } from './fixtures/damageKinds.ts';

const base = baseRegistry();
const seed = 7;
const PIECES_PATH = /^.*\.pieces/;
const floor = {
  id: 'fixture_floor',
  material: FIXTURE_MATERIAL,
  name: 'Fixture floor',
  solid: true,
  color: '#808080',
  drops: { default: 'fixture_blow' },
};
const fixtureData = (): ContentFile => ({
  damageKinds: fixtureDamageContent().damageKinds,
  furnitureMaterials: fixtureMaterials(),
  sounds: fixtureSounds(),
  blocks: [floor],
  blockMaterials: [fixtureBlockMaterial(floor.id)],
  inventory: [...base.inventory.values()],
  items: [
    {
      id: 'fixture_allowed',
      name: 'Allowed',
      category: 'misc',
      weight: 1,
      size: [1, 1],
      workInProgress: false,
    },
    {
      id: 'fixture_wrong_usage',
      name: 'Wrong usage',
      category: 'misc',
      weight: 1,
      size: [1, 1],
      workInProgress: false,
    },
    {
      id: 'fixture_wrong_tier',
      name: 'Wrong tier',
      category: 'misc',
      weight: 1,
      size: [1, 1],
      workInProgress: false,
    },
  ],
  itemEconomy: [
    { id: 'fixture_allowed', usage: ['Medical'], tiers: ['Tier1'], notLoot: false },
    { id: 'fixture_wrong_usage', usage: ['Industrial'], tiers: ['Tier1'], notLoot: false },
    { id: 'fixture_wrong_tier', usage: ['Medical'], tiers: ['Tier3'], notLoot: false },
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
      massKg: 1,
      container: { pockets: [{ grid: [2, 2], handlingSimSeconds: simSeconds(0) }] },
      breach: fixtureBreach(),
      material: FIXTURE_MATERIAL,
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
    blockMaterials: new Map([...base.blockMaterials, ...parsed.registry.blockMaterials]),
    items: new Map([...base.items, ...parsed.registry.items]),
    itemEconomy: new Map([...base.itemEconomy, ...parsed.registry.itemEconomy]),
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
    supplySourcesIn: (area) => new SupplyFootprints(placedPieces(placement), [...points.values()].flat()).in(area),
    lootPointsIn: (cx, cz) => points.get(`${cx},${cz}`) ?? [],
    furnitureIn: (cx, cz) => furnitureOf({ registry, seed }, placement, [cx, cz], site.lootPointsIn(cx, cz)),
    actorsIn: () => [],
  };
  const session = (restore?: Readonly<SaveSnapshot>) =>
    createSession({
      registry,
      actorFigureFiles: stackActorFigureFiles(registry),
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

  it('wears the furniture a column spawn carries a wear share for, and leaves an unworn spawn intact', () => {
    const { registry, site, session } = fixture();
    const spawns = site.furnitureIn(0, 0);
    expect(spawns.length).toBeGreaterThan(0);
    const worn = { ...spawns[0]!, wear: 0.5 };
    const runtime = session();
    runtime.onColumn(0, 0, { ...site, furnitureIn: () => [worn] });
    const [piece] = [...runtime.inventory.entities.records];
    expect(piece).toBeDefined();
    expect(piece!.damage).toBeGreaterThan(0);
    expect(piece!.damage).toBeLessThan(registry.furniture.get(piece!.type)!.breach.durability);

    const intact = session();
    intact.onColumn(0, 0, { ...site, furnitureIn: () => [spawns[0]!] });
    expect([...intact.inventory.entities.records][0]!.damage).toBeUndefined();
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

  it('turns palette furniture stock into a required source and rejects stock it cannot hold or admit', () => {
    const stocked = (item: string, furniture = 'fixture_container') => {
      const data = fixtureData();
      data.furniture!.push({
        id: 'fixture_board',
        name: 'Fixture board',
        size: [1, 1, 1],
        color: '#808080',
        massKg: 1,
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      });
      data.templates![0]!.palette.C = { furniture, items: [{ item }] };
      return data;
    };
    const parsed = buildRegistry([{ source: 'stock-fixture', data: stocked('fixture_allowed') }]);
    expect(parsed.issues).toEqual([]);
    const placement: Placement = {
      template: compileTemplate(parsed.registry, parsed.registry.templates.get('fixture_ground')!),
      origin: [0, 0, 0],
      turn: 0,
    };
    const stock = lootSourcesOf(parsed.registry, 'fixture_site', placement).filter(
      (source) => source.supply.kind === 'fixed',
    );
    expect(stock.map(({ channel, required, supply }) => [channel, required, supply])).toEqual([
      ['container', true, expect.objectContaining({ items: [{ item: 'fixture_allowed' }] })],
    ]);
    const paths = (data: ContentFile) =>
      buildRegistry([{ source: 'stock-fixture', data }]).issues.map(({ path }) => path.replace(PIECES_PATH, ''));
    expect(paths(stocked('fixture_wrong_usage'))).toEqual(['[0].items[0].item']);
    expect(paths(stocked('fixture_allowed', 'fixture_board'))).toEqual(['[0].items']);
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
