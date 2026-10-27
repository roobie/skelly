import { describe, expect, it } from 'vitest';
import { coreRefusal } from '../src/core/coreText.ts';
import { SLING_SLOT } from '../src/core/firearmFitting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { handlingWeights, Inventory } from '../src/core/inventory.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import { conditionWord, fitsAt, weightOf } from '../src/core/items.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const HANDLING = handlingWeights(registry);

/**
 * The base registry with the footprints the slot expectations below follow from declared here, so retuning base
 * content sizes cannot move them.
 */
const declared = (() => {
  const withGrid = (id: string, grids: readonly [number, number][]) => {
    const container = registry.items.get(id)!.container!;
    return {
      container: {
        ...container,
        pockets: container.pockets.map((pocket, index) => (grids[index] ? { ...pocket, grid: grids[index] } : pocket)),
      },
    };
  };
  const overrides = new Map<string, object>([
    ['rag', { size: [1, 1], stack: 6 }],
    ['canned_beans', { size: [1, 2] }],
    ['canned_soup', { size: [1, 2] }],
    ['kabar', { size: [1, 3] }],
    ['hoodie', withGrid('hoodie', [[3, 2]])],
    ['jeans', withGrid('jeans', [[1, 2]])],
    ['school_backpack', withGrid('school_backpack', [[5, 6]])],
    ['water_bottle', { size: [1, 3] }],
    ['machete', { size: [1, 6] }],
  ]);
  return {
    ...registry,
    items: new Map([...registry.items].map(([id, def]) => [id, { ...def, ...overrides.get(id) }])),
  } as typeof registry;
})();

/** A player in jeans, a hoodie and a school backpack, standing by an empty floor. */
const dressed = (content = registry) => {
  const inv = new Inventory(content);
  const jeans = inv.create('jeans');
  const hoodie = inv.create('hoodie');
  const backpack = inv.create('school_backpack');
  for (const [item, label] of [
    [jeans, 'jeans'],
    [hoodie, 'hoodie'],
    [backpack, 'backpack'],
  ] as const) {
    if (!inv.add(item, { kind: 'worn' })) {
      throw new Error(`Could not place fixture ${label}`);
    }
  }
  return { inv, jeans, hoodie, backpack };
};

/** Puts an item on its own floor pile and returns it. */
const onFloor = (inv: Inventory, type: string, count = 1, condition = 1) => {
  const item = inv.create(type, count, condition);
  const pos: [number, number, number] = [inv.piles.size, 0, 0];
  if (!inv.add(item, { kind: 'pile', pos })) {
    throw new Error(`Could not place fixture ${type}`);
  }
  return item;
};

