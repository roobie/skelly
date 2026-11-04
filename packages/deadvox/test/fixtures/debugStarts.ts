import type { Registry } from '../../src/core/content.ts';
import { firearmSlotIds } from '../../src/core/firearmFitting.ts';
import type { Inventory } from '../../src/core/inventory.ts';
import { defOf, type Item } from '../../src/core/items.ts';
import { magazineSpec } from '../../src/core/magazine.ts';
import type { StartDef, StartKitEntry } from '../../src/core/schema/starts.ts';

export const fixtureStart = (kit: StartKitEntry[], site = 'testHouse'): StartDef => ({
  id: 'fixture_start',
  site,
  kit,
  wounds: [],
  skills: {},
  recipes: [],
});

const backpack: StartKitEntry = { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } };
const packed = (id: string, item: string, count = 1): StartKitEntry => ({
  id,
  item,
  count,
  destination: { kind: 'pocket', parent: 'backpack', pocket: 0 },
});

export const pumpStart = (): StartDef =>
  fixtureStart([
    backpack,
    { id: 'firearm', item: 'pump_shotgun', destination: { kind: 'hand', role: 'dominant' } },
    packed('box', 'shotshell_box'),
    packed('rounds', 'shell_12_gauge_00_buck', 20),
  ]);

export const fitFixtureOptic = (inventory: Inventory, firearm: Item, type: string): void => {
  for (const [slot, child] of Object.entries(firearm.slots ?? {})) {
    if (
      child &&
      inventory.registry.models.get(defOf(inventory.registry, child.type).model ?? '')?.gun?.attachment?.kind ===
        'optic'
    ) {
      inventory.fitSlot(firearm, slot, undefined);
    }
  }
  for (const slot of firearmSlotIds(inventory.registry, defOf(inventory.registry, firearm.type))) {
    try {
      inventory.fitSlot(firearm, slot, inventory.create(type));
      return;
    } catch {
      // The ordinary fitter rejects incompatible stations without changing the parent.
    }
  }
  throw new Error('Fixture needs a certified optic station');
};

export const shortFirearmStart = (registry: Registry, site?: string): StartDef =>
  fixtureStart(
    [
      backpack,
      { id: 'firearm', item: 'pistol_service', destination: { kind: 'hand', role: 'dominant' } },
      {
        id: 'magazine',
        item: 'magazine_pistol_9',
        cartridges: Array.from(
          { length: magazineSpec(registry, 'magazine_pistol_9')!.capacity },
          () => 'cartridge_9x19',
        ),
        destination: { kind: 'slot', parent: 'firearm', slot: 'magazine' },
      },
      packed('rounds', 'cartridge_9x19', registry.items.get('cartridge_9x19')!.stack),
    ],
    site,
  );
