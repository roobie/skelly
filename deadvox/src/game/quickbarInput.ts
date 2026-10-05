import { quickbarSlotForKey } from './input.ts';

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

  keyDown(code: string, at: number): void {
    const slot = quickbarSlotForKey(code);
    if (slot !== undefined && !this.presses.has(slot)) {
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

  keyUp(code: string, at: number): void {
    const slot = quickbarSlotForKey(code);
    if (slot === undefined) {
      return;
    }
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
