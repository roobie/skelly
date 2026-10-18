import { describe, expect, it } from 'vitest';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { chargeOf } from '../src/core/lights.ts';
import { bindReach } from '../src/core/reach.ts';
import { Quickbar } from '../src/game/quickbar.ts';
import { applyReplayActionPayload, type ReplayCommandOwners } from '../src/game/replayCommands.ts';
import { Survival } from '../src/game/survival.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';

const registry = baseRegistry();
const runtime = () => {
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const survival = new Survival(new Simulation({ seed: 1 }), inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1, clock: BASE_CLOCK }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: () => undefined,
    read: () => {
      throw new Error('Unexpected reading in quickbar fixture');
    },
  });
  return { inventory, queue, survival, quickbar: new Quickbar() };
};

describe('non-owning item bindings', () => {
  it('resolves carried bindings without enumerating world inventories', () => {
    const { inventory, quickbar, survival } = runtime();
    const light = inventory.create('flashlight');
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    quickbar.assign(0, light);
    expect(survival.use(light)).toBeUndefined();
    inventory.piles.values = () => {
      throw new Error('Carried lookup enumerated world piles');
    };
    expect(quickbar.resolve(0, inventory)).toBe(light);
    expect(survival.lit).toBe(light);
  });

  it('empties the source binding when a full stack merges into a different UID', () => {
    const { inventory, quickbar } = runtime();
    const source = inventory.create('rag', 2);
    const destination = inventory.create('rag', 3);
    expect(inventory.add(source, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(destination, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    quickbar.assign(0, source);
    expect(inventory.move(source, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(destination.count).toBe(5);
    expect(quickbar.resolve(0, inventory)).toBeUndefined();
    expect(quickbar.snapshotState(inventory)[0]).toBeNull();
  });

  it('retains a binding when consumption leaves part of its stack alive', () => {
    const { inventory, quickbar } = runtime();
    const stack = inventory.create('rag', 3);
    expect(inventory.add(stack, { kind: 'hand', side: 'right' })).toBe(true);
    quickbar.assign(0, stack);
    expect(inventory.consume(stack)).toBe(true);
    expect(stack.count).toBe(2);
    expect(quickbar.resolve(0, inventory)).toBe(stack);
    expect(quickbar.snapshotState(inventory)[0]).toBe(stack.uid);
  });

  it('empties nested quickbar and light references when their worn container is removed', () => {
    const { inventory, quickbar, survival } = runtime();
    const bag = inventory.create('school_backpack');
    const { slot } = registry.items.get(bag.type)!.wearable!;
    const light = inventory.create('flashlight');
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    quickbar.assign(0, light);
    expect(survival.use(light)).toBeUndefined();
    expect(survival.lit).toBe(light);
    expect(inventory.move(light, { kind: 'pocket', owner: bag, pocket: 0 }).ok).toBe(true);
    expect(inventory.consume(bag)).toBe(true);
    expect(inventory.worn[slot]).toBeUndefined();
    expect(quickbar.resolve(0, inventory)).toBeUndefined();
    expect(quickbar.slots[0]).toBeNull();
    expect(survival.lit).toBeUndefined();
    inventory.piles.values = () => {
      throw new Error('An empty binding repeatedly searched the world');
    };
    expect(quickbar.snapshotState(inventory)[0]).toBeNull();
    expect(survival.snapshotState()).toEqual({});
  });

  it('keeps a battery binding when the queued swap fits that item into the light', () => {
    const { inventory, quickbar, survival, queue } = runtime();
    const light = inventory.create('flashlight');
    const battery = inventory.create('aa_battery');
    const oldBattery = light.slots?.battery;
    if (!oldBattery) {
      throw new Error('powered-light fixture has no fitted battery');
    }
    oldBattery.charges = 0.25;
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(battery, { kind: 'hand', side: 'right' })).toBe(true);
    quickbar.assign(0, battery);
    expect(survival.use(battery)).toBeUndefined();
    queue.tick(registry.items.get('flashlight')!.light!.power!.swapSimSeconds + 0.1);
    expect(inventory.itemByUid(battery.uid)).toBe(battery);
    expect(light.slots?.battery).toBe(battery);
    expect(quickbar.snapshotState(inventory)[0]).toBe(battery.uid);
    expect(chargeOf(registry, battery)).toBeGreaterThan(0.25);
  });

  it('keeps a binding through a move into a carried container', () => {
    const { inventory, quickbar } = runtime();
    const bag = inventory.create('school_backpack');
    const light = inventory.create('flashlight');
    expect(inventory.add(bag, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    quickbar.assign(0, light);
    expect(inventory.move(light, { kind: 'pocket', owner: bag, pocket: 0 }).ok).toBe(true);
    expect(quickbar.resolve(0, inventory)).toBe(light);
    expect(quickbar.snapshotState(inventory)[0]).toBe(light.uid);
  });

  it('clears a binding on every route that takes the item off the person', () => {
    const { inventory, quickbar } = runtime();
    const bag = inventory.create('school_backpack');
    const dropped = inventory.create('flashlight');
    const inBag = inventory.create('rag');
    expect(inventory.add(bag, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(dropped, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(inBag, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    quickbar.assign(0, dropped);
    quickbar.assign(1, inBag);
    quickbar.assign(2, bag);
    expect(inventory.move(dropped, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(quickbar.resolve(0, inventory)).toBeUndefined();
    // The bag's contents leave with the bag.
    expect(inventory.move(bag, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(quickbar.resolve(1, inventory)).toBeUndefined();
    expect(quickbar.resolve(2, inventory)).toBeUndefined();
    expect(quickbar.snapshotState(inventory).every((uid) => uid === null)).toBe(true);
  });

  it('refuses to assign an item that is not on the person and keeps the slot binding', () => {
    const { inventory, quickbar } = runtime();
    const held = inventory.create('flashlight');
    const onFloor = inventory.create('rag');
    expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(onFloor, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    quickbar.assign(0, held);
    const owners = { inventory, quickbar } as unknown as ReplayCommandOwners;
    const reason = applyReplayActionPayload({ kind: 'inventory.assign', slot: 0, itemUid: onFloor.uid }, owners);
    expect(reason).toBeTruthy();
    expect(quickbar.resolve(0, inventory)).toBe(held);
    expect(quickbar.snapshotState(inventory)).not.toContain(onFloor.uid);
  });

  it('restores a saved binding to an item no longer on the person as empty', () => {
    const { inventory, quickbar } = runtime();
    const carried = inventory.create('rag');
    const onGround = inventory.create('flashlight');
    expect(inventory.add(carried, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(onGround, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    quickbar.restoreState([onGround.uid, carried.uid, 99, null, null], inventory);
    expect(quickbar.slots).toEqual([null, carried.uid, null, null, null]);
  });

  it('refuses a dangling saved light reference rather than repairing it', () => {
    const { survival } = runtime();
    expect(() => survival.restoreState({ litUid: 99 })).toThrow('Missing saved light item 99');
  });
});
