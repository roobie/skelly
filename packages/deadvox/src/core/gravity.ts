import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';

/** The content-owned downward acceleration shared by every falling body and effect. */
export const worldGravity = (registry: Registry): number => {
  const player = registry.player.get(CORE_CONTENT_IDS.player);
  if (!player) {
    throw new Error('Missing player tuning');
  }
  return player.gravityMetresPerSimSecondSquared;
};
