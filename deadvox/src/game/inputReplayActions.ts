import type { InputContext } from './inputBindings.ts';
import type { InputReplayRecorder } from './inputReplay.ts';

export const toggleWalking = (
  walking: boolean,
  recorder: InputReplayRecorder | undefined,
  context: InputContext,
): boolean => {
  recorder?.queueAction('movement.walk-toggle', 'down', context, { inSnapshot: true });
  return !walking;
};
