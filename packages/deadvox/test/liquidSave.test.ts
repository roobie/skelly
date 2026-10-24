import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/core/content.ts';
import { type ItemState, restoreItem, snapshotItem } from '../src/core/items.ts';
import { savedItemTree } from '../src/core/itemTree.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { simSeconds } from '../src/core/time.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { registry as base, capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const vessel: ItemDef = {
  id: 'fixture_vessel',
  name: 'Fixture vessel',
  category: 'tool',
  weight: 1,
  size: [1, 1],
  workInProgress: false,
  notLoot: false,
  economy: { usage: [], tiers: [] },
  vessel: {
    capacityMicrolitres: 8000,
    accepts: ['fixture_liquid'],
    initialContents: { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: 7000 },
  },
};
const bag: ItemDef = {
  ...vessel,
  id: 'fixture_bag',
  vessel: undefined,
  container: { rigid: true, pockets: [{ grid: [4, 4], handlingSimSeconds: simSeconds(0.1) }] },
};
const registry = {
  ...base,
  items: new Map(base.items)
    .set(vessel.id, vessel)
    .set(bag.id, bag)
    .set('fixture_outer', { ...bag, id: 'fixture_outer', container: { ...bag.container!, rigid: false } }),
  liquids: new Map(base.liquids)
    .set('fixture_liquid', { id: 'fixture_liquid', name: 'Fixture liquid', densityGramsPerMillilitre: 1 })
    .set('fixture_other', { id: 'fixture_other', name: 'Other liquid', densityGramsPerMillilitre: 2 }),
};
const lookup = (kind: Parameters<typeof contentLookup>[1], id: string, item?: ItemState) =>
  contentLookup(registry, kind, id, item);
const savedVessel = (snapshot: Readonly<SaveSnapshot>) =>
  [...savedItemTree(snapshot.character.inventory, snapshot.world.vehicles)].find(({ item }) => item.type === vessel.id)!
    .item;
const fixture = () => {
  const runtime = createRuntime(undefined, false, undefined, { registry });
  if (!runtime.inventory.move(runtime.inventory.hands.right!, { kind: 'worn' }).ok) {
    throw new Error('Could not free fixture hand');
  }
  const item = runtime.inventory.create(vessel.id);
  if (!runtime.inventory.add(item, { kind: 'hand', side: 'right' })) {
    throw new Error('Fixture admission failed');
  }
  return { runtime, item };
};

describe('saved liquid vessels', () => {
  it('isolates snapshots and restores without sharing or refilling an emptied instance', () => {
    const { runtime } = fixture();
    const item = restoreItem(registry, snapshotItem(runtime.inventory.hands.right!));
    const first = snapshotItem(item);
    if (item.liquidContents?.kind !== 'filled') {
      throw new Error('Expected filled fixture');
    }
    item.liquidContents.volumeMicrolitres -= 1;
    expect(first.liquidContents).toEqual(vessel.vessel!.initialContents);
    item.liquidContents = { kind: 'empty' };
    expect(Object.isFrozen(item.liquidContents)).toBe(false);
    const empty = snapshotItem(item);
    const restored = restoreItem(registry, empty);
    expect(restored.uid).toBe(item.uid);
    expect(restored.liquidContents).toEqual({ kind: 'empty' });
    expect(restored.liquidContents).not.toBe(empty.liquidContents);
    const again = snapshotItem(restored);
    expect(again).toEqual(empty);
    expect(again.liquidContents).not.toBe(empty.liquidContents);
  });

  it('round-trips partial hand, nested empty pocket and ground vessels through the save wire', async () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    const { inventory } = runtime;
    expect(inventory.move(inventory.hands.right!, { kind: 'worn' }).ok).toBe(true);
    const item = inventory.create(vessel.id);
    const partial = restoreItem(registry, {
      ...snapshotItem(item),
      liquidContents: {
        kind: 'filled',
        liquid: 'fixture_liquid',
        volumeMicrolitres: 2345,
      },
    });
    expect(inventory.add(partial, { kind: 'hand', side: 'right' })).toBe(true);
    const outer = inventory.create('fixture_outer');
    const inner = inventory.create(bag.id);
    const empty = restoreItem(registry, {
      ...snapshotItem(inventory.create(vessel.id)),
      liquidContents: { kind: 'empty' },
    });
    const ground = inventory.create(vessel.id);
    expect(inventory.add(empty, { kind: 'pocket', owner: inner, pocket: 0 })).toBe(true);
    expect(inventory.add(inner, { kind: 'pocket', owner: outer, pocket: 0 })).toBe(true);
    expect(inventory.add(outer, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.add(ground, { kind: 'pile', pos: [1, 0, 0] })).toBe(true);
    const snapshot = capture(runtime);
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup: lookup });
    const restored = createRuntime(decoded.snapshot, false, runtime.columns, {
      registry,
      start: runtime.sim.clock.start,
    });
    for (const original of [partial, empty, ground]) {
      const copy = restored.inventory.itemByUid(original.uid)!;
      expect(copy).toBeDefined();
      expect(snapshotItem(copy)).toEqual(snapshotItem(original));
      expect(copy.liquidContents).not.toBe(original.liquidContents);
    }
    expect(restored.inventory.hands.right!.uid).toBe(partial.uid);
    expect(restored.inventory.locate(restored.inventory.itemByUid(empty.uid)!)).toMatchObject({
      kind: 'pocket',
      owner: { uid: inner.uid },
    });
    expect(restored.inventory.locate(restored.inventory.itemByUid(ground.uid)!)).toMatchObject({ kind: 'pile' });
    expect(capture(restored).character.inventory).toEqual(snapshot.character.inventory);
  });

  it.each([
    ['missing', undefined],
    ['unknown liquid', { kind: 'filled', liquid: 'missing', volumeMicrolitres: 1 }],
    ['incompatible liquid', { kind: 'filled', liquid: 'fixture_other', volumeMicrolitres: 1 }],
    ['over capacity', { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: 8001 }],
    ['zero', { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: 0 }],
    ['negative', { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: -1 }],
    ['fractional', { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: 0.5 }],
    ['unsafe', { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: Number.MAX_SAFE_INTEGER + 1 }],
    ['nonfinite', { kind: 'filled', liquid: 'fixture_liquid', volumeMicrolitres: Number.POSITIVE_INFINITY }],
    ['ambiguous empty', { kind: 'empty', volumeMicrolitres: 0 }],
  ])('refuses %s contents at restore and save admission', async (_label, contents) => {
    const { runtime } = fixture();
    const snapshot = structuredClone(capture(runtime));
    const saved = savedVessel(snapshot);
    if (contents === undefined) {
      Reflect.deleteProperty(saved, 'liquidContents');
    } else {
      Reflect.set(saved, 'liquidContents', contents);
    }
    expect(() => restoreItem(registry, saved)).toThrow('liquid contents');
    await expect(
      (async () => decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup: lookup }))(),
    ).rejects.toThrow();
  });

  it.each(['stacked', 'non-vessel', 'duplicate-charge'])('refuses %s mechanism state', async (kind) => {
    const { runtime } = fixture();
    const snapshot = structuredClone(capture(runtime));
    const saved = savedVessel(snapshot);
    if (kind === 'stacked') {
      saved.count = 2;
    } else if (kind === 'non-vessel') {
      saved.type = bag.id;
    } else {
      saved.charges = 1;
    }
    expect(() => restoreItem(registry, saved)).toThrow('liquid contents');
    await expect(
      decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup: lookup }),
    ).rejects.toThrow('liquid contents');
  });
});
