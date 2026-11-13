import type { AimFrame } from './aim.ts';
import { dominantSide } from './character.ts';
import { sightedFirearmModel } from './firearmSight.ts';
import type { Inventory } from './inventory.ts';
import type { PlayerAdsPose } from './playerLookPose.ts';

export const playerAdsPose = (
  inventory: Inventory,
  aimingDownSights: boolean,
  aimFrame?: AimFrame,
  /** How far the view has carried the aim from hip to sights; the descriptor is fully sighted without it. */
  adsAim = 1,
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
        aim: adsAim,
      };
    }
  }
  return undefined;
};
