import type { BodyRegion } from './body.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { WearSlot } from './schema.ts';

type PlayerHitArea = Extract<WearSlot, 'head' | 'torso' | 'legs'>;

/** Maps a body region to the outermost worn item covering it. */
const outermostWornOver = (inventory: Inventory, area: PlayerHitArea): Item | undefined => inventory.worn[area];

export const wearOnPlayerHit = (
  inventory: Inventory,
  region: BodyRegion,
  damage: number,
  wearMultiplier: number,
): void => {
  let area: PlayerHitArea;
  switch (region) {
    case 'head':
      area = 'head';
      break;
    case 'torso':
    case 'leftArm':
    case 'rightArm':
      area = 'torso';
      break;
    case 'leftLeg':
    case 'rightLeg':
      area = 'legs';
      break;
    default: {
      const exhaustive: never = region;
      throw exhaustive;
    }
  }
  const item = outermostWornOver(inventory, area);
  const rate = item && defOf(inventory.registry, item.type).wearable?.wearPerDamage;
  if (item && rate !== undefined) {
    inventory.changeCondition(item.uid, -rate * damage * wearMultiplier);
  }
};

export const wearMeleeWeaponOnHit = (inventory: Inventory, uid: number): void => {
  const item = inventory.itemByUid(uid);
  const rate = item && defOf(inventory.registry, item.type).weapon?.melee?.wearPerHit;
  if (item && rate !== undefined) {
    inventory.changeCondition(uid, -rate);
  }
};
