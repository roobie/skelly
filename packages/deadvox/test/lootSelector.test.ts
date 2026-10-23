import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { chargeShare } from '../src/core/lights.ts';
import { corpseLootPoint, type LootSpawnPoint, rollLoot, selectLootType } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';
import { gamePerHour, simSeconds } from '../src/core/time.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const context = { usage: ['Medical'], tier: 'Tier2' } as const;
const itemDefinition = (id: string, usage: string[], tiers: string[]) => ({
  id,
  name: id,
  category: 'misc',
  size: [1, 1],
  weight: 1,
  stack: 10,
  economy: { usage, tiers },
});
const fixture = () => {
  const result = buildRegistry([
    playerInventorySource(),
    {
      source: 'selector-fixture',
      data: {
        furnitureMaterials: fixtureMaterials(),
        sounds: fixtureSounds(),
        items: [
          itemDefinition('stock', ['Medical'], ['Tier2']),
          itemDefinition('wrong_usage', ['Military'], ['Tier2']),
          itemDefinition('wrong_tier', ['Medical'], ['Tier1', 'Tier3']),
        ],
        furniture: [
          {
            id: 'unused',
            name: 'fixture',
            size: [1, 1, 1],
            color: '#123456',
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
      const { economy } = registry.items.get(entry.type)!;
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
