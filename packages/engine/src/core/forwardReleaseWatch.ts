import { type ButtonEventLike, FORWARD_BUTTON, FORWARD_MASK } from './sideButton.ts';

/**
 * Sees the forward button's release, including one made while another button stays down: the browser sends no
 * pointerup then, only a pointermove whose `buttons` lost the forward bit. Movement with the bit still set is no
 * release. Fed every pointer and mouse button event, so it knows the bit's last state.
 */
export class ForwardReleaseWatch {
  private held = false;

  released(e: ButtonEventLike): boolean {
    const held = (e.buttons & FORWARD_MASK) !== 0;
    const released = !held && (this.held || e.button === FORWARD_BUTTON);
    this.held = held;
    return released;
  }
}
