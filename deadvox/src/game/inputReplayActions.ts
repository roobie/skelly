import type { InputContext } from './inputBindings.ts';
import type { InputReplayRecorder } from './inputReplay.ts';

export const openInventoryAtReplayStart = (isOpen: boolean, open: () => void): void => {
  if (isOpen) {
    open();
  }
};

export const routeDominantUse = (throwingStance: boolean, throwItem: () => void, useItem: () => void): void => {
  if (throwingStance) {
    throwItem();
  } else {
    useItem();
  }
};

export const toggleWalking = (
  walking: boolean,
  recorder: InputReplayRecorder | undefined,
  context: InputContext,
): boolean => {
  recorder?.queueAction('movement.walk-toggle', 'down', context, { inSnapshot: true });
  return !walking;
};
