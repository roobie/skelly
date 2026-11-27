import { batteryCapacityMicrojoules } from './battery.ts';
import type { Registry } from './content.ts';
import { defOf, type Item } from './items.ts';

/**
 * Sets how full an item starts, as a share of its own capacity, on whatever the item stores its level in. The
 * share keeps the author free of each holder's units, as condition does for wear.
 */
export const setInitialFill = (registry: Registry, item: Item, fill: number): void => {
  const def = defOf(registry, item.type);
  if (def.vessel) {
    const contents = def.vessel.initialContents;
    if (contents.kind === 'empty') {
      if (fill > 0) {
        throw new Error('an empty vessel has no liquid to fill it with');
      }
      return;
    }
    const volumeMicrolitres = Math.round(fill * def.vessel.capacityMicrolitres);
    item.liquidContents = volumeMicrolitres === 0 ? { kind: 'empty' } : { ...contents, volumeMicrolitres };
    return;
  }
  if (def.battery) {
    const microjoules = batteryCapacityMicrojoules(registry, item.type);
    if (microjoules === undefined) {
      item.charges = fill * def.battery.capacity;
    } else {
      item.batteryMicrojoules = Math.floor(fill * microjoules);
    }
    return;
  }
  const capacity = def.canister?.capacity ?? def.igniter?.capacity;
  if (capacity === undefined) {
    throw new Error('item holds no charge, fuel or liquid to fill');
  }
  item.charges = fill * capacity;
};
