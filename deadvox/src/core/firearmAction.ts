// Shared exported timing contract: mechanics and held projection use the same clock.
import type { ModelDef } from './content.ts';

export type FirearmAction = NonNullable<ModelDef['action']>;
export type FirearmMode = 'fire' | 'hand';

export const actionCycleSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  if (mode === 'hand') {
    return action.hand.durationSeconds;
  }
  if (!(action.fire && action.rpm)) {
    throw new Error('No exported automatic action data for this gun');
  }
  return Math.min(action.fire.durationSeconds, 60 / action.rpm);
};

export const ejectSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  const cycle = action[mode];
  if (!cycle) {
    throw new Error('No exported automatic action data for this gun');
  }
  return (cycle.rearwardSeconds * action.ejectAt * actionCycleSeconds(action, mode)) / cycle.durationSeconds;
};
