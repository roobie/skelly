import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { HANDLING, Inventory } from '../src/core/inventory.ts';
import { conditionWord, fitsAt, weightOf } from '../src/core/items.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);

/** A player in jeans, a hoodie and a school backpack, standing by an empty floor. */
const dressed = () => {
  const inv = new Inventory(registry);
  const jeans = inv.create('jeans');
  const hoodie = inv.create('hoodie');
  const backpack = inv.create('school_backpack');
  inv.worn.legs = jeans;
  inv.worn.torso = hoodie;
  inv.worn.back = backpack;
  return { inv, jeans, hoodie, backpack };
};

/** Puts an item on the floor at the origin block and returns it. */
const onFloor = (inv: Inventory, type: string, count = 1, condition = 1) => {
  const item = inv.create(type, count, condition);
  const pile = inv.pileAt([0, 0, 0]) ?? { pos: [0, 0, 0] as [number, number, number], items: [] };
  const spot = { x: 0, y: 0, rotated: false };
  // Keep test piles simple: a new pile per call when the first spot is taken.
  if (pile.items.length > 0) {
    const pos: [number, number, number] = [inv.piles.size, 0, 0];
    inv.piles.set(pos.join(','), { pos, items: [{ item, ...spot }] });
    return item;
  }
  pile.items.push({ item, ...spot });
  inv.piles.set('0,0,0', pile);
  return item;
};

describe('grid placement', () => {
  it('puts an item in the first free spot, and refuses one that overlaps or crosses an edge', () => {
    const { inv, hoodie } = dressed();
    const beans = onFloor(inv, 'canned_beans');
    const pocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    expect(inv.move(beans, pocket)).toMatchObject({ ok: true, at: { x: 0, y: 0, rotated: false } });

    const soup = onFloor(inv, 'canned_soup');
    expect(inv.plan(soup, { ...pocket, at: { x: 0, y: 0, rotated: false } })).toEqual({
      ok: false,
      reason: 'No room there',
    });
    expect(inv.plan(soup, { ...pocket, at: { x: 3, y: 0, rotated: false } })).toEqual({
      ok: false,
      reason: 'No room there',
    });
    expect(inv.plan(soup, { ...pocket, at: { x: 2, y: 1, rotated: false } })).toEqual({
      ok: false,
      reason: 'No room there',
    });
    expect(inv.plan(soup, { ...pocket, at: { x: 2, y: 0, rotated: false } }).ok).toBe(true);
  });

  it('rotates an item to fit, and refuses one too big either way', () => {
    const { inv, hoodie, jeans } = dressed();
    const knife = onFloor(inv, 'kitchen_knife'); // 1 × 3
    expect(inv.plan(knife, { kind: 'pocket', owner: jeans, pocket: 0 })).toEqual({
      ok: false,
      reason: 'Too big for it',
    });
    expect(inv.move(knife, { kind: 'pocket', owner: hoodie, pocket: 0 })).toMatchObject({
      ok: true,
      at: { x: 0, y: 0, rotated: true },
    });
  });

  it('checks cells against every item in the grid', () => {
    const { inv, backpack } = dressed();
    const water = onFloor(inv, 'water_bottle');
    inv.move(water, { kind: 'pocket', owner: backpack, pocket: 0, at: { x: 1, y: 1, rotated: false } });
    const grid = { size: inv.pocketGrid(backpack, 0), placed: backpack.pockets![0]! };
    const bat = inv.create('baseball_bat'); // 1 × 6
    expect(fitsAt(registry, grid, bat, { x: 1, y: 0, rotated: false })).toBe(false);
    expect(fitsAt(registry, grid, bat, { x: 0, y: 0, rotated: false })).toBe(true);
    expect(fitsAt(registry, grid, bat, { x: 0, y: 0, rotated: true })).toBe(false);
  });

  it('lets an item move within its own grid', () => {
    const { inv, backpack } = dressed();
    const water = onFloor(inv, 'water_bottle');
    const main = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
    inv.move(water, { ...main, at: { x: 0, y: 0, rotated: false } });
    expect(inv.move(water, { ...main, at: { x: 0, y: 1, rotated: false } }).ok).toBe(true);
    expect(backpack.pockets![0]).toEqual([{ item: water, x: 0, y: 1, rotated: false }]);
  });
});

