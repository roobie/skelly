import type { ItemDef, Registry } from './content.ts';
import type { Item, ItemState } from './items.ts';

/** Mechanism precision, not a preservation tuning value. */
export const FOOD_EXPOSURE_DENOMINATOR = 1_000_000;

export interface FoodExposure {
  gameMilliseconds: number;
  remainder: number;
  settledAtGameMilliseconds: number;
}

export const foodMillisecondsAt = (calendarSeconds: number): number => {
  const value = Math.round(calendarSeconds * 1000);
  if (!Number.isSafeInteger(value) || calendarSeconds < 0) {
    throw new Error('Invalid food calendar timestamp');
  }
  return value;
};

/** A filled vessel owns the history of its serving, not that of its empty shell. */
export const servingDef = (registry: Registry, def: ItemDef): ItemDef => {
  const serving = def.serving ? registry.items.get(def.serving.food) : def;
  if (!serving) {
    throw new Error('Missing food serving');
  }
  return serving;
};

export const initialFoodExposure = (registry: Registry, def: ItemDef, madeAt: number): FoodExposure | undefined =>
  servingDef(registry, def).food?.rotsAfterGameHours === undefined
    ? undefined
    : { gameMilliseconds: 0, remainder: 0, settledAtGameMilliseconds: foodMillisecondsAt(madeAt) };

export const assertFoodExposure = (registry: Registry, item: Item | ItemState, at?: number): void => {
  const def = registry.items.get(item.type);
  if (!def) {
    throw new Error('Unknown food item');
  }
  const perishable = servingDef(registry, def).food?.rotsAfterGameHours !== undefined;
  const state = item.foodExposure;
  if (perishable !== (state !== undefined)) {
    throw new Error('Missing or unexpected food exposure');
  }
  if (
    state &&
    (!Number.isSafeInteger(state.gameMilliseconds) ||
      state.gameMilliseconds < 0 ||
      !Number.isSafeInteger(state.remainder) ||
      state.remainder < 0 ||
      state.remainder >= FOOD_EXPOSURE_DENOMINATOR ||
      !Number.isSafeInteger(state.settledAtGameMilliseconds) ||
      state.settledAtGameMilliseconds < 0 ||
      (at !== undefined && state.settledAtGameMilliseconds !== at))
  ) {
    throw new Error('Invalid food exposure');
  }
};

/** Pure projection: absence from the loaded world does not pause ambient aging. */
export const projectFoodExposure = (state: FoodExposure, at: number): FoodExposure => {
  if (!Number.isSafeInteger(at) || at < state.settledAtGameMilliseconds) {
    throw new Error('Food exposure cannot run backwards');
  }
  const gameMilliseconds = state.gameMilliseconds + (at - state.settledAtGameMilliseconds);
  if (!Number.isSafeInteger(gameMilliseconds)) {
    throw new Error('Food exposure overflow');
  }
  return { gameMilliseconds, remainder: state.remainder, settledAtGameMilliseconds: at };
};

export const equalFoodExposure = (a: Item, b: Item): boolean => {
  if (!(a.foodExposure && b.foodExposure)) {
    return a.foodExposure === b.foodExposure;
  }
  const at = Math.max(a.foodExposure.settledAtGameMilliseconds, b.foodExposure.settledAtGameMilliseconds);
  const left = projectFoodExposure(a.foodExposure, at);
  const right = projectFoodExposure(b.foodExposure, at);
  return left.gameMilliseconds === right.gameMilliseconds && left.remainder === right.remainder;
};

export const settleFoodExposure = (item: Item, at: number): void => {
  if (item.foodExposure) {
    item.foodExposure = projectFoodExposure(item.foodExposure, at);
  }
};

export const spoilage = (def: ItemDef, item: Item, calendar: number): number | undefined => {
  const rotsAfter = def.food?.rotsAfterGameHours;
  if (rotsAfter === undefined) {
    return undefined;
  }
  if (!item.foodExposure) {
    throw new Error('Perishable food has no exposure');
  }
  const state = projectFoodExposure(item.foodExposure, foodMillisecondsAt(calendar));
  return (state.gameMilliseconds + state.remainder / FOOD_EXPOSURE_DENOMINATOR) / (rotsAfter * 1000);
};

export const isRotten = (def: ItemDef, item: Item, calendar: number): boolean =>
  (spoilage(def, item, calendar) ?? 0) >= 1;

export const freshnessWord = (def: ItemDef, item: Item, calendar: number): string | undefined => {
  const used = spoilage(def, item, calendar);
  if (used === undefined) {
    return undefined;
  }
  if (used >= 1) {
    return 'rotten';
  }
  return used >= def.food!.goingOffFraction! ? 'going off' : 'fresh';
};
