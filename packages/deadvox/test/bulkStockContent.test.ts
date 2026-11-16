import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { slotProps } from '@skelly/engine/internal/core/showroom.ts';
import { Unpacking } from '@skelly/engine/internal/game/unpacking.ts';
import { HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { selectBundledMods } from '@skelly/engine/packs';
import { makeScale, toChunk } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { baseRegistry, overlayContent } from './baseRegistry.ts';
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
      expect(piece.pockets).toHaveLength(1);
      const held = () => piece.pockets![0]!.reduce((sum, { item }) => sum + item.count, 0);
      const put = (count: number) => {
        const item = inventory.create(type, count);
        const placed = inventory.add(item, { kind: 'furniture', entity: piece, pocket: 0 });
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

it('a full mixed stockpile holds every accepted material as stacks in its single pile pocket and saves without cells', () => {
  const base = baseRegistry();
  const { stockAppearance: _look, ...board } = base.furniture.get('board_stack')!;
  const materials = ['fixture_long', 'fixture_short'].map((id) => ({
    ...base.items.get('wooden_plank')!,
    id,
    stockpileStack: 20,
  }));
  const rack = {
    ...board,
    id: 'fixture_mixed_pile',
    container: {
      stockpile: true,
      accepts: materials.map(({ id }) => id),
      maxCount: 8,
      pockets: [{ layout: 'pile', handlingSimSeconds: 1.2 }],
    },
  };
  const fixture = overlayContent(base, [{ source: 'mixed-pile', data: { items: materials, furniture: [rack] } }]);
  const inventory = new Inventory(fixture);
  const piece = inventory.furnish({ type: rack.id, pos: [0, 0, 0], size: [...rack.size], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
  const added = Array.from({ length: rack.container.maxCount }, (_, i) => materials[i % materials.length]!.id);
  for (const type of added) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  expect(piece.pockets).toHaveLength(1);
  expect(piece.pockets![0]).toHaveLength(materials.length);
  expect(totals(piece.pockets![0]!.map(({ item }) => item))).toEqual(totals(added.map((type) => ({ type, count: 1 }))));
  expect(inventory.add(inventory.create(materials[0]!.id), target)).toBe(false);
  const saved = JSON.parse(JSON.stringify(inventory.snapshotState()));
  const [entries] = saved.entities.entities.find((entity: { uid: number }) => entity.uid === piece.uid).pockets;
  expect(entries.every((entry: object) => Object.keys(entry).join() === 'item')).toBe(true);
  const restored = Inventory.restoreState(fixture, saved);
  expect(restored.entities.byUid(piece.uid)!.pockets).toEqual(piece.pockets);
});

it.each([
  { maxCount: 6 },
  { maxMassGrams: 12 },
  { maxVolumeCm3: 18 },
  { maxCount: 9, maxMassGrams: 12, maxVolumeCm3: 30 },
])('pile admission enforces every content limit on add, partial move, batches and restore: %j', (limits) => {
  const base = baseRegistry();
  const { stockAppearance: _look, ...board } = base.furniture.get('board_stack')!;
  const material = {
    ...base.items.get('wooden_plank')!,
    id: 'fixture_capacity',
    model: undefined,
    stack: 10,
    stockpileStack: 20,
    weight: 2,
    volumeCm3: 3,
  };
  const rack = {
    ...board,
    id: 'fixture_limited_pile',
    container: {
      stockpile: true,
      accepts: [material.id],
      ...limits,
      pockets: [{ layout: 'pile', handlingSimSeconds: 1 }],
    },
  };
  const fixture = overlayContent(base, [{ source: 'pile-capacity', data: { items: [material], furniture: [rack] } }]);
  const inventory = new Inventory(fixture);
  const piece = inventory.furnish({ type: rack.id, pos: [0, 0, 0], size: [...rack.size], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
  expect(inventory.add(inventory.create(material.id, 4), target)).toBe(true);
  const held = inventory.create(material.id, 4);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.move(held, target).ok).toBe(true);
  expect(held.count).toBe(2);
  expect(inventory.add(inventory.create(material.id), target)).toBe(false);
  const state = JSON.parse(JSON.stringify(inventory.snapshotState()));
  const [[entry]] = state.entities.entities.find((entity: { uid: number }) => entity.uid === piece.uid).pockets;
  entry.item.count += 1;
  expect(() => Inventory.restoreState(fixture, state)).toThrow('more than it admits');
  const stocked = piece.pockets![0]![0]!.item;
  expect(inventory.consume(stocked, stocked.count)).toBe(true);
  const other = inventory.create(material.id, 4, 0.5);
  expect(inventory.add(other, { kind: 'hand', side: 'left' })).toBe(true);
  const overflow = inventory.create(material.id);
  expect(inventory.add(overflow, { kind: 'pile', pos: [1, 0, 0] })).toBe(true);
  const batch = inventory.planBatch([other, held, overflow].map((item) => ({ item, targets: [target] })));
  expect(batch).toHaveLength(2);
  for (const move of batch) {
    expect(inventory.move(move.item, move.target).ok).toBe(true);
  }
  expect(piece.pockets![0]!.reduce((sum, { item }) => sum + item.count, 0)).toBe(6);
});

const cellsOf = (kind: string) => registry.items.get(kind)!.size.reduce((area, side) => area * side, 1);

// The stockpile of the smallest material, or the one holding `kind`.
const stockpile = (kind?: string) => {
  const def = [...registry.furniture.values()]
    .filter(({ container }) => container?.stockpile && (kind === undefined || container.accepts?.includes(kind)))
    .sort((a, b) => cellsOf(a.container!.accepts![0]!) - cellsOf(b.container!.accepts![0]!))[0]!;
  const type = kind ?? def.container!.accepts![0]!;
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
  const roomy = ({ grid }: { grid?: [number, number] | undefined }) =>
    grid !== undefined &&
    Math.min(...grid) >= Math.min(w, h) &&
    Math.max(...grid) >= Math.max(w, h) &&
    grid[0] * grid[1] >= 6 * w * h;
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
  inventory.move(held, { ...target, ontoUid: records()[0]!.uid });
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
  expect(one.ok && many.ok && many.durationSimSeconds).toBeCloseTo((one.ok ? one.durationSimSeconds : 0) * 3);
});

it('taking a whole stack to a hand costs one item, because a hand moves only one', () => {
  const { inventory, type, target, records } = stockpile();
  for (let at = 0; at < 4; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const hand = { kind: 'hand' as const, side: 'right' as const };
  const stack = records()[0]!;
  const whole = inventory.plan(stack, hand);
  const one = inventory.plan(stack, hand, 1);
  expect(whole.ok && one.ok).toBe(true);
  expect(whole.ok && whole.durationSimSeconds).toBeCloseTo(one.ok ? one.durationSimSeconds : Number.NaN);
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
  expect(batch.map(({ item }) => item)).toEqual([stack, odd]);
  for (const { item, target: planned } of batch) {
    expect(inventory.move(item, planned).ok).toBe(true);
  }
  const dropped = inventory.pileAt(pile.pos)!.items;
  expect(dropped.every(({ item }) => item.count === 1)).toBe(true);
});

const smallKind = [...registry.items.values()].find(
  (def) => def.stockpileStack !== undefined && def.stack !== undefined,
)!;

it('a take-all batch of a carried-stackable stockpile material plans every record and joins carried stacks', () => {
  const { inventory, type, target, records } = stockpile(smallKind.id);
  const carriedLimit = smallKind.stack!;
  const count = carriedLimit + 2;
  for (let at = 0; at < count; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const odd = inventory.create(type, 1, 0.5);
  expect(inventory.add(odd, target)).toBe(true);
  const stack = records().find((item) => item !== odd)!;
  const cells = cellsOf(type);
  // A pocket with room for a few carried stacks but fewer footprints than sheets.
  const holder = [...registry.items.values()].find(
    ({ container }) =>
      container &&
      !container.accepts &&
      !container.stockpile &&
      container.pockets.some(
        ({ grid }) =>
          grid !== undefined &&
          Math.floor((grid[0] * grid[1]) / cells) >= 3 &&
          Math.floor((grid[0] * grid[1]) / cells) < count,
      ),
  )!;
  const pack = inventory.create(holder.id);
  const pocket = holder.container!.pockets.findIndex(
    ({ grid }) =>
      grid !== undefined &&
      Math.floor((grid[0] * grid[1]) / cells) >= 3 &&
      Math.floor((grid[0] * grid[1]) / cells) < count,
  );
  expect(inventory.add(pack, { kind: 'hand', side: 'left' })).toBe(true);
  const into = { kind: 'pocket' as const, owner: pack, pocket };
  const batch = inventory.planBatch([stack, odd].map((item) => ({ item, targets: [into] })));
  expect(batch.map(({ item }) => item)).toEqual([stack, odd]);
  for (const { item, target: planned } of batch) {
    expect(inventory.move(item, planned).ok).toBe(true);
  }
  const landed = pack.pockets![pocket]!.map(({ item }) => item);
  expect(landed.every((item) => item.count <= carriedLimit)).toBe(true);
  expect(landed.reduce((sum, item) => sum + item.count, 0)).toBe(count + 1);
  expect(records()).toEqual([]);
});

const stackUid = (piece: { pockets?: { item: { uid: number } }[][] }) => piece.pockets![0]![0]!.item.uid;

it('dropping an item that can join a stockpile stack joins it and conserves counts', () => {
  const { inventory, piece, type, target, records } = stockpile();
  for (let at = 0; at < 4; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const held = inventory.create(type);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.move(held, { ...target, ontoUid: stackUid(piece) }).ok).toBe(true);
  expect(records()).toHaveLength(1);
  expect(records()[0]!.count).toBe(5);
  expect(inventory.carried().some((item) => item.type === type)).toBe(false);
});

it('dropping onto a full stockpile stack refuses and moves nothing', () => {
  const { inventory, piece, def, type, target, records } = stockpile();
  for (let at = 0; at < def.container!.maxCount!; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const held = inventory.create(type);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  const before = JSON.stringify(piece.pockets);
  expect(inventory.move(held, { ...target, ontoUid: stackUid(piece) }).ok).toBe(false);
  expect(JSON.stringify(piece.pockets)).toBe(before);
  expect(inventory.carried().filter((item) => item.type === type)).toEqual([held]);
  expect(records()[0]!.count).toBe(def.container!.maxCount);
});

it.each([true, false])(
  'a drop joins what the stack limit allows, with a container limit of %s, and leaves the rest at the source',
  (withContainerLimit) => {
    const base = baseRegistry();
    const { stockAppearance: _look, ...board } = base.furniture.get('board_stack')!;
    const material = { ...base.items.get('wooden_plank')!, id: 'fixture_ingot', stack: 2, stockpileStack: 4 };
    const rack = {
      ...board,
      id: 'fixture_rack',
      container: {
        stockpile: true as const,
        accepts: [material.id],
        pockets: board.container!.pockets,
        ...(withContainerLimit ? { maxCount: 8 } : { maxMassGrams: 1_000_000 }),
      },
    };
    const fixture = overlayContent(base, [
      { source: 'fixture-stack-limit', data: { items: [material], furniture: [rack] } },
    ]);
    const inventory = new Inventory(fixture);
    const piece = inventory.furnish({ type: rack.id, pos: [0, 0, 0], size: [...rack.size], facing: 'n' })!;
    inventory.entities.markSearched(piece);
    const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
    const stocked = material.stockpileStack - 1;
    for (let at = 0; at < stocked; at += 1) {
      expect(inventory.add(inventory.create(material.id), target)).toBe(true);
    }
    const held = inventory.create(material.id, material.stack);
    expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.move(held, { ...target, ontoUid: stackUid(piece) }).ok).toBe(true);
    expect(piece.pockets!.flat()).toHaveLength(1);
    expect(piece.pockets![0]![0]!.item.count).toBe(material.stockpileStack);
    expect(held.count).toBe(material.stack - 1);
    // The stack is now full: another drop refuses and moves nothing.
    const before = JSON.stringify(piece.pockets);
    expect(inventory.move(held, { ...target, ontoUid: stackUid(piece) }).ok).toBe(false);
    expect(JSON.stringify(piece.pockets)).toBe(before);
  },
);

it('a matching drop onto a full stockpile never swaps a stack within its carried limit out, by plan or move', () => {
  const { inventory, piece, def, type, target } = stockpile(smallKind.id);
  const carriedLimit = smallKind.stack!;
  const filler = [...registry.items.values()].find(
    (item) => def.container!.accepts!.includes(item.id) && item.id !== type,
  )!;
  // Fill to the container limit with another material, keeping a small stack within its carried limit.
  expect(inventory.add(inventory.create(type, Math.min(2, carriedLimit)), target)).toBe(true);
  const stacked = piece.pockets!.flat()[0]!.item.count;
  while (piece.pockets!.flat().reduce((sum, { item }) => sum + item.count, 0) < def.container!.maxCount!) {
    expect(inventory.add(inventory.create(filler.id), target)).toBe(true);
  }
  const held = inventory.create(type);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  const cell = piece.pockets![0]!.find(({ item }) => item.type === type)!;
  const drop = { ...target, ontoUid: cell.item.uid };
  const before = JSON.stringify(piece.pockets);
  expect(inventory.plan(held, drop).ok).toBe(false);
  expect(inventory.move(held, drop).ok).toBe(false);
  expect(JSON.stringify(piece.pockets)).toBe(before);
  expect(inventory.carried()).toEqual([held]);
  expect(cell.item.count).toBe(stacked);
});

it('a matching drop onto a stack full by its stack limit refuses even when that stack is within its carried limit', () => {
  const base = baseRegistry();
  const { stockAppearance: _look, ...board } = base.furniture.get('board_stack')!;
  const material = { ...base.items.get('wooden_plank')!, id: 'fixture_bar', stack: 3, stockpileStack: 3 };
  const rack = {
    ...board,
    id: 'fixture_bar_rack',
    container: { stockpile: true as const, accepts: [material.id], maxCount: 12, pockets: board.container!.pockets },
  };
  const fixture = overlayContent(base, [
    { source: 'fixture-full-stack', data: { items: [material], furniture: [rack] } },
  ]);
  const inventory = new Inventory(fixture);
  const piece = inventory.furnish({ type: rack.id, pos: [0, 0, 0], size: [...rack.size], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
  expect(inventory.add(inventory.create(material.id, material.stack), target)).toBe(true);
  const held = inventory.create(material.id);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  const before = JSON.stringify(piece.pockets);
  expect(inventory.move(held, { ...target, ontoUid: stackUid(piece) }).ok).toBe(false);
  expect(JSON.stringify(piece.pockets)).toBe(before);
  expect(inventory.carried()).toEqual([held]);
});

it('an item that cannot join, dropped on a stockpile stack, refuses and moves nothing, by plan and move', () => {
  const base = baseRegistry();
  const { stockAppearance: _look, ...board } = base.furniture.get('board_stack')!;
  const material = { ...base.items.get('wooden_plank')!, id: 'fixture_slat', stack: 3, stockpileStack: 5 };
  const rack = {
    ...board,
    id: 'fixture_slat_rack',
    container: { stockpile: true as const, accepts: [material.id], maxCount: 12, pockets: board.container!.pockets },
  };
  const fixture = overlayContent(base, [{ source: 'fixture-no-join', data: { items: [material], furniture: [rack] } }]);
  const inventory = new Inventory(fixture);
  const piece = inventory.furnish({ type: rack.id, pos: [0, 0, 0], size: [...rack.size], facing: 'n' })!;
  inventory.entities.markSearched(piece);
  const target = { kind: 'furniture', entity: piece, pocket: 0 } as const;
  // A stack within its carried limit, so only the drop rule can keep it from swapping out.
  expect(inventory.add(inventory.create(material.id, 2), target)).toBe(true);
  const other = inventory.create(material.id, 1, 0.5);
  expect(inventory.add(other, { kind: 'hand', side: 'right' })).toBe(true);
  const before = JSON.stringify(inventory.snapshotState());
  const drop = { ...target, ontoUid: stackUid(piece) };
  expect(inventory.plan(other, drop).ok).toBe(false);
  expect(inventory.move(other, drop).ok).toBe(false);
  expect(JSON.stringify(inventory.snapshotState())).toBe(before);
});

it('dropping more than a stockpile stack has room for joins what fits and leaves the rest at the source', () => {
  const { inventory, piece, def, type, target, records } = stockpile(smallKind.id);
  const room = 2;
  for (let at = 0; at < def.container!.maxCount! - room; at += 1) {
    expect(inventory.add(inventory.create(type), target)).toBe(true);
  }
  const held = inventory.create(type, room + 1);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.move(held, { ...target, ontoUid: stackUid(piece) }).ok).toBe(true);
  expect(records().reduce((sum, item) => sum + item.count, 0)).toBe(def.container!.maxCount);
  expect(held.count).toBe(1);
  expect(inventory.carried()).toContain(held);
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
