// Carried lights and their batteries (DESIGN.md, "Light"). A light's `charges` is the
// charge of the battery in it; absent means a full one, as found. A light drains only
// while it's on, at its rate per game hour, in closed form: a long step drains exactly
// what ticking every second would, and the light goes out when the charge runs out.
// Swapping in a fresh battery is handling; the old one comes out with what it had left.

import { offSide } from './character.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type DayCycle, DEFAULT_DAY_CYCLE } from './dayPhase.ts';
import type { Inventory, Location, Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { SenseDef } from './schema.ts';
import { sunDirection } from './sky.ts';
import { type GameRate, type GameSeconds, gameSeconds } from './time.ts';

/** Seconds to swap the battery in a light. */
export const BATTERY_SWAP = 2;
/** Lift ground-light emitters so the near-field falloff reaches nearby surfaces, rather than only grazing the floor. */
export const WORLD_LIGHT_HEIGHT_METRES = 0.4;

export type LightExposure = 'carried' | 'world';

export interface LightSenseSource {
  pos: Vec3;
  seenFrom: number;
  heightMetres: number;
  carried: boolean;
}

/** The light owner shared by the renderer and senses: only lit, exposed items illuminate the world. */
export const lightExposureFor = (
  registry: Registry,
  item: Item,
  location: Location,
  path: string,
): LightExposure | undefined => {
  const definition = registry.items.get(item.type);
  if (!(item.on && definition?.light)) {
    return undefined;
  }
  if (location.kind === 'hand' || location.kind === 'worn') {
    return 'carried';
  }
  if (location.kind === 'pocket' && (path.startsWith('inventory.hands.') || path.startsWith('inventory.worn.'))) {
    return 'carried';
  }
  if (location.kind === 'pile' && definition.light.burning?.drop === 'stay') {
    return 'world';
  }
  return undefined;
};

export const lightSenseSourceFor = ({
  registry,
  item,
  location,
  path,
  playerPosition,
  eyeHeightMetres,
}: {
  registry: Registry;
  item: Item;
  location: Location;
  path: string;
  playerPosition: Vec3;
  eyeHeightMetres: number;
}): LightSenseSource | undefined => {
  const light = registry.items.get(item.type)?.light;
  const exposure = lightExposureFor(registry, item, location, path);
  if (!(light && exposure)) {
    return undefined;
  }
  if (exposure === 'carried') {
    return { pos: [...playerPosition], seenFrom: light.seenFrom, heightMetres: eyeHeightMetres, carried: true };
  }
  if (location.kind === 'pile') {
    const [x, y, z] = location.pile.pos;
    return {
      pos: [x + 0.5, y + 0.15, z + 0.5],
      seenFrom: light.seenFrom,
      heightMetres: 0,
      carried: false,
    };
  }
  return undefined;
};

/** A daylight sky-exposure test for simulation senses; authored renderer skylight is not authoritative here. */
export const sunExposedAt = ({
  position,
  gameHours,
  skyTop,
  isOpaque,
  cycle = DEFAULT_DAY_CYCLE,
}: {
  position: readonly [number, number, number];
  gameHours: number;
  skyTop: number;
  isOpaque: SolidAt;
  cycle?: DayCycle;
}): boolean => {
  if (sunDirection(gameHours, cycle)[1] <= 0) {
    return false;
  }
  const distance = skyTop - position[1];
  if (distance <= 0) {
    return false;
  }
  const origin: [number, number, number] = [position[0], position[1] + 1e-4, position[2]];
  return raycast(origin, [0, 1, 0], distance, isOpaque) === undefined;
};

/** Shared gate for carried player signatures and independent light lures. */
export const lightSenseRangeScale = (exposure: LightExposure, sunlit: boolean, tuning: SenseDef['light']): number => {
  if (exposure === 'carried') {
    return sunlit ? tuning.playerDaySightScale : 1;
  }
  return sunlit ? 0 : tuning.lureRangeScale;
};

/** A battery's charge when full, from its type. */
const capacityOf = (registry: Registry, batteryType: string): number =>
  defOf(registry, batteryType).battery?.capacity ?? 0;

/** Battery power, if this source takes replaceable batteries. */
const batteryPowerOf = (registry: Registry, light: Item) => defOf(registry, light.type).light?.power;

/** Charge used per game second by a battery- or self-fuelled light. */
const drainRateOf = (registry: Registry, light: Item): GameRate | undefined => {
  const spec = defOf(registry, light.type).light;
  return spec?.power?.chargePerGameHour ?? spec?.fuelPerGameHour;
};

/** Charge left in the light's battery, or in a battery; undefined for anything else. */
export const chargeOf = (registry: Registry, item: Item): number | undefined => {
  const def = defOf(registry, item.type);
  if (def.battery) {
    return item.charges ?? def.battery.capacity;
  }
  const power = def.light?.power;
  if (power) {
    return item.charges ?? capacityOf(registry, power.battery);
  }
  return def.igniter ? (item.charges ?? def.igniter.capacity) : undefined;
};

/** Charge as a share of a full battery, 0 to 1. */
export const chargeShare = (registry: Registry, item: Item): number | undefined => {
  const def = defOf(registry, item.type);
  const capacity =
    def.battery?.capacity ??
    def.igniter?.capacity ??
    (def.light?.power ? capacityOf(registry, def.light.power.battery) : undefined);
  const charge = chargeOf(registry, item);
  return capacity === undefined || charge === undefined ? undefined : charge / capacity;
};

/** Switches a light on or off. Returns why it can't come on, or undefined. */
export const toggleLight = (registry: Registry, light: Item, calendar = 0): string | undefined => {
  const def = defOf(registry, light.type);
  const spec = def.light;
  if (spec === undefined) {
    return "It isn't a light";
  }
  if (light.on) {
    if (spec.burning && !spec.burning.douse) {
      return "It can't be doused";
    }
    light.on = false;
    light.litAtGameTimestamp = undefined;
    return undefined;
  }
  if (spec.burnTimeGameHours !== undefined) {
    if (light.burnRemainingGameSeconds !== undefined && !spec.burning?.relight) {
      return "It can't be lit again";
    }
    const remaining = light.burnRemainingGameSeconds ?? spec.burnTimeGameHours;
    if (remaining <= 0) {
      return 'It has burned out';
    }
    light.burnRemainingGameSeconds = remaining;
    light.litAtGameTimestamp = calendar;
  } else if (chargeOf(registry, light) === 0) {
    return def.igniter ? "It's out of fuel" : 'The battery is dead';
  }
  light.on = true;
  return undefined;
};

/** Burns a consumable light to the current calendar time; returns true when it went out. */
export const drainBurnLight = (light: Item, calendar: number): boolean => {
  if (!(light.on && light.litAtGameTimestamp !== undefined && light.burnRemainingGameSeconds !== undefined)) {
    return false;
  }
  const elapsed = Math.max(0, calendar - light.litAtGameTimestamp);
  light.litAtGameTimestamp = calendar;
  light.burnRemainingGameSeconds = Math.max(0, light.burnRemainingGameSeconds - elapsed);
  if (light.burnRemainingGameSeconds > 0) {
    return false;
  }
  light.on = false;
  light.litAtGameTimestamp = undefined;
  return true;
};

/**
 * Drains a light that's on over `elapsedGameSeconds`, in place. Returns the Game seconds into
 * the step when it ran out, or undefined if it's still going (or wasn't on).
 */
export const drainLight = (
  registry: Registry,
  light: Item,
  elapsedGameSeconds: GameSeconds,
): GameSeconds | undefined => {
  const ratePerGameSecond = drainRateOf(registry, light);
  if (!(light.on && ratePerGameSecond !== undefined)) {
    return undefined;
  }
  const charge = chargeOf(registry, light)!;
  const lasts = charge / ratePerGameSecond;
  if (lasts > elapsedGameSeconds) {
    light.charges = charge - ratePerGameSecond * elapsedGameSeconds;
    return undefined;
  }
  light.charges = 0;
  light.on = false;
  return gameSeconds(lasts);
};

/** The actor's off-hand item if it has an instant use (today only a light's on/off). */
export const offHandUse = (registry: Registry, inventory: Inventory): Item | undefined => {
  const item = inventory.hands[offSide(inventory.character)];
  return item && defOf(registry, item.type).light ? item : undefined;
};

/** Whether a battery fits a light. */
export const fitsLight = (registry: Registry, light: Item, battery: Item): boolean =>
  batteryPowerOf(registry, light)?.battery === battery.type;

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