describe('stacking', () => {
  it('joins identical items up to the stack limit', () => {
    const { inv, hoodie } = dressed();
    const pocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    const a = onFloor(inv, 'aa_battery', 6);
    const b = onFloor(inv, 'aa_battery', 4);
    const c = onFloor(inv, 'aa_battery', 2);
    inv.move(a, pocket);
    expect(inv.move(b, pocket)).toMatchObject({ ok: true, merge: a });
    expect(a.count).toBe(10);
    // The stack is full (10), so the next two take a cell of their own.
    expect(inv.move(c, pocket)).toMatchObject({ ok: true, at: { x: 1, y: 0 } });
    expect(hoodie.pockets![0]!.map((p) => p.item.count)).toEqual([10, 2]);
  });

  it("doesn't stack items that differ", () => {
    const { inv, hoodie } = dressed();
    const pocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    const fresh = onFloor(inv, 'rag', 1, 1);
    const dirty = onFloor(inv, 'rag', 1, 0.4);
    const beans = [onFloor(inv, 'canned_beans'), onFloor(inv, 'canned_beans')];
    inv.move(fresh, pocket);
    expect(inv.move(dirty, pocket)).toMatchObject({ ok: true, at: { x: 1, y: 0 } });
    inv.move(beans[0]!, pocket);
    // Cans don't stack: the second lies on its side in the bottom row.
    expect(inv.move(beans[1]!, pocket)).toMatchObject({ ok: true, at: { x: 0, y: 1, rotated: true } });
    expect(hoodie.pockets![0]).toHaveLength(4);
  });

  it('splits a stack when moving part of it', () => {
    const { inv, hoodie } = dressed();
    const nails = onFloor(inv, 'nails', 40);
    expect(inv.move(nails, { kind: 'pocket', owner: hoodie, pocket: 0 }, 15).ok).toBe(true);
    expect(nails.count).toBe(25);
    expect(hoodie.pockets![0]!.map((p) => p.item.count)).toEqual([15]);
    expect(inv.pileAt([0, 0, 0])!.items[0]!.item).toBe(nails);
  });
});

describe('nesting', () => {
  it('refuses a bag with anything in it inside another container', () => {
    const inv = new Inventory(registry);
    const hiking = onFloor(inv, 'hiking_backpack');
    inv.worn.back = inv.create('hoodie'); // wrong slot on purpose: only the grid matters here
    const school = onFloor(inv, 'school_backpack');
    const beans = onFloor(inv, 'canned_beans');
    inv.move(beans, { kind: 'pocket', owner: school, pocket: 1 });
    expect(inv.plan(school, { kind: 'pocket', owner: hiking, pocket: 0 })).toEqual({
      ok: false,
      reason: 'Only empty bags go inside other containers',
    });
    inv.move(beans, { kind: 'pile', pos: [5, 0, 0] });
    expect(inv.move(school, { kind: 'pocket', owner: hiking, pocket: 0 }).ok).toBe(true);
  });

  it('refuses an empty bag that is too big, and a bag inside itself', () => {
    const { inv, hoodie } = dressed();
    const fanny = onFloor(inv, 'fanny_pack'); // 2 × 2, its pocket 3 × 2
    const hiking = onFloor(inv, 'hiking_backpack'); // 4 × 5
    expect(inv.plan(hiking, { kind: 'pocket', owner: hoodie, pocket: 0 })).toEqual({
      ok: false,
      reason: 'Too big for it',
    });
    expect(inv.plan(fanny, { kind: 'pocket', owner: fanny, pocket: 0 })).toEqual({
      ok: false,
      reason: "It can't go inside itself",
    });
    expect(inv.move(fanny, { kind: 'pocket', owner: hoodie, pocket: 0 }).ok).toBe(true);
  });

  it('finds items at any depth, and counts their weight', () => {
    const { inv, backpack } = dressed();
    const fanny = onFloor(inv, 'fanny_pack');
    inv.move(fanny, { kind: 'pocket', owner: backpack, pocket: 0 });
    const aa = onFloor(inv, 'aa_battery', 3);
    inv.move(aa, { kind: 'pocket', owner: fanny, pocket: 0 });
    expect(inv.locate(aa)).toMatchObject({ kind: 'pocket', owner: fanny, pocket: 0 });
    expect(weightOf(registry, backpack)).toBe(600 + 200 + 3 * 23);
  });
});

