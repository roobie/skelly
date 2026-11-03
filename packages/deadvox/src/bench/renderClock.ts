import { BACKGROUND_ACTOR_RATE } from '../core/actorSystem.ts';
import { ACTIVE_ACTOR_RATE } from '../game/simulationRates.ts';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Arguments for `ActorRenderer.sync` on the simulation clock, as `packages/deadvox/src/render/playView.ts` supplies them.
 * Background actors blend from their own `renderPrevious.time`, so `simulationTime` must be the same clock
 * `tickBackground` stamps them with; a wall-clock alpha since the last slice would pin them near zero. */
export const syncClock = (
  simulationTime: number,
  lastActiveStep: number,
  lastBackgroundStep: number,
): { alpha: number; backgroundAlpha: number; simSeconds: number } => ({
  alpha: clamp01((simulationTime - lastActiveStep) * ACTIVE_ACTOR_RATE),
  backgroundAlpha: clamp01((simulationTime - lastBackgroundStep) * BACKGROUND_ACTOR_RATE),
  simSeconds: simulationTime,
});
