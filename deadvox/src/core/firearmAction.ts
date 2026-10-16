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

export const actionOpenSeconds = (action: FirearmAction): number =>
  (action.hand.unlockSimSeconds ?? 0) + action.hand.rearwardSimSeconds + action.hand.dwellSimSeconds;

export const actionPhaseSeconds = (action: FirearmAction, mode: FirearmMode, phase?: 'open' | 'close'): number => {
  if (phase === 'open') {
    return actionOpenSeconds(action);
  }
  const full = actionCycleSeconds(action, mode);
  return phase === 'close' ? full - actionOpenSeconds(action) : full;
};

export const ejectSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  const cycle = action[mode];
  if (!cycle) {
    throw new Error('No exported automatic action data for this gun');
  }
  return (
    (((cycle.unlockSimSeconds ?? 0) + cycle.rearwardSimSeconds * action.ejectAt) * actionCycleSeconds(action, mode)) /
    cycle.durationSimSeconds
  );
};
