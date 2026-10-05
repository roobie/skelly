/** Presentation estimate separating a tap from a deliberate quickbar hold. */
export const QUICKBAR_HOLD_ESTIMATE_MS = 250;

interface Press {
  startedAt: number;
  held: boolean;
}

export class QuickbarInput {
  private readonly presses = new Map<number, Press>();
  private readonly tap: (slot: number) => void;
  private readonly hold: (slot: number) => void;

  constructor(actions: { tap: (slot: number) => void; hold: (slot: number) => void }) {
    this.tap = actions.tap;
    this.hold = actions.hold;
  }

  keyDown(slot: number, at: number): void {
    if (!this.presses.has(slot)) {
      this.presses.set(slot, { startedAt: at, held: false });
    }
  }

  update(at: number): void {
    for (const [slot, press] of this.presses) {
      if (!press.held && at - press.startedAt >= QUICKBAR_HOLD_ESTIMATE_MS) {
        press.held = true;
        this.hold(slot);
      }
    }
  }

  keyUp(slot: number, at: number): void {
    const press = this.presses.get(slot);
    if (!press) {
      return;
    }
    this.presses.delete(slot);
    if (press.held || at - press.startedAt >= QUICKBAR_HOLD_ESTIMATE_MS) {
      if (!press.held) {
        this.hold(slot);
      }
    } else {
      this.tap(slot);
    }
  }

  cancel(): void {
    this.presses.clear();
  }
}
