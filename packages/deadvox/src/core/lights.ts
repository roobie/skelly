// Carried lights and their batteries (`DESIGN.md`, "Light"). A powered light owns its battery
// as a child item in `slots.battery`, so charge and identity have one owner. A light drains only
// while it's on, at its rate per game hour, in closed form: a long step drains exactly
// what ticking every second would, and the light goes out when the charge runs out.
// Swapping in a fresh battery is handling; the old one comes out with what it had left, as it
// does when the battery is taken out alone.

import { batteryCharge, batteryEnergy, batteryFields, batteryFits, spentBattery } from './battery.ts';
import type { BlockEntity } from './blockEntities.ts';
import { offSide } from './character.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import { type CoreMessageKey, coreMessage } from './coreText.ts';
import type { DayCycle } from './dayPhase.ts';
import type { Inventory, Location, Pile, Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { putDownRefusal } from './itemThrow.ts';
import { isInHeldItemSlotTree, itemRoots, walkItemTree } from './itemTree.ts';
import type { SolidAt } from './raycast.ts';
import type { NightVision, SenseDef, WearSlot } from './schema.ts';
import { sunDirection } from './sky.ts';
import { type GameRate, type GameSeconds, gameSeconds } from './time.ts';

export type LightExposure = 'carried' | 'world';
const WORN_SLOT_TREE_PATH = /^inventory\.worn\.[^.]+\.slots\./;
const PILE_SLOT_TREE_PATH = /^inventory\.piles\[\d+\]\.items\[\d+\]\.item(?:\.slots\.[^.]+)+$/;

/** Exposed world attachments use their root's pile location, never a container's contents. */
export function* inventoryLightEntries(inventory: Inventory) {
  yield* inventory.carriedTree();
  for (const root of itemRoots<Item, Pile, BlockEntity>({
    hands: {},
    worn: {},
    piles: inventory.piles.values(),
    entities: [],
  })) {
    yield root;
    for (const entry of walkItemTree([root])) {
      if (entry.location.kind === 'slot' && PILE_SLOT_TREE_PATH.test(entry.path)) {
        yield { ...entry, location: root.location };
      }
    }
  }
}

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
  if (!(item.on && definition?.light) || (definition.light.power && chargeOf(registry, item) === 0)) {
    return undefined;
  }
  const inCarriedSlotTree =
    location.kind === 'slot' &&
    (isInHeldItemSlotTree(path) || WORN_SLOT_TREE_PATH.test(path)) &&
    !path.includes('.pockets[');
  if (location.kind === 'hand' || location.kind === 'worn' || inCarriedSlotTree) {
    return 'carried';
  }
  if (location.kind === 'pocket' && (path.startsWith('inventory.hands.') || path.startsWith('inventory.worn.'))) {
    return 'carried';
  }
  if (location.kind === 'pile' && (definition.light.burning?.drop === 'stay' || PILE_SLOT_TREE_PATH.test(path))) {
    return 'world';
  }
  return undefined;
};

/** The night-vision view of a worn light that is on and charged, if any (`DESIGN.md`, "Light"). */
export const wornNightVision = (inventory: Inventory): NightVision | undefined => {
  const { registry } = inventory;
  for (const [slot, item] of Object.entries(inventory.worn)) {
    const nightVision = item && registry.items.get(item.type)?.light?.nightVision;
    if (nightVision && lightExposureFor(registry, item, { kind: 'worn', slot: slot as WearSlot }, '') !== undefined) {
      return nightVision;
    }
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
      pos: [x + 0.5, y, z + 0.5],
      seenFrom: light.seenFrom,
      heightMetres: registry.senses.get(CORE_CONTENT_IDS.player)!.light.groundLight.senseHeightMetres,
      carried: false,
    };
  }
  return undefined;
};

export const inventoryLightSources = (
  inventory: Inventory,
  playerPosition: Vec3,
  eyeHeightMetres: number,
): LightSenseSource[] => {
  const sources: LightSenseSource[] = [];
  for (const { item, location, path } of inventoryLightEntries(inventory)) {
    const source = lightSenseSourceFor({
      registry: inventory.registry,
      item,
      location,
      path,
      playerPosition,
      eyeHeightMetres,
    });
    if (source) {
      sources.push(source);
    }
  }
  return sources;
};

/** Reuses the highest opaque block in each vertical column for the session's sun checks. */
export class SunExposureCache {
  private readonly opaqueTopByColumn = new Map<string, number | null>();
  private readonly skyTop: number;
  private readonly skyBottom: number;
  private readonly isOpaque: SolidAt;

