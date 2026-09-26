// Food rotting (DESIGN.md, "Catch-up simulation"). An item's age comes from the clock
// and when it was made, so rotting keeps no state and needs no ticking: food in a
// chunk that was unloaded for a week is exactly as rotten as food you carried.

import { SECONDS_PER_HOUR } from './clock.ts';
import type { ItemDef } from './content.ts';
import type { Item } from './items.ts';

/** How far through its shelf life it is: 0 when made, 1 or more once rotten. Undefined for food that keeps. */
export const spoilage = (def: ItemDef, item: Item, calendar: number): number | undefined => {
  const rotsAfter = def.food?.rotsAfter;
  if (rotsAfter === undefined) {
    return undefined;
  }
  return Math.max(0, calendar - (item.made ?? 0)) / (rotsAfter * SECONDS_PER_HOUR);
};

export const isRotten = (def: ItemDef, item: Item, calendar: number): boolean =>
  (spoilage(def, item, calendar) ?? 0) >= 1;

/** Past this share of its shelf life, food is going off. */
export const GOING_OFF = 0.5;

/** "fresh", "going off" or "rotten"; undefined for food that keeps. */
export const freshnessWord = (def: ItemDef, item: Item, calendar: number): string | undefined => {
  const used = spoilage(def, item, calendar);
  if (used === undefined) {
    return undefined;
  }
  if (used >= 1) {
    return 'rotten';
  }
  return used >= GOING_OFF ? 'going off' : 'fresh';
};
