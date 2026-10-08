import type { InputContext } from './inputBindings.ts';
import { type InputReplayRecorder, type ReplayStartState, restoreReplayStartState } from './inputReplay.ts';

export interface ReplayPlayStateAccessors {
  getThrowingStance: () => boolean;
  setThrowingStance: (value: boolean) => void;
  getReadyHeld: () => boolean;
  setReadyHeld: (value: boolean) => void;
  getAimingDownSights: () => boolean;
  setAimingDownSights: (value: boolean) => void;
  getInventoryOpen: () => boolean;
  setInventoryOpen: (value: boolean) => void;
}

export const createReplayPlayStateBinding = (accessors: ReplayPlayStateAccessors) => ({
  capture: (): ReplayStartState => ({
    throwingStance: accessors.getThrowingStance(),
    readyHeld: accessors.getReadyHeld(),
    aimingDownSights: accessors.getAimingDownSights(),
    inventoryOpen: accessors.getInventoryOpen(),
  }),
  restore: (state?: ReplayStartState): void => {
    const restored = restoreReplayStartState(state);
    accessors.setThrowingStance(restored.throwingStance);
    accessors.setReadyHeld(restored.readyHeld);
    accessors.setAimingDownSights(restored.aimingDownSights);
    accessors.setInventoryOpen(restored.inventoryOpen);
  },
});

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
