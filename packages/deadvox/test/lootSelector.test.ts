import { buildRegistry } from '@skelly/engine/content';
import { corpseLootPoint, type LootSpawnPoint, rollLoot, selectLootType } from '@skelly/engine/internal/core/loot.ts';
import { magazineSpec } from '@skelly/engine/internal/core/magazine.ts';
import { gamePerHour, simSeconds } from '@skelly/engine/internal/core/time.ts';
import { chargeShare, Inventory } from '@skelly/engine/inventory';
import { Rng } from '@skelly/engine/math';
import { describe, expect, it } from 'vitest';
import { baseContentSources } from './baseContentFiles.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const context = { usage: ['Medical'], tier: 'Tier2' } as const;
const itemDefinition = (id: string) => ({
  id,
  name: id,
  category: 'misc',
  size: [1, 1],
  weight: 1,
  stack: 10,
  workInProgress: false,
});
const scarcity = (id: string, usage: string[], tiers: string[]) => ({ id, usage, tiers, notLoot: false });
const fixture = () => {
  const result = buildRegistry([
    playerInventorySource(),
    {
      source: 'selector-fixture',
      data: {
        furnitureMaterials: fixtureMaterials(),
        sounds: fixtureSounds(),
        items: [itemDefinition('stock'), itemDefinition('wrong_usage'), itemDefinition('wrong_tier')],
        itemEconomy: [
          scarcity('stock', ['Medical'], ['Tier2']),
          scarcity('wrong_usage', ['Military'], ['Tier2']),
          scarcity('wrong_tier', ['Medical'], ['Tier1', 'Tier3']),
        ],
        furniture: [
          {
            id: 'unused',
            name: 'fixture',
            size: [1, 1, 1],
            color: '#123456',
            massKg: 1,
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
          },
        ],
        loot: [
          {
            id: 'supply',
            rolls: [1, 1],
            entries: [
              { item: 'stock', weight: 1 },
              { item: 'wrong_usage', weight: 100 },
              { item: 'wrong_tier', weight: 100 },
            ],
          },
        ],
      },
    },
  ]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};
const point = (id = 'fixture-point'): LootSpawnPoint => ({
  id,
  channel: 'surface',
  position: [0, 0, 0],
  destination: [0, 0, 0],
  context: { usage: [...context.usage], tier: context.tier },
  supply: { kind: 'table', table: 'supply' },
  required: false,
});

describe('central loot selection', () => {
  it('filters usage and exact tier before choosing, rather than dropping an inadmissible winner', () => {
    const registry = fixture();
    const source = point();
    const rolled = rollLoot(registry, source, Rng.stream(19, 'selection'));
    expect(rolled).not.toHaveLength(0);
    for (const entry of rolled) {
      const economy = registry.itemEconomy.get(entry.type)!;
      expect(economy.usage.some((usage) => source.context.usage.includes(usage))).toBe(true);
      expect(economy.tiers).toContain(source.context.tier);
    }
  });

  it('keeps nested-table multiplicity, stack bounds and deterministic streams', () => {
    const registry = fixture();
    const count = 21;
    const rolls = 2;
    registry.loot.set('child', {
      id: 'child',
      rolls: [rolls, rolls],
      entries: [{ item: 'stock', weight: 1, count: [count, count], condition: [0.3, 0.7] }],
    });
    registry.loot.set('supply', { id: 'supply', rolls: [1, 1], entries: [{ table: 'child', weight: 1 }] });
    const source = point();
    const rolled = rollLoot(registry, source, Rng.stream(7, 'nested'));
    expect(rolled.reduce((sum, entry) => sum + entry.count, 0)).toBe(count * rolls);
    expect(
      rolled.every(
        (entry) =>
          entry.count <= registry.items.get(entry.type)!.stack! && entry.condition >= 0.3 && entry.condition <= 0.7,
      ),
    ).toBe(true);
    expect(rollLoot(registry, source, Rng.stream(7, 'nested'))).toEqual(rolled);
  });

  it('terminates an empty pool and preserves an explicit nothing choice', () => {
    const registry = fixture();
    const rng = Rng.stream(4, 'empty');
    expect(selectLootType(registry, point(), [{ type: 'wrong_usage', weight: 1 }], rng)).toBeUndefined();
    rng.next = () => 0.99;
    expect(selectLootType(registry, point(), [{ type: 'stock', weight: 1 }, { weight: 1 }], rng)).toBeUndefined();
  });

  it('rejects required fixed supply and automatically fitted descendants that do not clear the point', () => {
    const registry = fixture();
    const source = { ...point(), required: true, supply: { kind: 'fixed', items: [{ item: 'wrong_usage' }] } } as const;
    expect(() => rollLoot(registry, source, Rng.stream(5, 'fixed'))).toThrow('required loot');
    const host = registry.items.get('stock')!;
    registry.items.set(host.id, {
      ...host,
      light: {
        intensity: 1,
        radius: 1,
        seenFrom: 1,
        color: '#ffffff',
        power: { battery: 'wrong_usage', chargePerGameHour: gamePerHour(1), swapSimSeconds: simSeconds(1) },
      },
    });
    expect(selectLootType(registry, point(), [{ type: host.id, weight: 1 }], Rng.stream(5, 'child'))).toBeUndefined();
  });

  it('keeps a corpse point identity when the corpse moves', () => {
    expect(corpseLootPoint('supply', 31, [3, 1, 0]).id).toBe(corpseLootPoint('supply', 31, [0, 0, 0]).id);
  });

  it('stacks otherwise-identical items rolled from different loot points', () => {
    const registry = fixture();
    const inventory = new Inventory(registry);
    const fixedStock = (id: string): LootSpawnPoint => ({
      ...point(id),
      supply: { kind: 'fixed', items: [{ item: 'stock', count: 1 }] },
    });
    for (const id of ['first-point', 'second-point']) {
      for (const rolled of rollLoot(registry, fixedStock(id), Rng.stream(1, id))) {
        expect(inventory.add(inventory.createRolled(rolled), { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
      }
    }
    const stacks = [...inventory.items()].map(({ item }) => item);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.count).toBe(2);
  });

  it('spawns authored fixed batteries at their authored share of full charge', () => {
    const registry = fixture();
    const host = registry.items.get('stock')!;
    registry.items.set(host.id, { ...host, battery: { capacity: 2 } });
    const inventory = new Inventory(registry);
    const source: LootSpawnPoint = {
      ...point(),
      supply: { kind: 'fixed', items: [{ item: 'stock', charge: 0.25 }] },
    };
    const [rolled] = rollLoot(registry, source, Rng.stream(1, 'charge'));
    expect(chargeShare(registry, inventory.createRolled(rolled!))).toBe(0.25);
  });
});

describe('magazines dropped as loot', () => {
  const stackSources = baseContentSources().filter(
    ({ source }) => !source.startsWith('layouts') && source !== 'starts.json',
  );
  const stack = buildRegistry(stackSources);
  const placeEverywhere = {
    usage: ['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military'],
    tier: 'Tier4',
    lowerTiers: true,
  } as const;
  const magazineTypes = [...stack.registry.items.keys()].filter((type) => magazineSpec(stack.registry, type));
  const cartridgeTypes = [...stack.registry.items.values()]
    .filter(({ ammo }) => ammo !== undefined)
    .map(({ id }) => id);
  const allCartridges = cartridgeTypes.map((item) => ({ item, weight: 1 }));

  type Odds = { item: string; weight: number }[];
  /** The stack's registry with one table dropping the given magazines, and a magazine-load policy of the given spread. */
  const dropping = (types: readonly string[], odds: Odds | undefined, spread: [number, number] | undefined) => {
    const registry = {
      ...stack.registry,
      loot: new Map(stack.registry.loot),
      lootPolicy: new Map(
        spread === undefined ? [] : [['p', { id: 'p', capability: 'magazines', magazineLoad: spread }]],
      ),
    } as typeof stack.registry;
    registry.loot.set('drop', {
      id: 'drop',
      rolls: [1, 1],
      entries: types.map((item) => ({ item, weight: 1 })),
      ...(odds === undefined ? {} : { cartridgeOdds: odds }),
    });
    return registry;
  };
  const dropPoint = (id: string): LootSpawnPoint => ({
    ...point(id),
    context: { usage: [...placeEverywhere.usage], tier: placeEverywhere.tier, lowerTiers: true },
    supply: { kind: 'table', table: 'drop' },
  });
  const magazinesRolled = (registry: typeof stack.registry, type: string, seeds: number) =>
    Array.from({ length: seeds }, (_, seed) => rollLoot(registry, dropPoint(`p${seed}`), Rng.stream(seed, 'magazine')))
      .flat()
      .filter((rolled) => rolled.type === type);

  it('fills every dropped magazine with 0 to capacity cartridges of one type fitting its calibre', () => {
    const registry = dropping(magazineTypes, allCartridges, [0, 1]);
    let seen = 0;
    for (const type of magazineTypes) {
      const { calibre, capacity } = magazineSpec(registry, type)!;
      for (const { cartridges = [] } of magazinesRolled(registry, type, 6)) {
        seen += cartridges.length;
        expect(cartridges.length).toBeLessThanOrEqual(capacity);
        expect(new Set(cartridges).size).toBeLessThanOrEqual(1);
        expect(cartridges.every((round) => registry.items.get(round)?.ammo?.calibre === calibre)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('takes the cartridge type from the dropping table list and reproduces for a fixed seed', () => {
    const [magazine] = magazineTypes;
    const { calibre } = magazineSpec(stack.registry, magazine!)!;
    const fitting = cartridgeTypes.filter((type) => stack.registry.items.get(type)?.ammo?.calibre === calibre);
    expect(fitting.length).toBeGreaterThan(0);
    const registry = dropping([magazine!], [{ item: fitting[0]!, weight: 1 }], [1, 1]);
    const rolled = magazinesRolled(registry, magazine!, 1);
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.cartridges!.length).toBeGreaterThan(0);
    expect(new Set(rolled[0]!.cartridges)).toEqual(new Set([fitting[0]]));
    expect(magazinesRolled(registry, magazine!, 1)).toEqual(rolled);
  });

  it('fills a magazine to capacity when the policy spread is forced to full', () => {
    const [magazine] = magazineTypes;
    const registry = dropping([magazine!], allCartridges, [1, 1]);
    const [rolled] = magazinesRolled(registry, magazine!, 1);
    expect(rolled!.cartridges).toHaveLength(magazineSpec(registry, magazine!)!.capacity);
  });

  it('drops an empty magazine when the table has no cartridge list, or none of its types fits', () => {
    const [magazine] = magazineTypes;
    const { calibre } = magazineSpec(stack.registry, magazine!)!;
    const other = cartridgeTypes.find((type) => stack.registry.items.get(type)?.ammo?.calibre !== calibre)!;
    const full = magazinesRolled(dropping([magazine!], allCartridges, [1, 1]), magazine!, 1);
    expect(full[0]!.cartridges!.length).toBeGreaterThan(0);
    for (const odds of [undefined, [{ item: other, weight: 1 }]]) {
      const [rolled] = magazinesRolled(dropping([magazine!], odds, [1, 1]), magazine!, 1);
      expect(rolled!.cartridges ?? []).toEqual([]);
    }
  });

  it('drops an empty magazine when the product has no loot policy row', () => {
    const [magazine] = magazineTypes;
    expect(
      magazinesRolled(dropping([magazine!], allCartridges, [1, 1]), magazine!, 1)[0]!.cartridges!.length,
    ).toBeGreaterThan(0);
    const [rolled] = magazinesRolled(dropping([magazine!], allCartridges, undefined), magazine!, 1);
    expect(rolled!.cartridges ?? []).toEqual([]);
  });

  it('never lets a magazine load shift what the table rolls after it', () => {
    const [magazine] = magazineTypes;
    const [first, second] = [...stack.registry.itemEconomy.values()].filter(
      ({ id, usage, tiers }) => id !== magazine && usage.includes('Residential') && tiers.length > 0,
    );
    const rollsAround = (odds: Odds | undefined, spread: [number, number] | undefined) => {
      const registry = dropping([], odds, spread);
      registry.loot.set('drop', {
        id: 'drop',
        rolls: [6, 6],
        entries: [
          { item: magazine!, weight: 1 },
          { item: first!.id, weight: 1, count: [1, 9], condition: [0, 1] },
          { item: second!.id, weight: 1, count: [1, 9], condition: [0, 1] },
        ],
        ...(odds === undefined ? {} : { cartridgeOdds: odds }),
      });
      return rollLoot(registry, dropPoint('shift'), Rng.stream(3, 'shift')).filter(({ type }) => type !== magazine);
    };
    const loadless = rollsAround(undefined, undefined);
    expect(loadless.length).toBeGreaterThan(0);
    expect(rollsAround(allCartridges, [0, 1])).toEqual(loadless);
  });

  it('carries a rolled magazine load onto the item it creates', () => {
    const [magazine] = magazineTypes;
    const registry = dropping([magazine!], allCartridges, [1, 1]);
    const [rolled] = magazinesRolled(registry, magazine!, 1);
    expect(new Inventory(registry).createRolled(rolled!).cartridges).toEqual(rolled!.cartridges);
  });
});
