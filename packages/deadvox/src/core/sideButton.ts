/** The bits of a mouse/pointer event the side-button logic reads. */
export interface ButtonEventLike {
  readonly button: number;
  readonly buttons: number;
}

const FORWARD_BUTTON = 4;
const FORWARD_MASK = 16;

/**
 * Mouse 5 (side forward). `button === 4` is the standard; the `buttons` bit (16) is a fallback for
 * events that report the transition oddly, but only when `button` isn't one of the primary
 * buttons, so a left click made while the side button is held doesn't read as a forward press.
 */
export const isForwardButton = (e: ButtonEventLike): boolean =>
  e.button === FORWARD_BUTTON || ((e.button > 3 || e.button < 0) && (e.buttons & FORWARD_MASK) !== 0);

/**
 * One physical press can arrive as pointerdown and mousedown; accepts the first and drops any
 * other within `windowMs`. Time-based, so a lost release event can't leave it stuck.
 */
export class PressDedupe {
  private last = Number.NEGATIVE_INFINITY;
  private readonly windowMs: number;

  constructor(windowMs = 80) {
    this.windowMs = windowMs;
  }

  accept(timeMs: number): boolean {
    if (timeMs - this.last < this.windowMs) {
      return false;
    }
    this.last = timeMs;
    return true;
  }
}
