import type { Registry } from './content.ts';
import type { Item, ItemState } from './items.ts';

export const batteryFields = (item: ItemState): Pick<ItemState, 'charges' | 'batteryMicrojoules'> => ({
  ...(item.charges === undefined ? {} : { charges: item.charges }),
  ...(item.batteryMicrojoules === undefined ? {} : { batteryMicrojoules: item.batteryMicrojoules }),
});

export const batteryCharge = (registry: Registry, item: Item): number => {
  const battery = registry.items.get(item.type)!.battery!;
  return item.batteryMicrojoules !== undefined && battery.rechargeable
    ? item.batteryMicrojoules / battery.rechargeable.microjoulesPerCharge
    : (item.charges ?? battery.capacity);
};

export const spentBattery = (registry: Registry, item: Item | undefined): Item | undefined => {
  if (!item) {
    return undefined;
  }
  const charge = batteryCharge(registry, item);
  if (charge <= 0 && !registry.items.get(item.type)?.battery?.rechargeable) {
    return undefined;
  }
  if (item.batteryMicrojoules === undefined) {
    item.charges = charge;
  }
  return item;
};

export const batteryCapacityMicrojoules = (registry: Registry, type: string): number | undefined => {
  const battery = registry.items.get(type)?.battery;
  return battery?.rechargeable && battery.capacity * battery.rechargeable.microjoulesPerCharge;
};

export const batteryEnergy = (registry: Registry, item: Item): number => {
  const battery = registry.items.get(item.type)?.battery;
  if (!battery?.rechargeable) {
    throw new Error('Battery is not rechargeable');
  }
  return (
    item.batteryMicrojoules ??
    Math.floor((item.charges ?? battery.capacity) * battery.rechargeable.microjoulesPerCharge)
  );
};

export const batteryFits = (registry: Registry, lightType: string, batteryType: string): boolean => {
  const power = registry.items.get(lightType)?.light?.power;
  return (
    power !== undefined && (power.battery === batteryType || power.compatibleBatteries?.includes(batteryType) === true)
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
