import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { Inventory, type Target } from '../src/core/inventory.ts';
import { findSpot, footprint, type Item, ItemFactory } from '../src/core/items.ts';
import { baseRegistry } from './baseRegistry.ts';

const base = baseRegistry();
const fixture = (size: [number, number], threshold = 1) => {
  const registry: Registry = {
    ...base,
    items: new Map([
      ...base.items,
      [
        'placement_fixture',
        {
          id: 'placement_fixture',
          name: 'fixture',
          size,
          weight: 1,
          economy: { usage: [], tiers: [] },
          workInProgress: false,
          notLoot: true,
          category: 'misc',
        },
      ],
    ]),
    inventory: new Map([
      ...base.inventory,
      ['player', { ...base.inventory.get('player')!, autoPlacementTallMinFreeAreaGainCells: threshold }],
    ]),
  };
  const item = new ItemFactory().create(registry, 'placement_fixture');
  return { registry, item };
};
const shape = (registry: Registry, item: Item, spot: ReturnType<typeof findSpot>) => {
  if (!spot) {
    throw new Error('Fixture item did not fit');
  }
  return footprint(registry.items.get(item.type)!, spot.rotated);
};

describe('automatic grid orientation', () => {
  it('prefers wide independently of authored orientation, including a packing gain below the threshold', () => {
    for (const size of [
      [2, 3],
      [3, 2],
    ] as [number, number][]) {
      const { registry, item } = fixture(size, 3);
      const [w, h] = shape(registry, item, findSpot(registry, { size: { w: 5, h: 4 }, placed: [] }, item));
      expect(w).toBeGreaterThan(h);
    }
  });

  it('chooses tall only when its remaining usable rectangle gains more than the content threshold', () => {
    const { registry, item } = fixture([3, 2]);
    const grid = { size: { w: 5, h: 4 }, placed: [] };
    const [w, h] = shape(registry, item, findSpot(registry, grid, item));
    expect(h).toBeGreaterThan(w);
    const atThreshold = fixture([3, 2], 2);
    const [wideW, wideH] = shape(
      atThreshold.registry,
      atThreshold.item,
      findSpot(atThreshold.registry, grid, atThreshold.item),
    );
    expect(wideW).toBeGreaterThan(wideH);
  });

  it('uses the same wide preference when a held item is moved to a pile, but honors hand placement', () => {
    const { registry } = fixture([2, 3], 100);
    const inventory = new Inventory(registry);
    const item = inventory.create('placement_fixture');
    expect(inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
    const target: Extract<Target, { kind: 'pile' }> = { kind: 'pile', pos: [0, 0, 0] };
    const moved = inventory.move(item, target);
    expect(moved.ok).toBe(true);
    const spot = moved.ok ? moved.at : undefined;
    const [w, h] = shape(registry, item, spot);
    expect(w).toBeGreaterThan(h);
    const manual = inventory.move(item, { ...target, at: { x: 0, y: 0, rotated: false } });
    expect(manual.ok).toBe(true);
    const [manualW, manualH] = shape(registry, item, manual.ok ? manual.at : undefined);
    expect(manualH).toBeGreaterThan(manualW);
  });
});
