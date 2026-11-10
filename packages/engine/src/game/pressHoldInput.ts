export class PressHoldInput<Action extends string | number> {
  private readonly presses = new Map<Action, { startedAt: number; held: boolean }>();
  private readonly holdDuration: (action: Action) => number;
  private readonly tap: (action: Action) => void;
  private readonly hold: (action: Action) => void;

  constructor(actions: {
    holdRealMs: (action: Action) => number;
    tap: (action: Action) => void;
    hold: (action: Action) => void;
  }) {
    this.holdDuration = actions.holdRealMs;
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
