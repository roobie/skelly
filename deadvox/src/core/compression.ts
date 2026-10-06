import { simSeconds } from './time.ts';

/** The owner-specific ramp profiles are applied only by the outer Real-time frame driver. */
export type CompressionRamp = 'normal' | 'skip';

/** A per-start override of simulation-side compression limits. */
export interface CompressionLimits {
  /** Highest dimensionless simulation multiplier for this start. */
  readonly cap: number;
  /** Largest Sim-time step the driver may issue; omitted means unbounded. */
  readonly maxSimPerFrame: number;
  /** Selects an outer-driver ramp profile without placing Real durations in the simulation core. */
  readonly ramp: CompressionRamp;
}

/** Normal long-action compression; frame-driver timing is owned outside the simulation. */
export const COMPRESSION: CompressionLimits = { cap: 30, maxSimPerFrame: Number.POSITIVE_INFINITY, ramp: 'normal' };

/** Debug skip: a high Sim multiplier, bounded by Sim step size for scheduler cost. */
export const SKIP_COMPRESSION: CompressionLimits = {
  cap: 2400,
  maxSimPerFrame: simSeconds(40),
  ramp: 'skip',
};

export class Compression {
  /** Current dimensionless simulation multiplier; 1 is uncompressed. */
  c = 1;
  /** Limits of the current start; reset to normal by every `start` without an override. */
  limits: CompressionLimits = COMPRESSION;
  /** A long action wants compression. */
  active = false;
  /** Why compression was interrupted; set until the player continues or stops. */
  interruption: string | undefined;

  /** Asks for compression. Refused, with the reason, when it isn't safe. */
  start(unsafe: string | undefined, limits: CompressionLimits = COMPRESSION): { ok: true } | { ok: false; reason: string } {
    if (unsafe !== undefined) {
      return { ok: false, reason: unsafe };
    }
    this.limits = limits;
    this.interruption = undefined;
    this.active = true;
    return { ok: true };
  }

  /** The action ended normally; the outer frame driver ramps the multiplier back down. */
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

  /** The player's inputs are locked while time runs faster or a prompt is waiting. */
  get locksInput(): boolean {
    return this.active || this.c > 1 || this.interruption !== undefined;
  }
}
