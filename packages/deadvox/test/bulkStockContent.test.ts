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
      // A stack leaves its stockpile one at a time.
      expect(inventory.move(item, { kind: 'hand', side: 'right' }, 1).ok).toBe(true);
      const held = inventory.carried().find(({ type }) => type === item.type)!;
      expect(inventory.consume(held, held.count)).toBe(true);
      if (inventory.itemByUid(item.uid)) {
        expect(inventory.consume(item, item.count)).toBe(true);
      }
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
    expect(def.container!.maxCount).toBe(look.fullCount);
    for (const type of def.container!.accepts!) {
      const inventory = new Inventory(registry);
      const piece = inventory.furnish({ type: def.id, pos: [0, 0, 0], size: [...def.size], facing: 'n' })!;
      inventory.entities.markSearched(piece);
      const held = () => piece.pockets!.flat().reduce((sum, { item }) => sum + item.count, 0);
      const put = (count: number) => {
        const item = inventory.create(type, count);
        const placed = def.container!.pockets.some((_, pocket) =>
          inventory.add(item, { kind: 'furniture', entity: piece, pocket }),
        );
        return { item, placed };
      };
      for (let remaining = look.fullCount; remaining > 0; ) {
        const count = Math.min(remaining, registry.items.get(type)!.stack ?? 1);
        expect(put(count).placed).toBe(true);
        remaining -= count;
      }
      expect(held()).toBe(look.fullCount);
      const before = JSON.stringify(piece.pockets);
      expect(put(1).placed).toBe(false);
      expect(JSON.stringify(piece.pockets)).toBe(before);
      const [first] = piece.pockets!.flat();
      expect(inventory.consume(first!.item, 1)).toBe(true);
      expect(held()).toBe(look.fullCount - 1);
      expect(put(1).placed).toBe(true);
      expect(held()).toBe(look.fullCount);
    }
  }
});