describe('hands and wearing', () => {
  it('needs both hands for a two-handed item', () => {
    const inv = new Inventory(registry);
    const bat = onFloor(inv, 'baseball_bat');
    const torch = onFloor(inv, 'flashlight');
    inv.move(torch, { kind: 'hand', side: 'left' });
    expect(inv.plan(bat, { kind: 'hand', side: 'right' })).toEqual({ ok: false, reason: 'It needs both hands' });
    inv.move(torch, { kind: 'pile', pos: [3, 0, 0] });
    inv.move(bat, { kind: 'hand', side: 'right' });
    expect(inv.plan(torch, { kind: 'hand', side: 'left' })).toEqual({
      ok: false,
      reason: 'The baseball bat needs both hands',
    });
  });

  it('wears clothing in its slot, one per slot', () => {
    const { inv } = dressed();
    const jacket = onFloor(inv, 'jacket');
    expect(inv.plan(jacket, { kind: 'worn' })).toEqual({
      ok: false,
      reason: "You're already wearing the hoodie there",
    });
    inv.move(inv.worn.torso!, { kind: 'pile', pos: [4, 0, 0] });
    expect(inv.move(jacket, { kind: 'worn' }).ok).toBe(true);
    expect(inv.worn.torso).toBe(jacket);
    expect(inv.plan(inv.create('crowbar'), { kind: 'worn' })).toEqual({ ok: false, reason: "It isn't there any more" });
  });
});

describe('handling time', () => {
  it('is taking it out plus putting it in, plus a little per cell each way', () => {
    const { inv, backpack, jeans } = dressed();
    const beans = onFloor(inv, 'canned_beans'); // 2 cells
    const cells = 2 * HANDLING.perCell;
    expect(inv.plan(beans, { kind: 'pocket', owner: backpack, pocket: 0 })).toMatchObject({
      time: HANDLING.ground + cells + 1.5 + cells,
    });
    inv.move(beans, { kind: 'pocket', owner: jeans, pocket: 0 });
    expect(inv.plan(beans, { kind: 'hand', side: 'right' })).toMatchObject({ time: 0.5 + cells });
    expect(inv.plan(inv.worn.torso!, { kind: 'pile', pos: [2, 0, 0] })).toMatchObject({
      time: HANDLING.wear + HANDLING.ground + 9 * HANDLING.perCell,
    });
  });

  it('moves items one at a time, each when its time is up', () => {
    const { inv, backpack } = dressed();
    const queue = new HandlingQueue(inv);
    const beans = onFloor(inv, 'canned_beans');
    const water = onFloor(inv, 'water_bottle');
    const main = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
    const first = queue.enqueue(beans, main);
    queue.enqueue(water, main);
    expect(first.ok).toBe(true);
    const beansTime = first.ok ? first.job.duration : 0;

    queue.tick(beansTime - 0.1);
    expect(inv.locate(beans)?.kind).toBe('pile'); // still on the floor until the time is up
    expect(queue.busy).toBe(true);
    const result = queue.tick(0.2);
    expect(result.done.map((j) => (j.kind === 'move' ? j.item : undefined))).toEqual([beans]);
    expect(inv.locate(beans)).toMatchObject({ kind: 'pocket', owner: backpack });
    expect(queue.jobs).toHaveLength(1);
    queue.tick(10);
    expect(queue.busy).toBe(false);
    expect(backpack.pockets![0]!.map((p) => p.item)).toEqual([beans, water]);
  });

  it('checks a move again when it finishes', () => {
    const { inv, hoodie } = dressed();
    const queue = new HandlingQueue(inv);
    const soup = onFloor(inv, 'canned_soup');
    const beans = onFloor(inv, 'canned_beans');
    const spot = { kind: 'pocket', owner: hoodie, pocket: 0, at: { x: 0, y: 0, rotated: false } } as const;
    queue.enqueue(soup, spot);
    inv.move(beans, spot); // something else took the spot meanwhile
    const result = queue.tick(10);
    expect(result.failed).toEqual([{ job: expect.objectContaining({ item: soup }), reason: 'No room there' }]);
    expect(inv.locate(soup)?.kind).toBe('pile');
  });
});

describe('condition', () => {
  it('reads as a word', () => {
    expect([1, 0.7, 0.4, 0.15, 0.05].map(conditionWord)).toEqual([
      'pristine',
      'worn',
      'damaged',
      'badly damaged',
      'ruined',
    ]);
  });
});
