import { BACKGROUND_ZOMBIE_RATE } from '../core/zombies.ts';
import { ZOMBIE_RATE } from '../game/simulationRates.ts';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Arguments for `ZombieRenderer.sync` on the simulation clock, as `render/playView.ts` supplies them.
 * Background actors blend from their own `renderPrevious.time`, so `simulationTime` must be the same clock
 * `tickBackground` stamps them with; a wall-clock alpha since the last slice would pin them near zero. */
export const syncClock = (
  simulationTime: number,
  lastActiveStep: number,
  lastBackgroundStep: number,
): { alpha: number; backgroundAlpha: number; simSeconds: number } => ({
  alpha: clamp01((simulationTime - lastActiveStep) * ZOMBIE_RATE),
  backgroundAlpha: clamp01((simulationTime - lastBackgroundStep) * BACKGROUND_ZOMBIE_RATE),
  simSeconds: simulationTime,
});