const stockpile = () => {
  const cells = (kind: string) => registry.items.get(kind)!.size.reduce((area, side) => area * side, 1);
  const def = [...registry.furniture.values()]
    .filter(({ container }) => container?.stockpile)
    .sort((a, b) => cells(a.container!.accepts![0]!) - cells(b.container!.accepts![0]!))[0]!;
  const type = def.container!.accepts![0]!;
  const inventory = new Inventory(registry);
  const piece = inventory.furnish({ type: def.id, pos: [0, 0, 0], size: [...def.size], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
  const records = () => piece.pockets!.flat().map(({ item }) => item);
  return { inventory, piece, target, type, records, def };
};

it('merges identical materials into one stack on entry to a stockpile and splits one off on exit', () => {
  const { inventory, target, type, records } = stockpile();
  const count = 5;
  for (let at = 0; at < count; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  expect(records()).toHaveLength(1);
  expect(records()[0]!.count).toBe(count);
  // A hand holds one, so taking the whole stack to it moves one single and leaves the rest.
  expect(inventory.move(records()[0]!, { kind: 'hand', side: 'right' }).ok).toBe(true);
  expect(records()[0]!.count).toBe(count - 1);
  expect(inventory.carried().find((item) => item.type === type)!.count).toBe(1);
});

it('moving N out of a stockpile places N single items and leaves the rest of the stack', () => {
  const { inventory, type, target, records } = stockpile();
  for (let at = 0; at < 5; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const [w, h] = registry.items.get(type)!.size;
  const roomy = ({ grid }: { grid: [number, number] }) =>
    Math.min(...grid) >= Math.min(w, h) && Math.max(...grid) >= Math.max(w, h) && grid[0] * grid[1] >= 6 * w * h;
  const holder = [...registry.items.values()].find(
    ({ container }) => container && !container.accepts && !container.stockpile && container.pockets.some(roomy),
  )!;
  const pack = inventory.create(holder.id);
  const pocket = holder.container!.pockets.findIndex(roomy);
  expect(inventory.add(pack, { kind: 'hand', side: 'left' })).toBe(true);
  const out = 3;
  expect(inventory.move(records()[0]!, { kind: 'pocket', owner: pack, pocket }, out).ok).toBe(true);
  const inPack = pack.pockets![pocket]!.map(({ item }) => item);
  expect(inPack).toHaveLength(out);
  expect(inPack.every((item) => item.type === type && item.count === 1)).toBe(true);
  expect(records()[0]!.count).toBe(5 - out);
});

it('a partly fitting move out of a stockpile leaves the remainder in the stack', () => {
  const { inventory, type, target, records } = stockpile();
  const total = 12;
  for (let at = 0; at < total; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const pile = { kind: 'pile' as const, pos: [4, 0, 4] as [number, number, number] };
  expect(inventory.move(records()[0]!, pile).ok).toBe(true);
  const dropped = inventory.pileAt(pile.pos)!.items;
  expect(dropped.length).toBeGreaterThan(0);
  expect(dropped.every(({ item }) => item.count === 1)).toBe(true);
  expect(records()[0]!.count).toBe(total - dropped.length);
  expect(records()[0]!.count).toBeGreaterThan(0);
});

it('does not stack carried materials, in a pocket, a pile or against another stack', () => {
  const { inventory, type, target, records } = stockpile();
  const pile = { kind: 'pile' as const, pos: [4, 0, 4] as [number, number, number] };
  expect(inventory.add(inventory.create(type), pile)).toBe(true);
  for (let at = 0; at < 3; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  expect(inventory.move(records()[0]!, pile, 1).ok).toBe(true);
  const dropped = inventory.pileAt(pile.pos)!.items;
  expect(dropped).toHaveLength(2);
  expect(dropped.every(({ item }) => item.count === 1)).toBe(true);
});

it('dragging a different plank onto a stockpile stack never carries an oversized stack or loses a plank', () => {
  const { inventory, type, target, records } = stockpile();
  for (let at = 0; at < 5; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const held = inventory.create(type, 1, 0.5);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  const { x, y, rotated } = (target.entity.pockets![0] as { x: number; y: number; rotated: boolean }[])[0]!;
  inventory.move(held, { ...target, at: { x, y, rotated } });
  const carriedLimit = registry.items.get(type)!.stack ?? 1;
  const carried = inventory.carried().filter((item) => item.type === type);
  expect(carried.every((item) => item.count <= carriedLimit)).toBe(true);
  const stocked = records().reduce((sum, item) => sum + item.count, 0);
  expect(stocked + carried.reduce((sum, item) => sum + item.count, 0)).toBe(6);
});

it('pulling N out of a stockpile costs N times the handling time of one item', () => {
  const { inventory, type, target, records } = stockpile();
  for (let at = 0; at < 4; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const pile = { kind: 'pile' as const, pos: [4, 0, 4] as [number, number, number] };
  const one = inventory.plan(records()[0]!, pile, 1);
  const many = inventory.plan(records()[0]!, pile, 3);
  expect(one.ok && many.ok).toBe(true);
  expect(one.ok && many.ok && many.time).toBeCloseTo((one.ok ? one.time : 0) * 3);
});

it('a take-all batch lands every planned move when a stack splits into singles ahead of another item', () => {
  const { inventory, type, target, records } = stockpile();
  for (let at = 0; at < 3; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const odd = inventory.create(type, 1, 0.5);
  expect(inventory.add(odd, target)).toBe(true);
  const stack = records().find((item) => item !== odd)!;
  const pile = { kind: 'pile' as const, pos: [4, 0, 4] as [number, number, number] };
  const batch = inventory.planBatch([stack, odd].map((item) => ({ item, targets: [pile] })));
  expect(batch.length).toBeGreaterThan(0);
  for (const { item, target: planned } of batch) {
    expect(inventory.move(item, planned).ok).toBe(true);
  }
  const dropped = inventory.pileAt(pile.pos)!.items;
  expect(dropped.every(({ item }) => item.count === 1)).toBe(true);
});

it('round-trips a stacked stockpile through a save as one record per stack', () => {
  const { inventory, piece, type, target, records } = stockpile();
  for (let at = 0; at < 6; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const restored = Inventory.restoreState(registry, JSON.parse(JSON.stringify(inventory.snapshotState())));
  const again = restored.entities
    .byUid(piece.uid)!
    .pockets!.flat()
    .map(({ item }) => item);
  expect(again).toHaveLength(records().length);
  expect(again.reduce((sum, { count }) => sum + count, 0)).toBe(6);
  expect(again).toHaveLength(1);
});

it('the sheet-metal stack accepts both sheet sizes but not scrap, and a sheet-metal fridge takes apart into sheet', () => {
  const stack = registry.furniture.get('sheet_metal_stack')!;
  const inventory = new Inventory(registry);
  const piece = inventory.furnish({ type: stack.id, pos: [0, 0, 0], size: [...stack.size], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
  expect(inventory.add(inventory.create('sheet_metal'), target)).toBe(true);
  expect(inventory.add(inventory.create('sheet_metal_small'), target)).toBe(true);
  expect(inventory.add(inventory.create('scrap_metal'), target)).toBe(false);
  const yields = registry.furniture.get('fridge')!.takeApart!.yield!.yields.map(({ item }) => item);
  expect(yields).toEqual(expect.arrayContaining(['sheet_metal', 'sheet_metal_small']));
  expect(yields).not.toContain('scrap_metal');
});

it('each sheet cut is reachable with a torch and with a metal saw, and a tool item provides each', () => {
  const sheets = ['sheet_metal', 'sheet_metal_small'];
  const tools = ['flame_cutting', 'metal_sawing'];
  const recipes = [...registry.recipes.values()];
  for (const sheet of sheets) {
    const cuts = recipes.filter(({ components }) =>
      components.flat().some((component) => 'item' in component && component.item === sheet),
    );
    expect(cuts.length).toBeGreaterThan(0);
    for (const quality of tools) {
      expect(cuts.some(({ qualities }) => (qualities[quality] ?? 0) > 0)).toBe(true);
    }
  }
  for (const quality of tools) {
    expect([...registry.items.values()].some((item) => (item.tool?.qualities[quality] ?? 0) > 0)).toBe(true);
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
