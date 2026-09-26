// Carried lights and their batteries (DESIGN.md, "Light"). A light's `charges` is the
// charge of the battery in it; absent means a full one, as found. A light drains only
// while it's on, at its rate per game hour, in closed form: a long step drains exactly
// what ticking every second would, and the light goes out when the charge runs out.
// Swapping in a fresh battery is handling; the old one comes out with what it had left.

import type { Registry } from './content.ts';
import type { Inventory, Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';

/** Seconds to swap the battery in a light. */
export const BATTERY_SWAP = 2;

/** A battery's charge when full, from its type. */
const capacityOf = (registry: Registry, batteryType: string): number =>
  defOf(registry, batteryType).battery?.capacity ?? 0;

/** The light's power, if it runs on batteries. */
const powerOf = (registry: Registry, light: Item) => defOf(registry, light.type).light?.power;

/** Charge left in the light's battery, or in a battery; undefined for anything else. */
export const chargeOf = (registry: Registry, item: Item): number | undefined => {
  const def = defOf(registry, item.type);
  if (def.battery) {
    return item.charges ?? def.battery.capacity;
  }
  const power = def.light?.power;
  return power ? (item.charges ?? capacityOf(registry, power.battery)) : undefined;
};

/** Charge as a share of a full battery, 0 to 1. */
export const chargeShare = (registry: Registry, item: Item): number | undefined => {
  const def = defOf(registry, item.type);
  const type = def.battery ? item.type : def.light?.power?.battery;
  const charge = chargeOf(registry, item);
  return type === undefined || charge === undefined ? undefined : charge / capacityOf(registry, type);
};

/** Switches a light on or off. Returns why it can't come on, or undefined. */
export const toggleLight = (registry: Registry, light: Item): string | undefined => {
  if (defOf(registry, light.type).light === undefined) {
    return "It isn't a light";
  }
  if (light.on) {
    light.on = false;
    return undefined;
  }
  if (chargeOf(registry, light) === 0) {
    return 'The battery is dead';
  }
  light.on = true;
  return undefined;
};

/**
 * Drains a light that's on over `hours` game hours, in place. Returns the hours into
 * the step when it ran out, or undefined if it's still going (or wasn't on).
 */
export const drainLight = (registry: Registry, light: Item, hours: number): number | undefined => {
  const power = powerOf(registry, light);
  if (!(light.on && power)) {
    return undefined;
  }
  const charge = chargeOf(registry, light)!;
  const lasts = charge / power.perHour;
  if (lasts > hours) {
    light.charges = charge - power.perHour * hours;
    return undefined;
  }
  light.charges = 0;
  light.on = false;
  return lasts;
};

/** Whether a battery fits a light. */
export const fitsLight = (registry: Registry, light: Item, battery: Item): boolean =>
  powerOf(registry, light)?.battery === battery.type;

/**
 * Puts one of `battery` into `light`, in place. The old battery comes out with its
 * charge and goes to `spent` if it has any left; a dead one is thrown away. Returns
 * why it couldn't, or undefined.
 */
export const swapBattery = (inventory: Inventory, light: Item, battery: Item, spent: Target): string | undefined => {
  const { registry } = inventory;
  if (!fitsLight(registry, light, battery)) {
    return "It doesn't take that battery";
  }
  const old = chargeOf(registry, light)!;
  const fresh = chargeOf(registry, battery)!;
  if (!inventory.consume(battery)) {
    return 'The battery is gone';
  }
  light.charges = fresh;
  if (old > 0) {
    const out = inventory.create(battery.type);
    out.charges = old;
    inventory.add(out, spent);
  }
  return undefined;
};
