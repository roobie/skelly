import type { ItemDef, Registry } from '../../src/core/content.ts';
import { firearmSlotIds } from '../../src/core/firearmFitting.ts';
import type { Inventory } from '../../src/core/inventory.ts';
import { defOf, type Item } from '../../src/core/items.ts';

export const debugStartWith = (registry: Registry, accepts: (item: ItemDef) => boolean) => {
  const start = [...registry.starts.values()].find(
    (row) =>
      row.debugOnly &&
      row.kit.some((entry) => {
        const item = registry.items.get(entry.item);
        return entry.destination.kind === 'hand' && item && accepts(item);
      }),
  );
  if (!start) {
    throw new Error('Fixture requires an authored debug start with the requested held-item mechanism');
  }
  return start;
};

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

export const shortFirearmStart = (registry: Registry, site?: string) => {
  const start = [...registry.starts.values()].find(
    (row) =>
      row.debugOnly &&
      (site === undefined || row.site === site) &&
      row.kit.some(({ item }) => {
        const definition = registry.items.get(item);
        const model = registry.models.get(definition?.model ?? '');
        return (
          definition?.firearm && model?.hands?.support && !model.hands.butt && model.gun?.action?.triggerMode === 'semi'
        );
      }),
  );
  if (!start) {
    throw new Error('Fixture requires an authored debug start with a short semi-automatic firearm');
  }
  return start;
};