  constructor(skyTop: number, skyBottom: number, isOpaque: SolidAt) {
    this.skyTop = skyTop;
    this.skyBottom = skyBottom;
    this.isOpaque = isOpaque;
  }

  clear(): void {
    this.opaqueTopByColumn.clear();
  }

  isExposedAt(position: readonly [number, number, number], gameHours: number, cycle: DayCycle): boolean {
    if (sunDirection(gameHours, cycle)[1] <= 0 || this.skyTop - position[1] <= 0) {
      return false;
    }
    const x = Math.floor(position[0]);
    const z = Math.floor(position[2]);
    const key = `${x},${z}`;
    let opaqueTop = this.opaqueTopByColumn.get(key);
    if (opaqueTop === undefined && !this.opaqueTopByColumn.has(key)) {
      for (let y = Math.floor(this.skyTop); y >= this.skyBottom; y--) {
        if (this.isOpaque(x, y, z)) {
          opaqueTop = y;
          break;
        }
      }
      this.opaqueTopByColumn.set(key, opaqueTop ?? null);
    }
    const top = opaqueTop ?? this.opaqueTopByColumn.get(key) ?? null;
    return top === null || Math.floor(position[1] + 1e-4) > top;
  }
}

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
/** Charge used per game second by a battery- or self-fuelled light. */
const drainRateOf = (registry: Registry, light: Item): GameRate | undefined => {
  const spec = defOf(registry, light.type).light;
  return spec?.power?.chargePerGameHour ?? spec?.fuelPerGameHour;
};

/** Charge left in the light's battery, or in a battery; undefined for anything else. */
export const chargeOf = (registry: Registry, item: Item): number | undefined => {
  const def = defOf(registry, item.type);
  if (def.battery) {
    return batteryCharge(registry, item);
  }
  if (def.canister) {
    return item.charges ?? def.canister.capacity;
  }
  if (def.light?.power) {
    const battery = item.slots?.battery;
    return battery ? chargeOf(registry, battery) : 0;
  }
  if (def.tool?.fuel) {
    const canister = item.slots?.canister;
    return canister ? (canister.charges ?? defOf(registry, canister.type).canister?.capacity ?? 0) : 0;
  }
  return def.igniter ? (item.charges ?? def.igniter.capacity) : undefined;
};

/** Charge as a share of a full battery, 0 to 1. */
export const chargeShare = (registry: Registry, item: Item): number | undefined => {
  const def = defOf(registry, item.type);
  const capacity =
    def.battery?.capacity ??
    def.canister?.capacity ??
    def.igniter?.capacity ??
    (item.slots?.battery ? capacityOf(registry, item.slots.battery.type) : undefined) ??
    (item.slots?.canister ? defOf(registry, item.slots.canister.type).canister?.capacity : undefined);
  const charge = chargeOf(registry, item);
  return capacity === undefined || charge === undefined ? undefined : charge / capacity;
};

/** Starts a consumable light's burn clock. Returns why it can't light, or undefined. */
const startBurn = (
  light: Item,
  spec: NonNullable<ReturnType<typeof defOf>['light']>,
  burnTime: number,
  calendar: number,
): CoreMessageKey | undefined => {
  if (light.burnRemainingGameSeconds !== undefined && !spec.burning?.relight) {
    return 'cantRelight';
  }
  const remaining = light.burnRemainingGameSeconds ?? burnTime;
  if (remaining <= 0) {
    return 'burnedOut';
  }
  light.burnRemainingGameSeconds = remaining;
  light.litAtGameTimestamp = calendar;
  return undefined;
};

