import { PressHoldInput } from './pressHoldInput.ts';

export type StanceReplayAction = 'player.crouch-toggle' | 'player.prone-toggle';

const stanceReplayActions = new Set<StanceReplayAction>(['player.crouch-toggle', 'player.prone-toggle']);

export const dispatchReplayStanceAction = (action: string, dispatch: (action: StanceReplayAction) => void): boolean => {
  if (!stanceReplayActions.has(action as StanceReplayAction)) {
    return false;
  }
  dispatch(action as StanceReplayAction);
  return true;
};

export class CrouchProneInput {
  private readonly input: PressHoldInput<string>;

  constructor({
    holdRealMs,
    action,
  }: {
    readonly holdRealMs: () => number;
    readonly action: (action: StanceReplayAction) => void;
  }) {
    this.input = new PressHoldInput({
      holdRealMs,
      tap: () => action('player.crouch-toggle'),
      hold: () => action('player.prone-toggle'),
    });
  }

  keyDown(action: string, at: number): void {
    this.input.keyDown(action, at);
  }

  keyUp(action: string, at: number): void {
    this.input.keyUp(action, at);
  }

  update(at: number, actionRefusal = false): void {
    if (actionRefusal) {
      this.cancel();
      return;
    }
    this.input.update(at);
  }

  cancel(): void {
    this.input.cancel();
  }
}