describe('grid placement', () => {
  it('places in free spots, swaps equal footprints, and refuses placements beyond grid bounds', () => {
    const { inv, hoodie } = dressed(declared);
    const beans = onFloor(inv, 'canned_beans');
    const pocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    expect(inv.move(beans, pocket)).toMatchObject({ ok: true, at: { x: 0, y: 0, rotated: false } });

    const soup = onFloor(inv, 'canned_soup');
    expect(inv.plan(soup, { ...pocket, at: { x: 0, y: 0, rotated: false } })).toMatchObject({
      ok: true,
      swap: beans,
      at: { x: 0, y: 0, rotated: false },
    });
    expect(inv.plan(soup, { ...pocket, at: { x: 3, y: 0, rotated: false } }).ok).toBe(false);
    expect(inv.plan(soup, { ...pocket, at: { x: 2, y: 1, rotated: false } }).ok).toBe(false);
    expect(inv.plan(soup, { ...pocket, at: { x: 2, y: 0, rotated: false } }).ok).toBe(true);
  });

  it('rotates an item to fit, and refuses one too big either way', () => {
    const { inv, hoodie, jeans } = dressed(declared);
    const knife = onFloor(inv, 'kabar');
    expect(inv.plan(knife, { kind: 'pocket', owner: jeans, pocket: 0 })).toEqual(coreRefusal(registry, 'tooBig'));
    expect(inv.move(knife, { kind: 'pocket', owner: hoodie, pocket: 0 })).toMatchObject({
      ok: true,
      at: { x: 0, y: 0, rotated: true },
    });
  });

  it('checks cells against every item in the grid', () => {
    const { inv, backpack } = dressed(declared);
    const water = onFloor(inv, 'water_bottle');
    inv.move(water, { kind: 'pocket', owner: backpack, pocket: 0, at: { x: 1, y: 1, rotated: false } });
    const grid = { size: inv.pocketGrid(backpack, 0), placed: backpack.pockets![0]! };
    const bat = inv.create('machete');
    expect(fitsAt(declared, grid, bat, { x: 1, y: 0, rotated: false })).toBe(false);
    expect(fitsAt(declared, grid, bat, { x: 0, y: 0, rotated: false })).toBe(true);
    expect(fitsAt(declared, grid, bat, { x: 0, y: 0, rotated: true })).toBe(false);
  });

  it('lets an item move within its own grid', () => {
    const { inv, backpack } = dressed();
    const water = onFloor(inv, 'water_bottle');
    const main = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
    inv.move(water, { ...main, at: { x: 0, y: 0, rotated: false } });
    expect(inv.move(water, { ...main, at: { x: 0, y: 1, rotated: false } }).ok).toBe(true);
    expect(backpack.pockets![0]).toEqual([{ item: water, x: 0, y: 1, rotated: false }]);
  });

  it('refuses a same-grid swap when the final footprints overlap', () => {
    const { inv, hoodie } = dressed();
    const small = onFloor(inv, 'rag');
    const large = onFloor(inv, 'chocolate_bar');
    const pocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    const smallSpot = { ...pocket, at: { x: 0, y: 0, rotated: false } };
    const largeSpot = { ...pocket, at: { x: 1, y: 0, rotated: false } };
    expect(inv.move(small, smallSpot).ok).toBe(true);
    expect(inv.move(large, largeSpot).ok).toBe(true);
    const before = inv.snapshotState();

    const moved = inv.move(small, largeSpot);
    const after = inv.snapshotState();
    expect(moved.ok).toBe(false);
    expect(after).toEqual(before);
    expect(() => Inventory.restoreState(registry, after)).not.toThrow();
  });

  it('refuses overlapping same-pile swaps with owned non-stackable footprints', () => {
    const fixtureRegistry = { ...registry, items: new Map(registry.items) };
    fixtureRegistry.items.set('fixture_tall', {
      ...registry.items.get('rag')!,
      id: 'fixture_tall',
      size: [1, 3],
      stack: undefined,
    });
    fixtureRegistry.items.set('fixture_wide', {
      ...registry.items.get('rag')!,
      id: 'fixture_wide',
      size: [3, 1],
      stack: undefined,
    });
    const inv = new Inventory(fixtureRegistry);
    const tall = inv.create('fixture_tall');
    const wide = inv.create('fixture_wide');
    const pile = { kind: 'pile', pos: [10, 0, 0] as [number, number, number] } as const;
    expect(inv.add(tall, { ...pile, at: { x: 0, y: 0, rotated: false } })).toBe(true);
    expect(inv.add(wide, { ...pile, at: { x: 1, y: 0, rotated: false } })).toBe(true);
    const before = inv.snapshotState();

    expect(inv.move(tall, { ...pile, at: { x: 1, y: 0, rotated: false } }).ok).toBe(false);
    const after = inv.snapshotState();
    expect(after).toEqual(before);
    expect(() => Inventory.restoreState(fixtureRegistry, after)).not.toThrow();
  });

  it('swaps items across containers when each fits the other stored place', () => {
    const { inv, backpack, hoodie } = dressed();
    const carried = onFloor(inv, 'rag', 1, 1);
    const nearby = onFloor(inv, 'rag', 1, 0.4);
    const backpackSpot = { kind: 'pocket', owner: backpack, pocket: 0, at: { x: 0, y: 0, rotated: false } } as const;
    const hoodieSpot = { kind: 'pocket', owner: hoodie, pocket: 0, at: { x: 0, y: 0, rotated: false } } as const;
    expect(inv.move(carried, backpackSpot).ok).toBe(true);
    expect(inv.move(nearby, hoodieSpot).ok).toBe(true);

    expect(inv.move(carried, hoodieSpot).ok).toBe(true);
    expect(inv.locate(carried)).toMatchObject({
      kind: 'pocket',
      owner: hoodie,
      pocket: 0,
      placed: hoodie.pockets![0]![0],
    });
    expect(inv.locate(nearby)).toMatchObject({
      kind: 'pocket',
      owner: backpack,
      pocket: 0,
      placed: backpack.pockets![0]![0],
    });
  });

  it('swaps a hand item with a container item in either drag direction', () => {
    const { inv, backpack } = dressed();
    const inHand = onFloor(inv, 'rag', 1, 1);
    const inPocket = onFloor(inv, 'rag', 1, 0.4);
    const pocketSpot = { kind: 'pocket', owner: backpack, pocket: 0, at: { x: 3, y: 0, rotated: false } } as const;
    expect(inv.move(inHand, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inv.move(inPocket, pocketSpot).ok).toBe(true);

    expect(inv.move(inHand, pocketSpot).ok).toBe(true);
    expect(inv.hands.right).toBe(inPocket);
    expect(inv.locate(inHand)).toMatchObject({ kind: 'pocket', owner: backpack, pocket: 0 });

    expect(inv.move(inHand, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inv.hands.right).toBe(inHand);
    expect(inv.locate(inPocket)).toMatchObject({ kind: 'pocket', owner: backpack, pocket: 0 });
  });

  it('allows a two-handed item to replace a held item when the opposite hand is empty', () => {
    const inv = new Inventory(registry);
    const held = onFloor(inv, 'rag');
    const bat = onFloor(inv, 'baseball_bat');
    expect(inv.move(held, { kind: 'hand', side: 'right' }).ok).toBe(true);

    expect(inv.move(bat, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inv.hands).toEqual({ right: bat });
    expect(inv.locate(held)?.kind).toBe('pile');
  });

  it('refuses a two-handed swap while the other hand remains occupied', () => {
    const inv = new Inventory(registry);
    const right = onFloor(inv, 'rag');
    const left = onFloor(inv, 'flashlight');
    const bat = onFloor(inv, 'baseball_bat');
    expect(inv.move(right, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inv.move(left, { kind: 'hand', side: 'left' }).ok).toBe(true);
    const beforeBat = inv.locate(bat);

    expect(inv.move(bat, { kind: 'hand', side: 'right' }).ok).toBe(false);
    expect(inv.hands).toEqual({ right, left });
    expect(inv.locate(bat)).toEqual(beforeBat);
  });

  it('refuses a swap when the displaced item cannot fit the source place', () => {
    const { inv, jeans } = dressed();
    const small = onFloor(inv, 'rag');
    const jeansSpot = { kind: 'pocket', owner: jeans, pocket: 0, at: { x: 0, y: 0, rotated: false } } as const;
    expect(inv.move(small, jeansSpot).ok).toBe(true);
    const bat = onFloor(inv, 'baseball_bat');
    const pileSpot = {
      kind: 'pile',
      pos: [0, 0, 0] as [number, number, number],
      at: { x: 0, y: 0, rotated: false },
    } as const;
    const beforeSmall = inv.locate(small);
    const beforeBat = inv.locate(bat);

    expect(inv.move(small, pileSpot).ok).toBe(false);
    expect(inv.locate(small)).toEqual(beforeSmall);
    expect(inv.locate(bat)).toEqual(beforeBat);
  });
});

describe('stacking', () => {
  it('joins identical items up to the stack limit', () => {
    const limit = 7;
    const content = {
      ...registry,
      items: new Map(registry.items).set('aa_battery', {
        ...registry.items.get('aa_battery')!,
        stack: limit,
      }),
    };
    const { inv, hoodie } = dressed(content);
    const pocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    const a = onFloor(inv, 'aa_battery', limit - 2);
    const b = onFloor(inv, 'aa_battery', 2);
    const c = onFloor(inv, 'aa_battery', 2);
    inv.move(a, pocket);
    expect(inv.move(b, pocket)).toMatchObject({ ok: true, merge: a });
    expect(a.count).toBe(limit);
    expect(inv.snapshotState().worn.torso!.pockets![0]![0]!.item).not.toHaveProperty('lootedCount');
    // Saturated stacks cannot absorb the next item.
    expect(inv.move(c, pocket)).toMatchObject({ ok: true, at: { x: 1, y: 0 } });
    expect(hoodie.pockets![0]!.map((p) => p.item.count)).toEqual([limit, 2]);
  });

  it("doesn't stack items that differ", () => {
    const { inv, hoodie } = dressed(declared);
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

  it('swaps clothing within its occupied wear slot', () => {
    const { inv } = dressed();
    const jacket = onFloor(inv, 'jacket');
    const hoodie = inv.worn.torso!;
    expect(inv.plan(jacket, { kind: 'worn' })).toMatchObject({ ok: true, swap: hoodie });
    expect(inv.move(jacket, { kind: 'worn' }).ok).toBe(true);
    expect(inv.worn.torso).toBe(jacket);
    expect(inv.locate(hoodie)?.kind).toBe('pile');
    expect(inv.plan(inv.create('crowbar'), { kind: 'worn' })).toEqual(coreRefusal(registry, 'gone'));
  });

  it('puts a long gun on the shoulder only with a sling fitted', () => {
    const { inv } = dressed();
    const shotgun = onFloor(inv, 'pump_shotgun');
    expect(inv.plan(shotgun, { kind: 'worn' }).ok).toBe(false);
    inv.fitSlot(shotgun, SLING_SLOT, inv.create('weapon_sling'));
    expect(inv.move(shotgun, { kind: 'worn' }).ok).toBe(true);
    expect(inv.worn.shoulder).toBe(shotgun);
  });

  it('a slung long gun leaves both hands and the pack free, and still counts as carried weight', () => {
    const { inv, backpack } = dressed();
    const shotgun = onFloor(inv, 'pump_shotgun');
    inv.fitSlot(shotgun, SLING_SLOT, inv.create('weapon_sling'));
    const crowbar = onFloor(inv, 'crowbar');
    const before = inv.carriedWeight();
    inv.move(shotgun, { kind: 'hand', side: 'right' });
    expect(inv.plan(shotgun, { kind: 'worn' })).toMatchObject({ ok: true, time: HANDLING.wear });
    inv.move(shotgun, { kind: 'worn' });

    expect(inv.move(crowbar, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(inv.worn.shoulder).toBe(shotgun);
    expect(backpack.pockets!.every((pocket) => pocket.length === 0)).toBe(true);
    expect(inv.carriedWeight()).toBe(before + weightOf(registry, shotgun) + weightOf(registry, crowbar));
  });
});

describe('handling time', () => {
  it('is taking it out plus putting it in, plus a little per cell each way', () => {
    const { inv, backpack, jeans } = dressed();
    const beans = onFloor(inv, 'canned_beans');
    const footprint = (type: string) => {
      const [w, h] = registry.items.get(type)!.size;
      return w * h * HANDLING.perCell;
    };
    const cells = footprint(beans.type);
    const backpackHandling = registry.items.get(backpack.type)!.container!.pockets[0]!.handlingSimSeconds;
    const jeansHandling = registry.items.get(jeans.type)!.container!.pockets[0]!.handlingSimSeconds;
    expect(inv.plan(beans, { kind: 'pocket', owner: backpack, pocket: 0 })).toMatchObject({
      time: HANDLING.ground + cells + backpackHandling + cells,
    });
    expect(inv.move(beans, { kind: 'pocket', owner: jeans, pocket: 0 }).ok).toBe(true);
    expect(inv.plan(beans, { kind: 'hand', side: 'right' })).toMatchObject({ time: jeansHandling + cells });
    expect(inv.plan(beans, { kind: 'pocket', owner: backpack, pocket: 0 })).toMatchObject({
      time: jeansHandling + cells + backpackHandling + cells,
    });
    expect(inv.plan(inv.worn.torso!, { kind: 'pile', pos: [2, 0, 0] })).toMatchObject({
      time: HANDLING.wear + HANDLING.ground + footprint(inv.worn.torso!.type),
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
    expect(result.done.map((j) => (j.kind === 'move' ? j.itemUid : undefined))).toEqual([beans.uid]);
    expect(inv.locate(beans)).toMatchObject({ kind: 'pocket', owner: backpack });
    expect(queue.jobs).toHaveLength(1);
    queue.tick(10);
    expect(queue.busy).toBe(false);
    expect(backpack.pockets![0]!.map((p) => p.item)).toEqual([beans, water]);
  });

  it('rechecks an occupied move at completion and swaps its new occupant', () => {
    const { inv, hoodie } = dressed();
    const queue = new HandlingQueue(inv);
    const soup = onFloor(inv, 'canned_soup');
    const beans = onFloor(inv, 'canned_beans');
    const spot = { kind: 'pocket', owner: hoodie, pocket: 0, at: { x: 0, y: 0, rotated: false } } as const;
    queue.enqueue(soup, spot);
    inv.move(beans, spot); // something else took the spot meanwhile
    const result = queue.tick(10);
    expect(result.done).toEqual([expect.objectContaining({ kind: 'move', itemUid: soup.uid })]);
    expect(result.failed).toEqual([]);
    expect(inv.locate(soup)).toMatchObject({ kind: 'pocket', owner: hoodie, pocket: 0 });
    expect(inv.locate(beans)?.kind).toBe('pile');
  });

  it('fails a batch move whose reserved spot an earlier queued move filled, instead of swapping', () => {
    const singleCell = {
      ...registry,
      items: new Map(
        [...registry.items].map(([id, def]) => {
          if (id === 'jeans') {
            const [first, ...rest] = def.container!.pockets;
            return [id, { ...def, container: { ...def.container!, pockets: [{ ...first!, grid: [1, 1] }, ...rest] } }];
          }
          return [id, id === 'rag' || id === 'chocolate_bar' ? { ...def, size: [1, 1] } : def];
        }),
      ),
    } as typeof registry;
    const { inv, jeans } = dressed(singleCell);
    const queue = new HandlingQueue(inv);
    const rag = onFloor(inv, 'rag');
    const bar = onFloor(inv, 'chocolate_bar');
    const pocket = { kind: 'pocket', owner: jeans, pocket: 0 } as const;
    expect(queue.enqueue(rag, pocket).ok).toBe(true);
    const [reserved] = inv.planBatch([{ item: bar, targets: [pocket] }]);
    expect(queue.enqueue(bar, reserved!.target).ok).toBe(true);
    const result = queue.tick(60);
    expect(result.failed).toEqual([{ job: expect.objectContaining({ itemUid: bar.uid }), reason: expect.any(String) }]);
    expect(inv.locate(rag)).toMatchObject({ kind: 'pocket', owner: jeans, pocket: 0 });
    expect(inv.locate(bar)?.kind).toBe('pile');
  });
});

describe('registry-aware item tree restoration', () => {
  it('rejects pockets on a noncontainer before exposing the restored item', () => {
    const inv = new Inventory(registry);
    const rag = inv.create('rag');
    expect(inv.add(rag, { kind: 'hand', side: 'right' })).toBe(true);
    const state = structuredClone(inv.snapshotState());
    state.hands.right!.pockets = [[]];
    expect(() => Inventory.restoreState(registry, state)).toThrow('rag has no container');
  });

  it('rejects a missing declared pocket grid before exposing the restored bag', () => {
    const inv = new Inventory(registry);
    const bag = inv.create('school_backpack');
    expect(inv.add(bag, { kind: 'hand', side: 'right' })).toBe(true);
    const state = structuredClone(inv.snapshotState());
    state.hands.right!.pockets!.pop();
    expect(() => Inventory.restoreState(registry, state)).toThrow();
  });

  it('rejects a pile placement outside its fixed grid before exposing the restored pile', () => {
    const inv = new Inventory(registry);
    expect(inv.add(inv.create('rag'), { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const state = structuredClone(inv.snapshotState());
    state.piles[0]!.items[0] = { ...state.piles[0]!.items[0]!, x: PILE_GRID.w };
    expect(() => Inventory.restoreState(registry, state)).toThrow('Invalid item placement');
  });
});

describe('condition', () => {
  it('reads every value in [0, 1] as exactly one band of the content table', () => {
    const bands = registry.inventory.get('player')!.conditionBands;
    const edges = bands.map((band) => band.from);
    const samples = [
      ...Array.from({ length: 101 }, (_, i) => i / 100),
      ...edges,
      ...edges.map((edge) => edge - 1e-9),
    ].filter((value) => value >= 0 && value <= 1);
    for (const value of samples) {
      const containing = bands.filter(
        (band, i) => band.from <= value && (bands[i + 1]?.from ?? Number.POSITIVE_INFINITY) > value,
      );
      expect(containing, `condition ${value}`).toHaveLength(1);
      expect(conditionWord(registry, value)).toBe(containing[0]!.word);
    }
  });
});