/** Switches a light on or off. Returns why it can't come on, or undefined. */
export const toggleLight = (registry: Registry, light: Item, calendar = 0): string | undefined => {
  const def = defOf(registry, light.type);
  const spec = def.light;
  if (spec === undefined) {
    return coreMessage(registry, 'notLight');
  }
  if (light.on) {
    if (spec.burning && !spec.burning.douse) {
      return coreMessage(registry, 'cantDouse');
    }
    light.on = false;
    light.litAtGameTimestamp = undefined;
    return undefined;
  }
  if (spec.burnTimeGameHours !== undefined) {
    const blocked = startBurn(light, spec, spec.burnTimeGameHours, calendar);
    if (blocked) {
      return coreMessage(registry, blocked);
    }
  } else if (chargeOf(registry, light) === 0) {
    if (spec.power && !light.slots?.battery) {
      return coreMessage(registry, 'noBattery');
    }
    return coreMessage(registry, def.igniter || def.tool?.fuel ? 'outOfFuel' : 'batteryDead');
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
  // A fuelled lamp holds its oil in the canister slot, as a powered light holds its battery.
  const cell = light.slots?.battery ?? light.slots?.canister;
  const charge = chargeOf(registry, light) ?? 0;
  const lasts = charge / ratePerGameSecond;
  if (lasts > elapsedGameSeconds) {
    if (cell) {
      const mapping = defOf(registry, cell.type).battery?.rechargeable;
      if (mapping) {
        cell.batteryMicrojoules = Math.max(
          0,
          batteryEnergy(registry, cell) -
            Math.ceil(ratePerGameSecond * elapsedGameSeconds * mapping.microjoulesPerCharge),
        );
        cell.charges = undefined;
      } else {
        cell.charges = charge - ratePerGameSecond * elapsedGameSeconds;
      }
    }
    return undefined;
  }
  if (cell) {
    if (defOf(registry, cell.type).battery?.rechargeable) {
      cell.batteryMicrojoules = 0;
      cell.charges = undefined;
    } else {
      cell.charges = 0;
    }
  }
  light.on = false;
  return gameSeconds(lasts);
};

/** The actor's off-hand item if it has an instant use (today only a light's on/off). */
export const offHandUse = (registry: Registry, inventory: Inventory): Item | undefined => {
  const item = inventory.hands[offSide(inventory.character)];
  return item && defOf(registry, item.type).light ? item : undefined;
};

/** A fitted light is serviced with its gun in hand, without detaching it. */
export const lightInHands = (inventory: Inventory, light: Item): boolean => {
  const at = inventory.locate(light);
  return (
    at?.kind === 'hand' ||
    (at?.kind === 'slot' &&
      defOf(inventory.registry, at.owner.type).firearm !== undefined &&
      inventory.locate(at.owner)?.kind === 'hand')
  );
};

/** Whether a battery fits a light. */
export const fitsLight = (registry: Registry, light: Item, battery: Item): boolean =>
  batteryFits(registry, light.type, battery.type);

/**
 * Puts one of `battery` into `light`, in place. The old battery comes out with its
 * charge and goes to `spent` if it has any left; a dead one is thrown away. Returns
 * why it couldn't, or undefined; a refused swap changes nothing.
 */
export const swapBattery = (
  inventory: Inventory,
  light: Item,
  battery: Item,
  spent: (item: Item) => Target | undefined,
): string | undefined => {
  const { registry } = inventory;
  if (!fitsLight(registry, light, battery)) {
    return coreMessage(registry, 'wrongBattery');
  }
  const kept = spentBattery(registry, light.slots?.battery);
  const target = kept && spent(kept);
  if (kept) {
    const refusal = putDownRefusal(inventory, kept, target);
    if (refusal) {
      return refusal;
    }
  }
  const replacement = battery.count > 1 ? inventory.create(battery.type, 1, battery.condition) : battery;
  Object.assign(replacement, batteryFields(battery));
  if (!inventory.consume(battery)) {
    return coreMessage(registry, 'batteryGone');
  }
  inventory.fitSlot(light, 'battery', replacement);
  if (kept && target) {
    inventory.add(kept, target);
  }
  return undefined;
};

/** Whether `light` holds a battery that could be taken out. */
export const canUnloadBattery = (registry: Registry, light: Item): boolean =>
  defOf(registry, light.type).light?.power !== undefined && light.slots?.battery !== undefined;

/**
 * Takes the battery out of `light` and switches it off. The battery keeps its charge and goes
 * where `stow` puts it; a dead one is thrown away, as in a swap. With nowhere to put it, it stays
 * fitted. Returns why it couldn't, or undefined.
 */
export const unloadBattery = (
  inventory: Inventory,
  light: Item,
  stow: (item: Item) => Target | undefined,
): string | undefined => {
  const { registry } = inventory;
  const removed = inventory.fitSlot(light, 'battery', undefined);
  if (!removed) {
    return coreMessage(registry, 'batteryGone');
  }
  const kept = spentBattery(registry, removed);
  const target = kept && stow(kept);
  if (kept && !(target && inventory.add(kept, target))) {
    inventory.fitSlot(light, 'battery', kept);
    return coreMessage(registry, 'cantStow', { item: defOf(registry, kept.type).name.toLowerCase() });
  }
  light.on = false;
  light.litAtGameTimestamp = undefined;
  return undefined;
};
