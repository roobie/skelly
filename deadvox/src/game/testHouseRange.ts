import type { ItemDef, Registry } from '../core/content.ts';
import type { Rolled } from '../core/loot.ts';
import { ammoMatchesCalibre, firearmModelForType } from './firearmHandling.ts';

/** Add-ons join the debug range when the item schema defines either capability. */
export const isTestHouseRangeStockItem = (item: ItemDef): boolean =>
  item.firearm !== undefined || Object.hasOwn(item, 'mod') || Object.hasOwn(item, 'mount');

interface RangeSupply {
  item: string;
  count: number;
  condition: number;
}

/** Firearms, compatible loose ammunition, and any package that unpacks to that ammunition. */
export const testHouseRangeSupply = (registry: Registry): RangeSupply[] => {
  const items = [...registry.items.values()];
  const firearms = items.filter((item) => item.firearm !== undefined);
  const calibres = new Set(
    firearms
      .map((item) => firearmModelForType(item.id, registry)?.calibre)
      .filter((calibre): calibre is string => calibre !== undefined),
  );
  const stock = new Set(items.filter(isTestHouseRangeStockItem).map(({ id }) => id));
  const compatibleCalibres = [...calibres];

  for (const item of items) {
    if (compatibleCalibres.some((calibre) => ammoMatchesCalibre(item.id, calibre, registry))) {
      stock.add(item.id);
    }
    const unpacked = item.unpack && registry.items.get(item.unpack.item);
    if (unpacked && compatibleCalibres.some((calibre) => ammoMatchesCalibre(unpacked.id, calibre, registry))) {
      stock.add(item.id);
    }
  }

  return [...stock].sort().map((item) => ({ item, count: 1, condition: 1 }));
};

export const testHouseRangeStock = (registry: Registry): Rolled[] =>
  testHouseRangeSupply(registry).map(({ item, count, condition }) => ({ type: item, count, condition }));
