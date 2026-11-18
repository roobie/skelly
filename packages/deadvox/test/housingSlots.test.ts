import { savedItemTree } from '@skelly/engine/internal/core/itemTree.ts';
import { Inventory } from '@skelly/engine/inventory';
import { decodeSave, type SaveContentQuery } from '@skelly/engine/save';
import { BlockEntities, type BlockEntity } from '@skelly/engine/world';
import { contentLookup as lookupSaveContent } from '@skelly/presentation/ui';
import { describe, expect, it } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { fixtureSources } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const PART = 'fixture_housed_part';
const SPARE = 'fixture_housed_spare';
const ODD = 'fixture_housed_odd';
const HOUSING = 'fixture_housing';
const SEED = 41;
const item = (id: string) => ({ id, name: 'Fixture part', category: 'material', size: [1, 1], weight: 1 });
const registry = baseRegistryWith(
  fixtureSources([
    {
      source: 'housing-slots-fixture',
      data: {
        items: [item(PART), item(SPARE), item(ODD)],
        partBlueprints: [
          {
            id: HOUSING,
            slots: [
              { id: 'first', accepts: [PART, SPARE], initial: { item: PART, condition: [0.3, 0.9] } },
              { id: 'second', accepts: [PART], initial: { item: PART, condition: [0.3, 0.9] } },
              { id: 'open', accepts: [PART, SPARE] },
            ],
          },
        ],
        furniture: [
          { id: HOUSING, name: 'Fixture housing', size: [1, 1, 1], color: '#777777', takeApart: { parts: HOUSING } },
        ],
      },
    },
  ]),
);
const contentLookup = (...query: SaveContentQuery): boolean => lookupSaveContent(registry, ...query);

const place = (inventory: Inventory, x: number): BlockEntity => {
  const entity = inventory.entities.add({ type: HOUSING, pos: [x, 0, 0], size: [1, 1, 1], facing: 'n' });
  if (!entity) {
    throw new Error('Fixture housing did not place');
  }
  return entity;
};
const world = () => {
  const inventory = new Inventory(registry, undefined, new BlockEntities(registry, SEED));
  return { inventory, near: place(inventory, 2), far: place(inventory, 5) };
};
const slotPart = (inventory: Inventory, entity: BlockEntity, slot: string) =>
  inventory.entities.housingView(entity).find((view) => view.slot === slot)?.part;
const owners = (inventory: Inventory, uid: number) =>
  [...inventory.items()].filter((entry) => entry.item.uid === uid).map(({ location }) => location.kind);
const held = (inventory: Inventory, type: string) => {
  const part = inventory.create(type);
  if (!inventory.add(part, { kind: 'hand', side: 'right' })) {
    throw new Error('Fixture part did not reach the hand');
  }
  return part;
};

describe('housing slots', () => {
  it('reads baselines without changing a snapshot or the next item id, in any read order', () => {
    const read = world();
    const unread = world();
    const before = read.inventory.snapshotState();
    const views = [read.far, read.near, read.far].map((entity) => read.inventory.entities.housingView(entity));
    expect(views[0]!.filter(({ part }) => part)).toHaveLength(2);
    expect(read.inventory.entities.housingView(read.far)).toEqual(unread.inventory.entities.housingView(unread.far));
    expect(read.inventory.snapshotState()).toEqual(before);
    expect(read.inventory.snapshotState()).toEqual(unread.inventory.snapshotState());
    expect(read.inventory.create(PART).uid).toBe(unread.inventory.create(PART).uid);
  });

  it('keeps a removed part removed across a save and reload, without regenerating the slot', async () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    runtime.inventory.canReach = () => true;
    const housing = place(runtime.inventory, 3);
    const baseline = slotPart(runtime.inventory, housing, 'first')!;
    const kept = slotPart(runtime.inventory, housing, 'second');
    const output = { kind: 'pile' as const, pos: [3, 0, 1] as [number, number, number] };
    expect(runtime.inventory.housingTransfer({ kind: 'remove', entityUid: housing.uid, slot: 'first', output })).toBe(
      undefined,
    );
    const removed = [...runtime.inventory.items()].find((entry) => entry.item.type === PART)!.item;
    expect({ type: removed.type, condition: removed.condition }).toEqual(baseline);

    const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
    const restored = createRuntime(decoded.snapshot, false, undefined, { registry });
    const reloaded = restored.inventory.entities.byUid(housing.uid)!;
    expect(slotPart(restored.inventory, reloaded, 'first')).toBeUndefined();
    expect(slotPart(restored.inventory, reloaded, 'second')).toEqual(kept);
    expect(owners(restored.inventory, removed.uid)).toEqual(['pile']);
  });

  it('refuses a fit or a removal without changing either owner or allocating an item', () => {
    const { inventory, near } = world();
    const odd = held(inventory, ODD);
    const before = inventory.snapshotState();
    const { next } = inventory.factory;
    const refusals = [
      inventory.housingTransfer({ kind: 'fit', entityUid: near.uid, slot: 'open', itemUid: odd.uid }),
      inventory.housingTransfer({ kind: 'fit', entityUid: near.uid, slot: 'first', itemUid: odd.uid }),
      inventory.housingTransfer({
        kind: 'remove',
        entityUid: near.uid,
        slot: 'first',
        output: { kind: 'hand', side: 'right' },
      }),
    ];
    expect(refusals.every((reason) => typeof reason === 'string')).toBe(true);
    expect(inventory.snapshotState()).toEqual(before);
    expect(inventory.factory.next).toBe(next);
  });

  it('leaves an accepted part with exactly one owner, out of the slot or into it', () => {
    const { inventory, near } = world();
    expect(
      inventory.housingTransfer({
        kind: 'remove',
        entityUid: near.uid,
        slot: 'first',
        output: { kind: 'hand', side: 'left' },
      }),
    ).toBe(undefined);
    const taken = inventory.hands.left!;
    expect(owners(inventory, taken.uid)).toEqual(['hand']);
    expect(slotPart(inventory, near, 'first')).toBeUndefined();

    const spare = held(inventory, SPARE);
    expect(inventory.housingTransfer({ kind: 'fit', entityUid: near.uid, slot: 'open', itemUid: spare.uid })).toBe(
      undefined,
    );
    expect(owners(inventory, spare.uid)).toEqual(['housing']);
    const saved = [...savedItemTree(inventory.snapshotState(), { nextId: 1, instances: [] })];
    expect(saved.filter((entry) => entry.item.uid === spare.uid)).toHaveLength(1);
    expect(slotPart(inventory, near, 'open')?.uid).toBe(spare.uid);
  });
});
