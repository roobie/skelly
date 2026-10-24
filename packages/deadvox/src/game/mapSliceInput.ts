import type { KeyboardInput } from './inputBindings.ts';

export const MAP_SLICE_ACTIONS = ['debug.map-slice-down', 'debug.map-slice-up', 'debug.map-slice-surface'] as const;
export type MapSliceAction = (typeof MAP_SLICE_ACTIONS)[number];
type MapKey = Parameters<KeyboardInput['press']>[0];

const isSliceAction = (action: string): action is MapSliceAction =>
  (MAP_SLICE_ACTIONS as readonly string[]).includes(action);

/**
 * Lets the review-map page resolve its own keys through the same `KeyboardInput` the game uses, in the
 * review-map context, so chord and modifier rules stay the input boundary's. A handler returns true when
 * the page took the key, so the caller can keep it from the game.
 */
export const mapSliceKeys = (input: KeyboardInput, run: (action: MapSliceAction) => void) => {
  input.context = () => ({ context: 'review-map', debug: true });
  let delivered = false;
  input.command = ({ action, phase }) => {
    if (phase === 'down' && isSliceAction(action)) {
      delivered = true;
      run(action);
    }
  };
  const taken = new Set<string>();
  return {
    down(event: MapKey): boolean {
      delivered = false;
      input.press(event);
      if (delivered) {
        taken.add(event.code);
      }
      return delivered;
    },
    up(event: MapKey): boolean {
      input.release(event);
      return taken.delete(event.code);
    },
  };
};
