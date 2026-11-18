import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { type FurnitureMover, removeFurniture } from '@skelly/engine/internal/core/furnitureMove.ts';
import { savedItemTree } from '@skelly/engine/internal/core/itemTree.ts';
import { Inventory } from '@skelly/engine/inventory';
import { decodeSave, type SaveContentQuery } from '@skelly/engine/save';
import { BlockEntities, type BlockEntity } from '@skelly/engine/world';
import { contentLookup as lookupSaveContent } from '@skelly/presentation/ui';
import { describe, expect, it } from 'vitest';
import { baseRegistryWith, overlayContent } from './baseRegistry.ts';
import { fixtureSources } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const PART = 'fixture_housed_part';
const SPARE = 'fixture_housed_spare';
const ODD = 'fixture_housed_odd';
const HOUSING = 'fixture_housing';
const VEHICLE_HOUSING = 'fixture_vehicle_part_housing';
const SEED = 41;
const item = (id: string) => ({ id, name: 'Fixture part', category: 'material', size: [1, 1], weight: 1 });
const housingFurniture = (id: string) => ({
  id,
  name: 'Fixture housing',
  size: [1, 1, 1],
  color: '#777777',
  takeApart: { parts: id },
});
const fixtureRegistry = baseRegistryWith(
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
        furniture: [housingFurniture(HOUSING)],
      },
    },
  ]),
);
// A housing that takes any vehicle part, so a part can sit in a slot while a vehicle site would also take it.
const registry = overlayContent(
  fixtureRegistry,
  fixtureSources([
    {
      source: 'housing-vehicle-part-fixture',
      data: {
        partBlueprints: [
          {
            id: VEHICLE_HOUSING,
            slots: [
              {
                id: 'part',
                accepts: [...fixtureRegistry.items.values()].filter(({ vehicle }) => vehicle).map(({ id }) => id),
              },
            ],
          },
        ],
        furniture: [housingFurniture(VEHICLE_HOUSING)],
      },
    },
  ]),
);
const contentLookup = (...query: SaveContentQuery): boolean => lookupSaveContent(registry, ...query);

const place = (inventory: Inventory, x: number, type = HOUSING): BlockEntity => {
  const entity = inventory.entities.add({ type, pos: [x, 0, 0], size: [1, 1, 1], facing: 'n' });
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

  it('refuses to read a baseline part without a world seed rather than drawing one a save would not carry', () => {
    const inventory = new Inventory(registry, undefined, new BlockEntities(registry));
    const housing = place(inventory, 2);
    expect(() => inventory.entities.housingView(housing)).toThrow('world seed');
  });

  it('keeps a removed part removed and a fitted part fitted across a save and reload', async () => {
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
    const spare = runtime.inventory.create(SPARE, 1, 0.25);
    expect(runtime.inventory.add(spare, output)).toBeTruthy();
    expect(
      runtime.inventory.housingTransfer({ kind: 'fit', entityUid: housing.uid, slot: 'open', itemUid: spare.uid }),
    ).toBe(undefined);

    const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
    const restored = createRuntime(decoded.snapshot, false, undefined, { registry });
    const reloaded = restored.inventory.entities.byUid(housing.uid)!;
    expect(slotPart(restored.inventory, reloaded, 'first')).toBeUndefined();
    expect(slotPart(restored.inventory, reloaded, 'second')).toEqual(kept);
    expect(slotPart(restored.inventory, reloaded, 'open')).toEqual({ type: SPARE, condition: 0.25, uid: spare.uid });
    expect(owners(restored.inventory, removed.uid)).toEqual(['pile']);
    expect(owners(restored.inventory, spare.uid)).toEqual(['housing']);
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

  it('refuses to install a housed part on a vehicle, leaving both owners as they were', () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    const { inventory } = runtime;
    inventory.canReach = () => true;
    inventory.canReachVehicle = () => true;
    const [x, y, z] = runtime.player.body.pos;
    const blueprint = [...registry.vehicleBlueprints.keys()][0]!;
    const id = inventory.registerVehicle({
      placementKey: 'fixture.housed',
      blueprint,
      origin: [x + 1, y, z],
      facing: 'n',
    });
    const output = {
      kind: 'pile' as const,
      pos: [Math.floor(x), Math.floor(y), Math.floor(z)] as [number, number, number],
    };
    // The first part its vehicle gives up; a refused removal changes nothing, so only that one leaves.
    const site = inventory.vehicles.get(id)!.fittings.find(
      (fitting) =>
        inventory.vehicleTransfer({
          kind: 'remove',
          vehicleId: id,
          fittingId: fitting.id,
          itemUid: fitting.item.uid,
          placement: fitting,
          output,
        }) === undefined,
    )!;
    const housing = place(inventory, 3, VEHICLE_HOUSING);
    const part = site.item;
    expect(inventory.housingTransfer({ kind: 'fit', entityUid: housing.uid, slot: 'part', itemUid: part.uid })).toBe(
      undefined,
    );
    // The site itself would take the part, so only its housed source can refuse the install.
    expect(inventory.vehiclePlacementRefusal(id, site, part.uid)).toBeUndefined();
    const before = { items: inventory.snapshotState(), vehicles: inventory.vehicles.snapshotState() };

    const refusal = inventory.vehicleTransfer({
      kind: 'install',
      vehicleId: id,
      fittingId: site.id,
      itemUid: part.uid,
      placement: site,
    });
    expect(refusal).toBe(coreMessage(registry, 'fitted'));
    expect({ items: inventory.snapshotState(), vehicles: inventory.vehicles.snapshotState() }).toEqual(before);
    expect(owners(inventory, part.uid)).toEqual(['housing']);
  });

  it('refuses to take a housing out of the world while it holds a part, baseline or fitted', () => {
    const { inventory, near, far } = world();
    const before = inventory.snapshotState();
    const { next } = inventory.factory;
    expect(inventory.entities.removalRefusal(far)).toEqual(expect.any(String));
    expect(() => inventory.entities.remove(far)).toThrow();
    expect(inventory.entities.byUid(far.uid)).toBe(far);
    expect(inventory.snapshotState()).toEqual(before);
    expect(inventory.factory.next).toBe(next);

    const output = { kind: 'pile' as const, pos: [2, 0, 1] as [number, number, number] };
    for (const slot of ['first', 'second']) {
      expect(inventory.housingTransfer({ kind: 'remove', entityUid: near.uid, slot, output })).toBe(undefined);
    }
    const spare = held(inventory, SPARE);
    expect(inventory.housingTransfer({ kind: 'fit', entityUid: near.uid, slot: 'open', itemUid: spare.uid })).toBe(
      undefined,
    );
    expect(() => inventory.entities.remove(near)).toThrow();
    const mover: FurnitureMover = {
      inventory,
      terrainSolid: () => false,
      blockSize: 1,
      player: { pos: [-10, 0, -10], vel: [0, 0, 0], halfWidth: 0.4, height: 1.8, onGround: true },
      others: [],
      stamina: 1,
    };
    expect(removeFurniture(mover, near)).toEqual(expect.any(String));
    expect(inventory.entities.byUid(near.uid)).toBe(near);
    expect(owners(inventory, spare.uid)).toEqual(['housing']);

    expect(
      inventory.housingTransfer({
        kind: 'remove',
        entityUid: near.uid,
        slot: 'open',
        output: { kind: 'hand', side: 'right' },
      }),
    ).toBe(undefined);
    expect(removeFurniture(mover, near)).toBeUndefined();
    expect(inventory.entities.byUid(near.uid)).toBeUndefined();
  });
});
