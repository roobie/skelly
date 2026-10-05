import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, type InventoryState } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import type { ItemDef } from '../src/core/schema.ts';
import { Simulation } from '../src/core/sim.ts';
import { QuickbarActions } from '../src/game/quickbarActions.ts';
import { Survival } from '../src/game/survival.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const definition = (predicate: (def: ItemDef) => boolean) => {
  for (const def of registry.items.values()) {
    if (predicate(def)) {
      return def;
    }
  }
  throw new Error('Missing fixture item definition');
};
const settle = (queue: HandlingQueue) => {
  while (queue.busy) {
    queue.tick(queue.remaining);
  }
};
const runtime = () => {
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const notices: string[] = [];
  const simulation = new Simulation({ seed: 1 });
  const survival = new Survival(simulation, inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1 }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: (text) => notices.push(text),
    read: () => {
      throw new Error('Unexpected reading in quickbar fixture');
    },
  });
  const actions = new QuickbarActions({
    inventory,
    queue,
    feet: () => [0, 0, 0],
    survival,
    notice: (text) => notices.push(text),
  });
  return { inventory, queue, survival, actions, notices };
};
const carryInBag = (inventory: Inventory, item: ReturnType<Inventory['create']>) => {
  const { size } = registry.items.get(item.type)!;
  const bagDef = definition(
    (def) =>
      Boolean(def.wearable) &&
      Boolean(
        def.container?.pockets.some(
          ({ grid }) => (grid[0] >= size[0] && grid[1] >= size[1]) || (grid[0] >= size[1] && grid[1] >= size[0]),
        ),
      ),
  );
  const bag = inventory.create(bagDef.id);
  if (!inventory.add(bag, { kind: 'worn' })) {
    throw new Error('Fixture bag could not be worn');
  }
  const pocket = bagDef.container!.pockets.find(
    ({ grid }) => (grid[0] >= size[0] && grid[1] >= size[1]) || (grid[0] >= size[1] && grid[1] >= size[0]),
  )!;
  return { bag, pocket: bagDef.container!.pockets.indexOf(pocket) };
};

describe('quickbar tap and hold actions', () => {
  it('taps a firearm into and out of the hand without invoking its action', () => {
    const { inventory, queue, actions, notices } = runtime();
    const gun = inventory.create(definition((def) => Boolean(def.firearm)).id);
    const { bag, pocket } = carryInBag(inventory, gun);
    expect(inventory.add(gun, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    const source = inventory.targetState(inventory.targetForLocation(inventory.locate(gun)!));
    const firearmBefore = structuredClone(gun.firearm);

    actions.tap(gun);
    settle(queue);
    expect(inventory.hands.right).toBe(gun);
    actions.tap(gun);
    settle(queue);

    expect(inventory.locate(gun)?.kind).toBe('pocket');
    const at = inventory.locate(gun)!;
    expect(inventory.targetState(inventory.targetForLocation(at))).toEqual(source);
    actions.hold(gun);
    expect(gun.firearm).toEqual(firearmBefore);
    expect(notices).toHaveLength(1);
  });

  it('uses pocket food in one queued job while the held weapon stays in place', () => {
    const { inventory, queue, actions } = runtime();
    const food = inventory.create(definition((def) => Boolean(def.food)).id);
    const { bag, pocket } = carryInBag(inventory, food);
    const weapon = inventory.create(definition((def) => Boolean(def.weapon || def.firearm)).id);
    expect(inventory.add(food, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    expect(inventory.add(weapon, { kind: 'hand', side: 'right' })).toBe(true);

    actions.hold(food);

    expect(queue.jobs).toHaveLength(1);
    expect(food.count).toBeGreaterThan(0);
    expect(inventory.hands.right).toBe(weapon);
    settle(queue);
    expect(inventory.itemByUid(food.uid)).toBeUndefined();
    expect(inventory.hands.right).toBe(weapon);
  });

  it('sends tools to the primary hand, lights off hand, and two-handed items to both', () => {
    const { inventory, queue, actions } = runtime();
    const light = inventory.create(definition((def) => Boolean(def.light)).id);
    const { bag, pocket } = carryInBag(inventory, light);
    expect(inventory.add(light, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    actions.tap(light);
    settle(queue);
    expect(inventory.hands.left).toBe(light);

    const tool = inventory.create(definition((def) => Boolean(def.tool)).id);
    expect(inventory.add(tool, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    actions.tap(tool);
    settle(queue);
    expect(inventory.hands.right).toBe(tool);
    expect(inventory.hands.left).toBe(light);

    const twoHanded = inventory.create(definition((def) => Boolean(def.twoHanded)).id);
    expect(inventory.add(twoHanded, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    actions.tap(twoHanded);
    settle(queue);
    expect(inventory.hands.right).toBe(twoHanded);
    expect(inventory.hands.left).toBeUndefined();
  });

  it('restores the captured source with the inventory snapshot', () => {
    const { inventory, queue, actions } = runtime();
    const item = inventory.create(definition((def) => Boolean(def.weapon)).id);
    const { bag, pocket } = carryInBag(inventory, item);
    expect(inventory.add(item, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    actions.tap(item);
    settle(queue);

    const restored = Inventory.restoreState(registry, structuredClone(inventory.snapshotState()) as InventoryState);
    expect(restored.snapshotState().quickbarOrigins).toEqual(inventory.snapshotState().quickbarOrigins);
  });
});
