import { describe, expect, it } from 'vitest';
import { foodMillisecondsAt, spoilage } from '../src/core/food.ts';
import { restoreItem, snapshotItem } from '../src/core/items.ts';
import { savedItemTree } from '../src/core/itemTree.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { fixtureFood, foodFixtureRegistry } from './foodFixture.ts';
import { registry as base, capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const registry = foodFixtureRegistry(base);
const lookup = (kind: Parameters<typeof contentLookup>[1], id: string, item?: Parameters<typeof contentLookup>[3]) =>
  contentLookup(registry, kind, id, item);

const savedFood = (snapshot: Readonly<SaveSnapshot>) =>
  [...savedItemTree(snapshot.character.inventory, snapshot.world.vehicles)].find(
    ({ item }) => item.type === fixtureFood.id,
  )!.item;

const fixture = () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, start: 123.125 });
  const item = restoreItem(registry, {
    ...snapshotItem(runtime.inventory.create(fixtureFood.id, 3)),
    foodExposure: { gameMilliseconds: 2, remainder: 37, settledAtGameMilliseconds: 0 },
  });
  if (!runtime.inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error('Food save fixture did not fit');
  }
  return { runtime, item };
};

describe('saved food exposure', () => {
  it('settles and isolates the snapshot, then encodes, decodes and restores its exact history', async () => {
    const { runtime, item } = fixture();
    const snapshot = capture(runtime);
    const at = foodMillisecondsAt(runtime.sim.calendar);
    const saved = savedFood(snapshot);
    expect(saved.foodExposure!.settledAtGameMilliseconds).toBe(at);
    expect(saved.foodExposure!.gameMilliseconds).toBe(at + 2);
    expect(saved.foodExposure!.remainder).toBe(37);
    expect(item.foodExposure).toEqual({ gameMilliseconds: 2, remainder: 37, settledAtGameMilliseconds: 0 });
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup: lookup });
    const restored = createRuntime(decoded.snapshot, false, runtime.columns, {
      registry,
      start: runtime.sim.clock.start,
    });
    const food = restored.inventory.itemByUid(item.uid)!;
    expect(food.foodExposure).toEqual(saved.foodExposure);
    expect(spoilage(fixtureFood, food, restored.sim.calendar + 1)).toBe(
      spoilage(fixtureFood, item, runtime.sim.calendar + 1),
    );
    expect(savedFood(capture(restored)).foodExposure).toEqual(saved.foodExposure);
  });

  it('refuses a missing age or an age on an empty vessel at decode content validation', async () => {
    const { runtime } = fixture();
    const saved = structuredClone(capture(runtime));
    Reflect.deleteProperty(savedFood(saved), 'foodExposure');
    await expect(
      decodeSave(await encodeFixture(saved), { version: formatVersion, contentLookup: lookup }),
    ).rejects.toThrow('food exposure');
    const empty = structuredClone(capture(runtime));
    savedFood(empty).type = 'fixture_empty';
    await expect(
      decodeSave(await encodeFixture(empty), { version: formatVersion, contentLookup: lookup }),
    ).rejects.toThrow('food exposure');
  });

  it.each([
    { label: 'future', field: 'settledAtGameMilliseconds', value: Number.MAX_SAFE_INTEGER },
    { label: 'stale', field: 'settledAtGameMilliseconds', value: 0 },
    { label: 'negative', field: 'gameMilliseconds', value: -1 },
    { label: 'unsafe', field: 'gameMilliseconds', value: Number.MAX_SAFE_INTEGER + 1 },
    { label: 'remainder', field: 'remainder', value: 1_000_000 },
  ] as const)('refuses $label wire age before restoring owners', async ({ field, value }) => {
    const { runtime } = fixture();
    const saved = structuredClone(capture(runtime));
    savedFood(saved).foodExposure![field] = value;
    await expect(encodeFixture(saved)).rejects.toThrow();
  });
});
