import { buildRegistry, validateContent } from '@skelly/engine/content';
import { inventoryPocket, pocketGroundItem } from '@skelly/engine/internal/core/options.ts';
import { wornFigureFit } from '@skelly/engine/internal/core/wornFigure.ts';
import { claimed, HandlingQueue, Inventory, isLongGun, SLING_SLOT } from '@skelly/engine/inventory';
import { describe, expect, it } from 'vitest';
import { startupContentSources } from './baseContentFiles.ts';
import { baseRegistry, baseRegistryWith } from './baseRegistry.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const slot = {
  id: 'fixture_cuff',
  label: 'Fixture cuff',
  attachmentFrames: ['right_cuff'],
  inventory: { visibility: 'occupied', order: 5 },
  selfView: 'frame',
};

const garment = {
  id: 'fixture_cuff_item',
  name: 'Fixture cuff item',
  category: 'clothing',
  size: [1, 1],
  weight: 10,
  volumeCm3: 10,
  workInProgress: false,
  wearable: { slot: slot.id, encumbrance: 0 },
};

const equipmentFixture = (providers: boolean) =>
  buildRegistry([
    playerInventorySource(),
    {
      source: 'equipment-fixture',
      data: {
        wearSlots: [
          { ...slot, id: 'fixture_inner', capability: providers ? ['underLayerFit'] : undefined },
          { ...slot, id: 'fixture_carry', capability: providers ? ['preferredCarry'] : undefined },
          { ...slot, id: 'fixture_competitor' },
        ],
        items: [
          {
            ...garment,
            id: 'fixture_inner_item',
            name: 'Inner layer',
            wearable: { slot: 'fixture_inner', encumbrance: 0, figureFit: providers ? 'fixture_cut' : undefined },
          },
          {
            ...garment,
            id: 'fixture_carry_item',
            name: 'Carry pouch',
            wearable: { slot: 'fixture_carry', encumbrance: 0 },
            container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 0 }] },
          },
          {
            ...garment,
            id: 'fixture_competing_bag',
            name: 'Other pouch',
            category: 'bag',
            wearable: { slot: 'fixture_competitor', encumbrance: 0 },
            container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 0 }] },
          },
          {
            id: 'fixture_stock',
            name: 'Fixture stock',
            workInProgress: false,
            category: 'tool',
            size: [1, 1],
            weight: 1,
          },
        ],
      },
    },
  ]);

