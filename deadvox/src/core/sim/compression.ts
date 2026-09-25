// Time compression for long actions (DESIGN.md, "Long actions"). While a long action
// runs, `factor` ramps up to the cap; the simulation advances `factor` times faster.
// Compression only starts when it's safe, and anything unsafe interrupts it at once.

/** Highest compression: 1 real second is about 4 game minutes at CLOCK_RATIO 8. */
export const COMPRESSION_CAP = 30;
/** Real seconds to ramp from 1 to the cap (and back when a long action ends). */
export const RAMP_SECONDS = 1;

/** Returns why compression is unsafe right now, or undefined when it's safe. */
export type SafetyCheck = () => string | undefined;

export class Compression {
  factor = 1;
  private active = false;
  private readonly checks: SafetyCheck[] = [];
  /** Why the last long action was interrupted; cleared when one starts. */
  interruption: string | undefined;

  addCheck(check: SafetyCheck): void {
    this.checks.push(check);
  }

  get running(): boolean {
    return this.active;
  }

  /** The first reason it isn't safe to compress time, if any. */
  unsafeReason(): string | undefined {
    for (const check of this.checks) {
      const reason = check();
      if (reason !== undefined) {
        return reason;
      }
    }
    return undefined;
  }

  /** Starts compressing. Returns the reason it can't, if it isn't safe. */
  start(): string | undefined {
    const reason = this.unsafeReason();
    if (reason === undefined) {
      this.active = true;
      this.interruption = undefined;
    }
    return reason;
  }

  /** Ends compression normally; the factor ramps back down. */
  stop(): void {
    this.active = false;
  }

  /** Drops to real time at once and records why. */
  interrupt(reason: string): void {
    this.active = false;
    this.factor = 1;
    this.interruption = reason;
  }

  /** Call once per frame with real seconds; checks safety and moves the factor toward its target. */
  update(realDt: number): void {
    if (this.active) {
      const reason = this.unsafeReason();
      if (reason !== undefined) {
        this.interrupt(reason);
        return;
      }
    }
    const target = this.active ? COMPRESSION_CAP : 1;
    const step = ((COMPRESSION_CAP - 1) * realDt) / RAMP_SECONDS;
    this.factor = target > this.factor ? Math.min(target, this.factor + step) : Math.max(target, this.factor - step);
  }
}
