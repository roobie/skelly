import { describe, expect, it } from 'vitest';
import {
  assertFoodExposure,
  foodMillisecondsAt,
  isRotten,
  projectFoodExposure,
  servingDef,
  settleFoodExposure,
  spoilage,
} from '../src/core/food.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ItemFactory, restoreItem, snapshotItem, stackRoom } from '../src/core/items.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureFood, foodFixtureRegistry } from './foodFixture.ts';

const registry = foodFixtureRegistry(baseRegistry());

describe('food exposure', () => {
  it('settles ambient spans exactly regardless of partition and includes the calendar origin once', () => {
    const factory = new ItemFactory();
    const authored = factory.create(registry, fixtureFood.id);
    const origin = 432_100.125;
    const at = foodMillisecondsAt(origin + 7.321);
    const one = projectFoodExposure(authored.foodExposure!, at);
    for (const boundary of [foodMillisecondsAt(origin), foodMillisecondsAt(origin + 0.001), at]) {
      settleFoodExposure(authored, boundary);
    }
    expect(authored.foodExposure).toEqual(one);
    expect(one.gameMilliseconds).toBe(at);
    expect(one.settledAtGameMilliseconds).toBe(at);
    const manufactured = factory.create(registry, fixtureFood.id, 1, { madeAt: origin });
    settleFoodExposure(manufactured, at);
    expect(manufactured.foodExposure!.gameMilliseconds).toBe(7321);
    expect(manufactured.madeAtGameTimestamp).toBe(origin);
  });

  it('splits per-unit exposure into independent payloads and only rejoins equal cohorts', () => {
    const factory = new ItemFactory();
    const stack = restoreItem(registry, {
      ...snapshotItem(factory.create(registry, fixtureFood.id, 4)),
      foodExposure: { gameMilliseconds: 0, remainder: 17, settledAtGameMilliseconds: 0 },
    });
    settleFoodExposure(stack, 1234);
    const part = factory.split(stack, 2);
    expect(part.foodExposure).toEqual(stack.foodExposure);
    expect(part.foodExposure).not.toBe(stack.foodExposure);
    expect(stackRoom(registry, stack, part)).toBeGreaterThan(0);
    settleFoodExposure(part, 2345);
    expect(stack.foodExposure!.settledAtGameMilliseconds).toBe(1234);
    expect(stackRoom(registry, stack, part)).toBeGreaterThan(0);
    const unequal = restoreItem(registry, {
      ...snapshotItem(part),
      uid: 99,
      foodExposure: { ...part.foodExposure!, gameMilliseconds: part.foodExposure!.gameMilliseconds + 1 },
    });
    expect(stackRoom(registry, stack, unequal)).toBe(0);
    const snap = snapshotItem(stack);
    const restored = restoreItem(registry, snap);
    expect(restored.foodExposure).toEqual(stack.foodExposure);
    expect(restored.foodExposure).not.toBe(snap.foodExposure);
  });

  it('starts an exposed serving at opening and clears it on emptying without rejuvenating repackaged food', () => {
    const inventory = new Inventory(registry);
    const vessel = inventory.create('fixture_sealed');
    expect(vessel.foodExposure).toBeUndefined();
    expect(inventory.add(vessel, { kind: 'hand', side: 'right' })).toBe(true);
    const queue = new HandlingQueue(inventory);
    const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0], { calendar: () => 100 });
    expect(unpacking.activate(vessel)).toBeUndefined();
    expect(queue.tick(1).failed).toEqual([]);
    expect(vessel.type).toBe('fixture_full');
    const food = servingDef(registry, registry.items.get(vessel.type)!);
    expect(spoilage(food, vessel, 110)).toBe(0.5);
    settleFoodExposure(vessel, foodMillisecondsAt(120));
    inventory.transform(vessel, fixtureFood.id, { kind: 'same' });
    expect(isRotten(fixtureFood, vessel, 120)).toBe(true);
    expect(vessel.madeAtGameTimestamp).toBe(100);
    inventory.transform(vessel, 'fixture_empty', { kind: 'remove' });
    expect(vessel.foodExposure).toBeUndefined();
    expect(vessel.madeAtGameTimestamp).toBeUndefined();
    assertFoodExposure(registry, vessel);
  });

  it('unpacks an already perishable cohort without refreshing any spilled output unit', () => {
    const inventory = new Inventory(registry);
    const wrapped = inventory.create('fixture_wrapped');
    expect(inventory.add(wrapped, { kind: 'hand', side: 'right' })).toBe(true);
    const before = structuredClone(wrapped.foodExposure);
    const queue = new HandlingQueue(inventory);
    const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0], { calendar: () => 100 });
    expect(unpacking.activate(wrapped)).toBeUndefined();
    expect(queue.tick(1).failed).toEqual([]);
    const outputs = [...inventory.items()].filter(({ item }) => item.type === fixtureFood.id);
    expect(outputs.reduce((count, { item }) => count + item.count, 0)).toBe(2);
    expect(inventory.itemByUid(wrapped.uid)).toBeUndefined();
    for (const { item } of outputs) {
      expect(item.foodExposure).toEqual(before);
      expect(isRotten(fixtureFood, item, 100)).toBe(true);
    }
  });

  it.each([
    undefined,
    { gameMilliseconds: -1, remainder: 0, settledAtGameMilliseconds: 0 },
    { gameMilliseconds: Number.MAX_SAFE_INTEGER + 1, remainder: 0, settledAtGameMilliseconds: 0 },
    { gameMilliseconds: 0, remainder: 1_000_000, settledAtGameMilliseconds: 0 },
    { gameMilliseconds: 0, remainder: 0, settledAtGameMilliseconds: -1 },
  ])('refuses missing or corrupt perishable exposure %#', (foodExposure) => {
    const item = new ItemFactory().create(registry, fixtureFood.id);
    const state = { ...snapshotItem(item), foodExposure };
    expect(() => restoreItem(registry, state)).toThrow('food exposure');
  });

  it('refuses exposure on a nonperishable item and backwards or overflowing settlement', () => {
    const factory = new ItemFactory();
    const keeps = factory.create(registry, 'fixture_keeps');
    expect(() =>
      restoreItem(registry, {
        ...snapshotItem(keeps),
        foodExposure: { gameMilliseconds: 0, remainder: 0, settledAtGameMilliseconds: 0 },
      }),
    ).toThrow('food exposure');
    expect(() => projectFoodExposure({ gameMilliseconds: 1, remainder: 0, settledAtGameMilliseconds: 2 }, 1)).toThrow();
    expect(() =>
      projectFoodExposure({ gameMilliseconds: Number.MAX_SAFE_INTEGER, remainder: 0, settledAtGameMilliseconds: 0 }, 1),
    ).toThrow();
  });
});
