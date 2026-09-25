// The compression controller. A long action asks for compression; `c` ramps up to
// the cap in real time and back down when the action ends. It is only allowed while
// it's safe, and an interruption drops it straight back to 1× and waits for the
// player to choose Continue or Stop (DESIGN.md, "Long actions").

export const COMPRESSION = {
  /** Highest compression: 1 real second is about 4 game minutes at 1:8. */
  cap: 30,
  /** Real seconds to ramp from 1× to the cap. */
  rampUp: 1.5,
  /** Real seconds to ramp from the cap back to 1× when an action ends normally. */
  rampDown: 0.4,
} as const;

const K_UP = Math.log(COMPRESSION.cap) / COMPRESSION.rampUp;
const K_DOWN = Math.log(COMPRESSION.cap) / COMPRESSION.rampDown;

export class Compression {
  /** Current compression; 1 is real time. */
  c = 1;
  /** A long action wants compression. */
  active = false;
  /** Why compression was interrupted; set until the player continues or stops. */
  interruption: string | undefined;

  /** Asks for compression. Refused, with the reason, when it isn't safe. */
  start(unsafe: string | undefined): { ok: true } | { ok: false; reason: string } {
    if (unsafe !== undefined) {
      return { ok: false, reason: unsafe };
    }
    this.interruption = undefined;
    this.active = true;
    return { ok: true };
  }

  /** The action ended normally: ramp back down. */
  stop(): void {
    this.active = false;
    this.interruption = undefined;
  }

  /** Drops to 1× at once and waits for Continue or Stop. */
  interrupt(reason: string): void {
    this.c = 1;
    this.active = false;
    this.interruption = reason;
  }

  /** Drops to 1× at once without asking the player (the action had already ended). */
  snap(): void {
    this.c = 1;
  }

  /** Ramps `c` towards its target over `realDt` seconds. */
  update(realDt: number): void {
    this.c = this.active
      ? Math.min(COMPRESSION.cap, this.c * Math.exp(K_UP * realDt))
      : Math.max(1, this.c * Math.exp(-K_DOWN * realDt));
  }

  /** The player's inputs are locked while time runs faster or a prompt is waiting. */
  get locksInput(): boolean {
    return this.active || this.c > 1 || this.interruption !== undefined;
  }
}
