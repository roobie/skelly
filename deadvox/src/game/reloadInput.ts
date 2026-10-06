// Transient keyboard intent only. Existing HandlingQueue owns shell/rack jobs.
/** Real milliseconds: double presses must arrive before the window expires. */
export const RELOAD_GESTURE_MS = { hold: 250, doublePress: 250 } as const;

export interface ReloadBinding {
  readonly uid: number;
  readonly busy: () => boolean;
  /** True only when a single-shell job was admitted. */
  readonly load: () => boolean;
  /** One admitted load per press, which release doesn't cancel: a magazine change rather than shell by shell. */
  readonly oneAction?: boolean;
  readonly rack: () => void;
  readonly cancelLoad: () => void;
}

interface Press {
  readonly binding: ReloadBinding;
  readonly at: number;
  released: boolean;
  loading: boolean;
}

/** One binding can later provide different firearm actions without changing the gesture. */
export class ReloadInput {
  private press: Press | undefined;
  private down = false;

  keyDown(now: number, binding: ReloadBinding | undefined): void {
    if (this.down) {
      return;
    }
    this.down = true;
    const previous = this.press;
    if (
      binding &&
      previous?.released &&
      previous.binding.uid === binding.uid &&
      now - previous.at < RELOAD_GESTURE_MS.doublePress
    ) {
      this.press = undefined;
      binding.rack();
      return;
    }
    this.advance(now, binding);
    this.down = true;
    this.press = binding ? { binding, at: now, released: false, loading: false } : undefined;
  }

  keyUp(now: number): void {
    this.down = false;
    if (!this.press) {
      return;
    }
    if (this.press.loading || now - this.press.at >= RELOAD_GESTURE_MS.hold) {
      this.cancel();
    } else {
      this.press.released = true;
    }
  }

  advance(now: number, binding: ReloadBinding | undefined): void {
    const { press } = this;
    if (!press) {
      return;
    }
    if (press.binding.uid !== binding?.uid) {
      this.cancel();
      return;
    }
    if (now - press.at < Math.max(RELOAD_GESTURE_MS.hold, RELOAD_GESTURE_MS.doublePress)) {
      return;
    }
    if (press.released) {
      this.press = undefined; // A short single tap has no action.
    } else if (!press.binding.busy()) {
      press.loading = press.binding.load();
      if (!press.loading || press.binding.oneAction) {
        this.press = undefined; // Full tube/no loose shells, or the one action began: wait for a fresh press.
      }
    }
  }

  cancel(): void {
    if (this.press?.loading) {
      this.press.binding.cancelLoad();
    }
    this.press = undefined;
    this.down = false;
  }
}
