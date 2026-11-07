import { PressHoldInput } from './pressHoldInput.ts';

/** Presentation estimate separating a tap from a deliberate quickbar hold. */
const QUICKBAR_HOLD_ESTIMATE_MS = 250;

export class QuickbarInput {
  private readonly gestures: PressHoldInput<number>;

  constructor(actions: { tap: (slot: number) => void; hold: (slot: number) => void }) {
    this.gestures = new PressHoldInput({
      holdRealMs: () => QUICKBAR_HOLD_ESTIMATE_MS,
      tap: actions.tap,
      hold: actions.hold,
    });
  }

  keyDown(slot: number, at: number): void {
    this.gestures.keyDown(slot, at);
  }

  update(at: number): void {
    this.gestures.update(at);
  }

  keyUp(slot: number, at: number): void {
    this.gestures.keyUp(slot, at);
  }

  cancel(): void {
    this.gestures.cancel();
  }
}
