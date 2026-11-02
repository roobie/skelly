import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';

/** The content-owned downward acceleration shared by every falling body and effect. */
export const worldGravity = (registry: Registry): number => {
  const player = claimed(registry.player, 'player');
  if (!player) {
    throw new Error('Missing player tuning');
  }
  return player.gravityMetresPerSimSecondSquared;
};
