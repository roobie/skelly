import { actionStrokeTimes, type FirearmAction } from '@skelly/engine/internal/core/firearmAction.ts';

/** Midway through the hold after a hand rack's draw, when the hand keeps the handle drawn back. */
export const heldBackSeconds = (action: FirearmAction): number => {
  const { reach, draw, release } = actionStrokeTimes(action, 'hand');
  return (reach + draw + release) / 2;
};
