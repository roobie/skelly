/** Presentation estimate separating a tap from a deliberate quickbar hold. */
const QUICKBAR_HOLD_ESTIMATE_MS = 250;

interface Press {
  startedAt: number;
  held: boolean;
}

export class PressHoldInput<Action extends string | number> {
  private readonly presses = new Map<Action, Press>();
  private readonly holdDuration: (action: Action) => number;
  private readonly tap: (action: Action) => void;
  private readonly hold: (action: Action) => void;

  constructor(actions: {
    holdDuration: (action: Action) => number;
    tap: (action: Action) => void;
    hold: (action: Action) => void;
  }) {
    this.holdDuration = actions.holdDuration;
    this.tap = actions.tap;
    this.hold = actions.hold;
  }

  keyDown(action: Action, at: number): void {
    if (!this.presses.has(action)) {
      this.presses.set(action, { startedAt: at, held: false });
    }
  }

  update(at: number): void {
    for (const [action, press] of this.presses) {
      if (!press.held && at - press.startedAt >= this.holdDuration(action)) {
        press.held = true;
        this.hold(action);
      }
    }
  }

  keyUp(action: Action, at: number): void {
    const press = this.presses.get(action);
    if (!press) {
      return;
    }
    this.presses.delete(action);
    if (press.held || at - press.startedAt >= this.holdDuration(action)) {
      if (!press.held) {
        this.hold(action);
      }
    } else {
      this.tap(action);
    }
  }

  cancel(): void {
    this.presses.clear();
  }
}

export class QuickbarInput {
  private readonly gestures: PressHoldInput<number>;

  constructor(actions: { tap: (slot: number) => void; hold: (slot: number) => void }) {
    this.gestures = new PressHoldInput({
      holdDuration: () => QUICKBAR_HOLD_ESTIMATE_MS,
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
