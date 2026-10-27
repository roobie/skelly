import type { AimFrame } from './aim.ts';
import { dominantSide } from './character.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { sightedFirearmModel } from './firearmSight.ts';
import type { Inventory } from './inventory.ts';
import type { PlayerAdsPose } from './playerLookPose.ts';

export const playerAdsPose = (
  inventory: Inventory,
  aimingDownSights: boolean,
  aimFrame?: AimFrame,
): PlayerAdsPose | undefined => {
  if (!aimingDownSights) {
    return undefined;
  }
  const leading = dominantSide(inventory.character);
  for (const side of [leading, leading === 'right' ? 'left' : 'right'] as const) {
    const item = inventory.hands[side];
    const model = item && sightedFirearmModel(inventory.registry, item);
    if (model?.hands && model.gun?.sight) {
      return {
        side,
        model,
        aimFrame,
        adsApertureFill: inventory.registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms
          ?.adsApertureFill,
      };
    }
  }
  return undefined;
};
