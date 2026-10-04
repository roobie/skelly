import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { WearSlot } from './schema.ts';

export type PlayerHitArea = Extract<WearSlot, 'head' | 'torso' | 'legs'>;

/** Maps the supplied hit area to its outermost worn item; later body models own area selection. */
export const outermostWornOver = (inventory: Inventory, area: PlayerHitArea): Item | undefined => inventory.worn[area];

/** Missing hit-area data deliberately causes no clothing wear. */
export const wearOnPlayerHit = (inventory: Inventory, area?: PlayerHitArea): void => {
  if (!area) {
    return;
  }
  const item = outermostWornOver(inventory, area);
  const rate = item && defOf(inventory.registry, item.type).wearable?.wearPerHit;
  if (item && rate !== undefined) {
    inventory.changeCondition(item.uid, -rate);
  }
};

export const wearMeleeWeaponOnHit = (inventory: Inventory, uid: number): void => {
  const item = inventory.itemByUid(uid);
  const rate = item && defOf(inventory.registry, item.type).weapon?.melee?.wearPerHit;
  if (item && rate !== undefined) {
    inventory.changeCondition(uid, -rate);
  }
};
