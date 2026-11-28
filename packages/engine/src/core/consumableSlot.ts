// A device owns its consumable as a child item in its consumable slot, so fill and identity have one owner. Lights and
// tools share the slot, so fitting, taking out and drawing down are one path whatever the device or what it draws.

import { CONSUMABLE_SLOT, consumableCharge, consumableFields, consumableFits, drawConsumable } from './consumable.ts';
import type { Registry } from './content.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory, Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { putDownRefusal } from './itemThrow.ts';
import type { GameSeconds } from './time.ts';

/** A fitted device is serviced with its gun in hand, without detaching it. */
export const deviceInHands = (inventory: Inventory, device: Item): boolean => {
  const at = inventory.locate(device);
  return (
    at?.kind === 'hand' ||
    (at?.kind === 'slot' &&
      defOf(inventory.registry, at.owner.type).firearm !== undefined &&
      inventory.locate(at.owner)?.kind === 'hand')
  );
};

/** Whether `consumable` fits `device`'s consumable slot. */
export const fitsDevice = (registry: Registry, device: Item, consumable: Item): boolean =>
  consumableFits(registry, device.type, consumable.type);

/** The consumable type a device with an empty slot asks for. */
export const wantedConsumable = (registry: Registry, deviceType: string): string => {
  const slot = defOf(registry, deviceType).consumableSlot!;
  return slot.comesWith ?? slot.accepts[0]!;
};

/** The name, in running text, of the consumable a device with an empty slot asks for. */
export const wantedConsumableName = (registry: Registry, deviceType: string): string =>
  defOf(registry, wantedConsumable(registry, deviceType)).name.toLowerCase();

/**
 * The consumable that leaves a device, with its fill written on it, or undefined when it is thrown away: a spent one
 * that can't be recharged is no use to anyone.
 */
export const keptConsumable = (registry: Registry, item: Item | undefined): Item | undefined => {
  if (!item) {
    return undefined;
  }
  const charge = consumableCharge(registry, item);
  if (charge <= 0 && !defOf(registry, item.type).consumable?.rechargeable) {
    return undefined;
  }
  if (item.batteryMicrojoules === undefined) {
    item.charges = charge;
  }
  return item;
};

/**
 * Puts one of `consumable` into `device`, in place. The old one comes out with its fill and goes to `spent`, or is
 * thrown away as `keptConsumable` rules. Returns why it couldn't, or undefined; a refused swap changes nothing.
 */
export const swapConsumable = (
  inventory: Inventory,
  device: Item,
  consumable: Item,
  spent: (item: Item) => Target | undefined,
): string | undefined => {
  const { registry } = inventory;
  if (!fitsDevice(registry, device, consumable)) {
    return coreMessage(registry, 'wrongConsumable', { item: inventory.name(consumable).toLowerCase() });
  }
  const old = device.slots?.[CONSUMABLE_SLOT];
  const before = old?.charges;
  // Written before planning because the fill decides whether the old one can merge where it lands.
  const kept = keptConsumable(registry, old);
  const target = kept && spent(kept);
  const refusal = kept && putDownRefusal(inventory, kept, target);
  if (refusal) {
    if (before === undefined) {
      Reflect.deleteProperty(kept, 'charges');
    } else {
      kept.charges = before;
    }
    return refusal;
  }
  const replacement = consumable.count > 1 ? inventory.create(consumable.type, 1, consumable.condition) : consumable;
  Object.assign(replacement, consumableFields(consumable));
  if (!inventory.consume(consumable)) {
    return coreMessage(registry, 'gone');
  }
  inventory.fitSlot(device, CONSUMABLE_SLOT, replacement);
  if (kept && target) {
    inventory.add(kept, target);
  }
  return undefined;
};

/** Whether `device` holds a consumable that could be taken out. */
export const canUnloadConsumable = (registry: Registry, device: Item): boolean =>
  defOf(registry, device.type).consumableSlot !== undefined && device.slots?.[CONSUMABLE_SLOT] !== undefined;

/**
 * Takes the consumable out of `device` and switches it off. It keeps its fill and goes where `stow` puts it, or is
 * thrown away as in a swap. With nowhere to put it, it stays fitted. Returns why it couldn't, or undefined.
 */
export const unloadConsumable = (
  inventory: Inventory,
  device: Item,
  stow: (item: Item) => Target | undefined,
): string | undefined => {
  const { registry } = inventory;
  const removed = inventory.fitSlot(device, CONSUMABLE_SLOT, undefined);
  if (!removed) {
    return coreMessage(registry, 'gone');
  }
  const kept = keptConsumable(registry, removed);
  const target = kept && stow(kept);
  if (kept && !(target && inventory.add(kept, target))) {
    inventory.fitSlot(device, CONSUMABLE_SLOT, kept);
    return coreMessage(registry, 'cantStow', { item: defOf(registry, kept.type).name.toLowerCase() });
  }
  device.on = false;
  device.litAtGameTimestamp = undefined;
  return undefined;
};

/** The fill a device draws over `span` of drawing; 0 for one without a consumable slot. */
export const drainOver = (registry: Registry, device: Item, span: GameSeconds): number =>
  (defOf(registry, device.type).consumableSlot?.drainPerGameHour ?? 0) * span;

/** The fill left in the device's consumable; 0 with none fitted. */
export const slotCharge = (registry: Registry, device: Item): number => {
  const consumable = device.slots?.[CONSUMABLE_SLOT];
  return consumable ? consumableCharge(registry, consumable) : 0;
};

/** Whether the device's consumable covers `amount`; a device that draws nothing always does. */
export const consumableCovers = (registry: Registry, device: Item, amount: number): boolean =>
  amount <= 0 || slotCharge(registry, device) >= amount;

/** Why devices that could do the work can't start it: their consumable is missing or too low. */
export const consumableRefusal = (registry: Registry, devices: readonly Item[]): string => {
  const fitted = devices.map((device) => device.slots?.[CONSUMABLE_SLOT]).find((item) => item !== undefined);
  return fitted
    ? coreMessage(registry, 'consumableLow', { item: defOf(registry, fitted.type).name.toLowerCase() })
    : coreMessage(registry, 'noConsumable', { item: wantedConsumableName(registry, devices[0]!.type) });
};

/** Takes `amount` of fill from the device's consumable; the caller has already checked it covers it. */
export const spendConsumable = (inventory: Inventory, device: Item, amount: number): void => {
  if (amount <= 0) {
    return;
  }
  const consumable = device.slots?.[CONSUMABLE_SLOT];
  if (!consumable || slotCharge(inventory.registry, device) < amount) {
    throw new Error('The consumable cannot cover this spend');
  }
  drawConsumable(inventory.registry, consumable, amount);
};
