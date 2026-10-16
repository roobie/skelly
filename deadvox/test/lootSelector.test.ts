import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { corpseLootPoint, type LootSpawnPoint, rollLoot, selectLootType } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';
import { gamePerHour, simSeconds } from '../src/core/time.ts';

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
    {
      source: 'selector-fixture',
      data: {
        items: [
          itemDefinition('stock', ['Medical'], ['Tier2']),
          itemDefinition('wrong_usage', ['Military'], ['Tier2']),
          itemDefinition('wrong_tier', ['Medical'], ['Tier1', 'Tier3']),
        ],
        furniture: [{ id: 'unused', name: 'fixture', size: [1, 1, 1], color: '#123456' }],
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

  it('records corpse identity separately from its current position', () => {
    const registry = fixture();
    const stock = registry.items.get('stock')!;
    registry.items.set(stock.id, { ...stock, economy: { usage: ['Infected'], tiers: ['Tier1'] } });
    const first = corpseLootPoint('supply', 31, [0, 0, 0]);
    const moved = corpseLootPoint('supply', 31, [3, 1, 0]);
    expect(moved.id).toBe(first.id);
    const rolled = rollLoot(registry, moved, Rng.stream(2, 'corpse'));
    expect(rolled).not.toHaveLength(0);
    expect(
      rolled.every(
        (entry) =>
          entry.origin.kind === 'economy' &&
          entry.origin.source === first.id &&
          entry.origin.channel === 'corpse' &&
          entry.origin.mode === 'random',
      ),
    ).toBe(true);
  });

  it('does not merge stacks whose source or fixed/random attribution differs', () => {
    const inventory = new Inventory(fixture());
    const origin = { kind: 'economy', source: 'first', channel: 'container', mode: 'fixed' } as const;
    const first = inventory.create('stock', 1, 1, origin);
    expect(inventory.add(first, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    for (const other of [{ ...origin, source: 'second' }, { ...origin, mode: 'random' } as const]) {
      const item = inventory.create('stock', 1, 1, other);
      expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
      expect(inventory.itemByUid(item.uid)).toBe(item);
    }
    expect([...inventory.items()]).toHaveLength(3);
    expect(Object.isFrozen(first.origin)).toBe(true);
  });

  it('retains source attribution through movement, split, same-origin merge and an inventory save round-trip', () => {
    const registry = fixture();
    const inventory = new Inventory(registry);
    const origin = { kind: 'economy', source: 'fixture-point', channel: 'surface', mode: 'fixed' } as const;
    inventory.furnish(
      { type: 'unused', pos: [0, 0, 0], size: [1, 1, 1], facing: 's' },
      [],
      [{ type: 'stock', count: 4, condition: 1, origin }],
    );
    const original = [...inventory.items()][0]!.item;
    expect(original.origin).toEqual(origin);
    expect(inventory.move(original, { kind: 'pile', pos: [1, 0, 0] }, 2).ok).toBe(true);
    const parts = [...inventory.items()].map(({ item: entry }) => entry);
    expect(parts).toHaveLength(2);
    expect(parts.every((entry) => JSON.stringify(entry.origin) === JSON.stringify(origin))).toBe(true);
    expect(inventory.move(parts.find((entry) => entry !== original)!, { kind: 'pile', pos: [0, 1, 0] }).ok).toBe(true);
    expect([...inventory.items()]).toHaveLength(1);
    const restored = Inventory.restoreState(registry, JSON.parse(JSON.stringify(inventory.snapshotState())));
    expect([...restored.items()].map(({ item: entry }) => entry.origin)).toEqual([origin]);
  });
});
