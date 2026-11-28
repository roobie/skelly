// A consumable is what a device's consumable slot draws down: a battery, a gas cartridge. Its fill is in its own
// units; a rechargeable one also holds electric energy, which chargers move.

import type { Registry } from './content.ts';
import type { Item, ItemState } from './items.ts';

/** The slot id a device keeps its consumable under. */
export const CONSUMABLE_SLOT = 'consumable';

export const consumableFields = (item: ItemState): Pick<ItemState, 'charges' | 'batteryMicrojoules'> => ({
  ...(item.charges === undefined ? {} : { charges: item.charges }),
  ...(item.batteryMicrojoules === undefined ? {} : { batteryMicrojoules: item.batteryMicrojoules }),
});

export const consumableCharge = (registry: Registry, item: Item): number => {
  const consumable = registry.items.get(item.type)!.consumable!;
  return item.batteryMicrojoules !== undefined && consumable.rechargeable
    ? item.batteryMicrojoules / consumable.rechargeable.microjoulesPerCharge
    : (item.charges ?? consumable.capacity);
};

/** Draws `amount` of fill from `item`, never below empty; a rechargeable one gives up its energy to match. */
export const drawConsumable = (registry: Registry, item: Item, amount: number): void => {
  const { rechargeable } = registry.items.get(item.type)!.consumable!;
  if (rechargeable) {
    item.batteryMicrojoules = Math.max(
      0,
      batteryEnergy(registry, item) - Math.ceil(amount * rechargeable.microjoulesPerCharge),
    );
    item.charges = undefined;
  } else {
    item.charges = Math.max(0, consumableCharge(registry, item) - amount);
  }
};

/** Whether a consumable of `consumableType` fits the slot of a device of `deviceType`. */
export const consumableFits = (registry: Registry, deviceType: string, consumableType: string): boolean =>
  registry.items.get(deviceType)?.consumableSlot?.accepts.includes(consumableType) === true &&
  registry.items.get(consumableType)?.consumable !== undefined;

export const batteryCapacityMicrojoules = (registry: Registry, type: string): number | undefined => {
  const consumable = registry.items.get(type)?.consumable;
  return consumable?.rechargeable && consumable.capacity * consumable.rechargeable.microjoulesPerCharge;
};

export const batteryEnergy = (registry: Registry, item: Item): number => {
  const consumable = registry.items.get(item.type)?.consumable;
  if (!consumable?.rechargeable) {
    throw new Error('Battery is not rechargeable');
  }
  return (
    item.batteryMicrojoules ??
    Math.floor((item.charges ?? consumable.capacity) * consumable.rechargeable.microjoulesPerCharge)
  );
};

export const assertBatteryEnergy = (registry: Registry, item: ItemState): void => {
  if (item.batteryMicrojoules === undefined) {
    return;
  }
  const capacity = batteryCapacityMicrojoules(registry, item.type);
  if (
    capacity === undefined ||
    item.charges !== undefined ||
    !Number.isSafeInteger(item.batteryMicrojoules) ||
    item.batteryMicrojoules < 0 ||
    item.batteryMicrojoules > capacity
  ) {
    throw new Error('Invalid saved battery energy');
  }
};
