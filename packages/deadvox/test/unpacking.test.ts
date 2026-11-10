import { describe, expect, it } from 'vitest';
import { coreMessage } from '../src/core/coreText.ts';
import { reach } from '../src/core/reach.ts';
import { simSeconds } from '../src/core/time.ts';
import { HandlingQueue, Inventory, options } from '../src/engine/inventory.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';

const registry = baseRegistry();
const BOX_UNPACK_SECONDS = simSeconds(4);
const shellType = 'fixture_shell';
const boxType = 'fixture_shell_box';
const bagType = 'fixture_bag';
const fillerType = 'fixture_filler';
const payloadCount = 7;
const stackCapacity = 11;
const shellRow = {
  id: shellType,
  name: 'Fixture shell',
  category: 'ammo' as const,
  weight: 1,
  size: [1, 1] as [number, number],
  stack: stackCapacity,
  workInProgress: false,
};
const boxRow = {
  id: boxType,
  name: 'Fixture shell box',
  category: 'ammo' as const,
  weight: 1,
  size: [1, 2] as [number, number],
  unpack: { item: shellType, count: payloadCount, simSeconds: BOX_UNPACK_SECONDS },
  workInProgress: false,
};
const fixture = (small = false) => {
  // The bag's wearable layout comes from content; only its pocket is the fixture's.
  const bagSource = [...registry.items.values()].find((def) => def.wearable && def.container)!;
  const pocket = { name: 'Fixture pocket', grid: (small ? [1, 1] : [4, 4]) as [number, number] };
  const content = {
    ...registry,
    items: new Map(registry.items)
      .set(shellType, shellRow)
      .set(boxType, boxRow)
      .set(fillerType, { ...shellRow, id: fillerType, name: 'Fixture filler', category: 'misc' as const, stack: 1 })
      .set(bagType, {
        ...bagSource,
        id: bagType,
        container: { pockets: [{ ...pocket, handlingSimSeconds: simSeconds(0) }] },
      }),
  };
  const inventory = new Inventory(content);
  const box = inventory.create(boxType);
  const bag = inventory.create(bagType);
  if (!(inventory.add(bag, { kind: 'worn' }) && inventory.add(box, { kind: 'hand', side: 'right' }))) {
    throw new Error('Unpack fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
  return { inventory, box, bag, queue, unpacking };
};

describe('sealed ammunition package activation', () => {
  it('held primary activation yields its authored payload and consumes the noncontainer box', () => {
    const f = fixture();
    expect(f.box.pockets).toBeUndefined();
    expect(selectPrimaryAction(f.inventory)).toMatchObject({ kind: 'unpack', item: f.box });
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    expect([...f.inventory.items()].filter(({ item }) => item.type === shellType)).toEqual([]);
    expect(f.queue.tick(BOX_UNPACK_SECONDS).failed).toEqual([]);
    expect(f.inventory.itemByUid(f.box.uid)).toBeUndefined();
    expect(f.inventory.hands.right).toBeUndefined();
    expect(f.bag.pockets![0]!.map(({ item }) => [item.type, item.count])).toEqual([[shellType, payloadCount]]);
    expect(f.inventory.piles.size).toBe(0);
  });

  it('unpack fills a partial stack and conserves the remainder in an ordinary spill pile', () => {
    const f = fixture(true);
    const freePlaces = Math.floor(payloadCount / 2);
    const initialCount = stackCapacity - freePlaces;
    const shells = f.inventory.create(shellType, initialCount);
    expect(f.inventory.add(shells, { kind: 'pocket', owner: f.bag, pocket: 0 })).toBe(true);
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    expect(f.queue.tick(BOX_UNPACK_SECONDS).failed).toEqual([]);
    expect(shells.count).toBe(stackCapacity);
    const spilled = [...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item));
    expect(spilled).toHaveLength(1);
    expect(spilled[0]?.type).toBe(shellType);
    expect(spilled[0]?.count).toBe(payloadCount - freePlaces);
    expect(shells.count + spilled[0]!.count).toBe(initialCount + payloadCount);
    expect(f.inventory.itemByUid(f.box.uid)).toBeUndefined();
  });

  it('unpack with no ground nearby and no pocket room refuses for want of a landing and keeps the box', () => {
    const f = fixture(true);
    expect(f.inventory.add(f.inventory.create(fillerType), { kind: 'pocket', owner: f.bag, pocket: 0 })).toBe(true);
    f.inventory.landing = () => undefined;
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    expect(f.queue.tick(BOX_UNPACK_SECONDS).failed.map(({ reason }) => reason)).toEqual([
      coreMessage(registry, 'noLanding'),
    ]);
    expect(f.inventory.hands.right).toBe(f.box);
    expect([...f.inventory.items()].filter(({ item }) => item.type === shellType)).toEqual([]);
  });

  it('cancelling the opening job preserves the whole box and allocators and produces no loose shells', () => {
    const f = fixture();
    const before = f.inventory.snapshotState();
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    f.queue.tick(BOX_UNPACK_SECONDS / 2);
    f.queue.cancel();
    f.queue.tick(BOX_UNPACK_SECONDS);
    expect(f.inventory.snapshotState()).toEqual(before);
  });

  it('inventory options never expose an enabled Use, Load or Unpack operation even when the box is held', () => {
    const f = fixture();
    const choices = options(
      f.box,
      reach({ inventory: f.inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK }),
    );
    expect(choices.filter((choice) => choice.kind === 'use' && choice.plan.ok)).toEqual([]);
  });

  it('content admission rejects a payload larger than the stack reserved by unpack spill preflight', () => {
    const source = {
      source: 'invalid-package.json',
      data: {
        items: [shellRow, { ...boxRow, unpack: { ...boxRow.unpack, count: stackCapacity + 1 } }],
      },
    };
    expect(buildRegistry([source]).issues.some((issue) => issue.path.endsWith('.unpack.count'))).toBe(true);

    const exactCapacity = {
      source: source.source,
      data: {
        items: [
          source.data.items[0],
          {
            ...source.data.items[1],
            unpack: { ...boxRow.unpack, count: stackCapacity },
          },
        ],
      },
    };
    expect(buildRegistry([exactCapacity]).issues.some((issue) => issue.path.endsWith('.unpack.count'))).toBe(false);
  });
});
