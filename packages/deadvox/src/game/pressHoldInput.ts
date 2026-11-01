export class PressHoldInput<Action extends string | number> {
  private readonly presses = new Map<Action, { startedAt: number; held: boolean; freshHold: boolean }>();
  private readonly holdDuration: (action: Action) => number;
  private readonly tap: (action: Action) => void;
  private readonly hold: (action: Action) => void;
  private readonly repeatAction: ((action: Action) => void) | undefined;

  constructor(actions: {
    holdRealMs: (action: Action) => number;
    tap: (action: Action) => void;
    hold: (action: Action) => void;
    repeat?: (action: Action) => void;
  }) {
    this.holdDuration = actions.holdRealMs;
    this.tap = actions.tap;
    this.hold = actions.hold;
    this.repeatAction = actions.repeat;
  }

  keyDown(action: Action, at: number): void {
    if (!this.presses.has(action)) {
      this.presses.set(action, { startedAt: at, held: false, freshHold: true });
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

  isHeld(action: Action): boolean {
    return this.presses.get(action)?.held ?? false;
  }

  repeat(): void {
    for (const [action, press] of this.presses) {
      if (!press.held) {
        continue;
      }
      if (press.freshHold) {
        // The first hold action can still be awaiting this player tick; do not queue it twice.
        press.freshHold = false;
      } else {
        this.repeatAction?.(action);
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
