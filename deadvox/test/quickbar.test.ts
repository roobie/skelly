import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { BATTERY_SWAP } from '../src/core/lights.ts';
import { bindReach } from '../src/core/reach.ts';
import { Simulation } from '../src/core/sim.ts';
import { Quickbar } from '../src/game/quickbar.ts';
import { Survival } from '../src/game/survival.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const runtime = () => {
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const survival = new Survival(new Simulation({ seed: 1 }), inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1 }),
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

  it('empties a battery binding after the actual queued swap consumes it', () => {
    const { inventory, quickbar, survival, queue } = runtime();
    const light = inventory.create('flashlight');
    const battery = inventory.create('aa_battery');
    light.charges = 0.25;
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(battery, { kind: 'hand', side: 'right' })).toBe(true);
    quickbar.assign(0, battery);
    expect(survival.use(battery)).toBeUndefined();
    queue.tick(BATTERY_SWAP + 0.1);
    expect(inventory.itemByUid(battery.uid)).toBeUndefined();
    expect(quickbar.snapshotState(inventory)[0]).toBeNull();
    expect(light.charges).toBeGreaterThan(0.25);
  });

  it('retains the same binding through a drop and a move into a container', () => {
    const { inventory, quickbar } = runtime();
    const bag = inventory.create('school_backpack');
    const light = inventory.create('flashlight');
    expect(inventory.add(bag, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
    quickbar.assign(0, light);
    expect(inventory.move(light, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(quickbar.resolve(0, inventory)).toBe(light);
    expect(inventory.hands.left).toBeUndefined();
    expect(inventory.move(light, { kind: 'pocket', owner: bag, pocket: 0 }).ok).toBe(true);
    expect(quickbar.resolve(0, inventory)).toBe(light);
    expect(quickbar.snapshotState(inventory)[0]).toBe(light.uid);
  });

  it('refuses dangling saved quickbar and light references rather than repairing them', () => {
    const { inventory, quickbar, survival } = runtime();
    expect(() => quickbar.restoreState([99, null, null, null, null], inventory)).toThrow('Missing quickbar item 99');
    expect(() => survival.restoreState({ litUid: 99 })).toThrow('Missing saved light item 99');
  });
});