describe('content-defined wear slots', () => {
  it('admits a slot definition without a code-owned slot id', () => {
    expect(validateContent({ source: 'fixture', data: { wearSlots: [slot] } })).toEqual([]);
  });

  it.each(['constructor', '__proto__'])('equips the valid slot id %s without inherited occupancy', (id) => {
    const registry = baseRegistryWith([
      {
        source: 'fixture',
        data: { wearSlots: [{ ...slot, id }], items: [{ ...garment, wearable: { slot: id, encumbrance: 0 } }] },
      },
    ]);
    const inventory = new Inventory(registry);
    const item = inventory.create(garment.id);
    expect(inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.move(item, { kind: 'worn' }).ok).toBe(true);
    expect(Object.getPrototypeOf(inventory.worn)).toBeNull();
    expect(inventory.worn[id]).toBe(item);
    const restored = Inventory.restoreState(registry, inventory.snapshotState());
    expect(restored.worn[id]?.uid).toBe(item.uid);
    expect(Object.getPrototypeOf(restored.worn)).toBeNull();
    expect(restored.worn.toString).toBeUndefined();
  });

  it('rejects a wearable referring to a missing slot', () => {
    const result = buildRegistry([{ source: 'fixture', data: { items: [garment] } }]);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'items[0].wearable.slot' })]),
    );
  });

  it('admits no unsupported, competing or mixed sling capability claims', () => {
    expect(
      validateContent({ source: 'fixture', data: { wearSlots: [{ ...slot, capability: ['imaginary'] }] } }),
    ).not.toEqual([]);
    expect(
      validateContent({
        source: 'fixture',
        data: { wearSlots: [{ ...slot, capability: ['slungLongGun', 'preferredCarry'] }] },
      }),
    ).not.toEqual([]);
    const { issues } = buildRegistry([
      {
        source: 'fixture',
        data: {
          wearSlots: [
            { ...slot, capability: ['headEquipment'] },
            { ...slot, id: 'fixture_second_head', capability: ['headEquipment'] },
          ],
        },
      },
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('competing claimants') })]),
    );
  });

  it('rejects unregistered frames and unauthorized root or non-default fitted-child frames', () => {
    const sling = [...baseRegistry().items.values()].find((item) => item.sling && item.figureModels?.length)!;
    expect(sling).toBeDefined();
    const figureEntry = { ...sling.figureModels![0]!, frame: 'head', covers: undefined };
    const { issues } = buildRegistry([
      ...startupContentSources(),
      {
        source: 'fixture',
        data: {
          wearSlots: [slot, { ...slot, id: 'fixture_missing_frame', attachmentFrames: ['fixture_absent_frame'] }],
          items: [
            { ...garment, figureModels: [figureEntry] },
            { ...sling, id: 'fixture_alternate_sling', figureModels: [figureEntry] },
          ],
        },
      },
    ]);
    const messages = issues.filter(({ source }) => source === 'fixture');
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'wearSlots[1].attachmentFrames[0]',
          message: expect.stringContaining('no frame'),
        }),
        expect.objectContaining({
          path: 'items[0].figureModels[0].frame',
          message: expect.stringContaining('not allowed'),
        }),
        expect.objectContaining({
          path: 'items[1].figureModels[0].frame',
          message: expect.stringContaining('not allowed'),
        }),
      ]),
    );
  });

  it.each([true, false])('selects an unfamiliar under-layer fit only with a provider: %s', (providers) => {
    const { registry, issues } = equipmentFixture(providers);
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('fixture_inner_item'), { kind: 'worn' })).toBe(true);
    expect(wornFigureFit(registry, inventory.worn)).toBe(providers ? 'fixture_cut' : undefined);
  });

  it.each([true, false])('uses unfamiliar carry pickup and pocket preference only with a provider: %s', (providers) => {
    const { registry, issues } = equipmentFixture(providers);
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    const competitor = inventory.create('fixture_competing_bag');
    expect(inventory.add(competitor, { kind: 'worn' })).toBe(true);
    const carry = inventory.create('fixture_carry_item');
    expect(inventory.add(carry, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const queue = new HandlingQueue(inventory);
    expect(pocketGroundItem(inventory, queue, carry)).toBeUndefined();
    queue.tick(queue.remaining);
    expect(inventory.locate(carry)?.kind).toBe(providers ? 'worn' : 'pocket');
    if (!providers) {
      expect(inventory.move(carry, { kind: 'worn' }).ok).toBe(true);
    }
    const loose = inventory.create('fixture_stock');
    expect(inventory.add(loose, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventoryPocket(inventory, loose)).toMatchObject({ kind: 'pocket', owner: providers ? carry : competitor });
  });

  it('stows a long gun through a substituted sling provider and refuses it when the provider is absent', () => {
    const registry = baseRegistry();
    const provider = claimed(registry.wearSlots, 'slungLongGun')!;
    registry.wearSlots.delete(provider.id);
    registry.wearSlots.set('fixture_gun_carry', { ...provider, id: 'fixture_gun_carry' });
    const gunDef = [...registry.items.values()].find(isLongGun)!;
    const sling = [...registry.items.values()].find((item) => item.sling)!;
    expect(gunDef).toBeDefined();
    expect(sling).toBeDefined();
    const inventory = new Inventory(registry);
    const gun = inventory.create(gunDef.id);
    inventory.fitSlot(gun, SLING_SLOT, inventory.create(sling.id));
    expect(inventory.add(gun, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const queue = new HandlingQueue(inventory);
    expect(pocketGroundItem(inventory, queue, gun)).toBeUndefined();
    queue.tick(queue.remaining);
    expect(inventory.worn.fixture_gun_carry).toBe(gun);
    expect(inventory.move(gun, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    registry.wearSlots.delete('fixture_gun_carry');
    expect(pocketGroundItem(inventory, queue, gun)).toEqual(expect.any(String));
    expect(inventory.move(gun, { kind: 'worn' }).ok).toBe(false);
  });

  it('rejects a persisted occupant under a slot other than its declared destination', () => {
    const registry = baseRegistryWith([{ source: 'fixture', data: { wearSlots: [slot], items: [garment] } }]);
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create(garment.id), { kind: 'worn' })).toBe(true);
    const state = structuredClone(inventory.snapshotState());
    state.worn.head = state.worn[slot.id];
    delete state.worn[slot.id];
    expect(() => Inventory.restoreState(registry, state)).toThrow('Invalid worn slot');
  });
});
