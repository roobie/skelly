import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { slotProps } from '@skelly/engine/internal/core/showroom.ts';
import { Unpacking } from '@skelly/engine/internal/game/unpacking.ts';
import { HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { selectBundledMods } from '@skelly/engine/packs';
import { makeScale, toChunk } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';

const mod = 'skelly.deadvox.scenario.test-house.bulk-stock-look';
const selected = withReusedBuilds(() => selectBundledMods(productModIntake, [mod]));
const { registry } = selected.content;
const layout = registry.layouts.get('testHouseBulkStock')!;
const totals = (items: readonly { type: string; count: number }[]) => {
  const counts = new Map<string, number>();
  for (const { type, count } of items) {
    counts.set(type, (counts.get(type) ?? 0) + count);
  }
  return counts;
};

it('delivers the look fixture stock as removable material in containers without take-apart routes', () => {
  expect(selected.issues).toEqual([]);
  const props = slotProps(registry, layout.showroom!);
  const stocks = props.filter(({ furniture }) => registry.furniture.get(furniture)!.stockAppearance);
  expect(stocks.length).toBeGreaterThan(0);
  const site = new AuthoredSite(1, registry, makeScale(0.5), layout);
  const inventory = new Inventory(registry);
  for (const prop of stocks) {
    const spawn = site
      .furnitureIn(toChunk(prop.pos[0]), toChunk(prop.pos[2]))
      .find(({ spec }) => spec.type === prop.furniture && spec.pos.join() === prop.pos.join())!;
    expect(spawn).toBeDefined();
    expect(spawn.loot.length).toBeGreaterThan(0);
    expect(spawn.fixedCount).toBeGreaterThan(0);
    const def = registry.furniture.get(prop.furniture)!;
    expect(def.takeApart).toBeUndefined();
    const piece = inventory.furnishSpawn(spawn)!;
    inventory.entities.markSearched(piece);
    const items = piece.pockets!.flat().map(({ item }) => item);
    expect(totals(items)).toEqual(totals(spawn.loot));
    for (const item of items) {
      expect(def.container!.accepts).toContain(item.type);
      expect(inventory.move(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
      expect(inventory.consume(item, item.count)).toBe(true);
    }
    expect(piece.pockets!.flat()).toEqual([]);
    expect(inventory.entities.byUid(piece.uid)).toBe(piece);
  }
});

it('every stock stack stays within one block of height and holds its full count of accepted material', () => {
  const stocks = [...registry.furniture.values()].filter((def) => def.stockAppearance);
  expect(stocks.length).toBeGreaterThan(0);
  for (const def of stocks) {
    const look = def.stockAppearance!;
    for (const { shape } of look.steps) {
      for (const box of shape) {
        expect(box.position[1] + box.size[1]).toBeLessThanOrEqual(def.size[1]);
      }
    }
    const inventory = new Inventory(registry);
    const piece = inventory.furnish({ type: def.id, pos: [0, 0, 0], size: [...def.size], facing: 'n' })!;
    inventory.entities.markSearched(piece);
    const type = def.container!.accepts![0]!;
    for (let remaining = look.fullCount; remaining > 0; ) {
      const count = Math.min(remaining, registry.items.get(type)!.stack ?? 1);
      const item = inventory.create(type, count);
      const placed = def.container!.pockets.some((_, pocket) =>
        inventory.add(item, { kind: 'furniture', entity: piece, pocket }),
      );
      expect(placed).toBe(true);
      remaining -= count;
    }
  }
});

it('opens the fixture nail box through ordinary unpacking into its authored nail payload', () => {
  const stock = layout
    .showroom!.slots.flatMap(({ items }) => items ?? [])
    .find(({ item }) => registry.items.get(item)?.unpack)!;
  expect(stock).toBeDefined();
  const def = registry.items.get(stock.item)!;
  const inventory = new Inventory(registry);
  const box = inventory.create(def.id);
  expect(box.pockets).toBeUndefined();
  expect(inventory.add(box, { kind: 'hand', side: 'right' })).toBe(true);
  const queue = new HandlingQueue(inventory);
  const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
  expect(unpacking.activate(box)).toBeUndefined();
  expect(queue.tick(def.unpack!.simSeconds).failed).toEqual([]);
  expect(inventory.itemByUid(box.uid)).toBeUndefined();
  expect(totals([...inventory.items()].map(({ item }) => item))).toEqual(
    new Map([[def.unpack!.item, def.unpack!.count]]),
  );
});
