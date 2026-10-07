// Shared exported timing contract: mechanics and held projection use the same clock.
import type { ModelDef } from './content.ts';

export type FirearmAction = NonNullable<ModelDef['action']>;
export type FirearmMode = 'fire' | 'hand';

export const actionCycleSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  if (mode === 'hand') {
    return action.hand.durationSimSeconds;
  }
  if (!(action.fire && action.roundsPerSimMinute)) {
    throw new Error('No exported automatic action data for this gun');
  }
  return Math.min(action.fire.durationSimSeconds, 1 / action.roundsPerSimMinute);
};

export const ejectSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  const cycle = action[mode];
  if (!cycle) {
    throw new Error('No exported automatic action data for this gun');
  }
  return (cycle.rearwardSimSeconds * action.ejectAt * actionCycleSeconds(action, mode)) / cycle.durationSimSeconds;
};
