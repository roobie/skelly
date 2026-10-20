import { simSeconds } from './time.ts';

/** The owner-specific ramp profiles are applied only by the outer Real-time frame driver. */
type CompressionRamp = 'normal' | 'skip';
export type CompressionOwner = 'debug' | 'long-action';

/** A per-start override of simulation-side compression limits. */
export interface CompressionLimits {
  /** Highest dimensionless simulation multiplier for this start. */
  readonly cap: number;
  /** Largest Sim-time step the driver may issue; omitted means unbounded. */
  readonly maxSimPerFrame: number;
  /** Selects an outer-driver ramp profile without placing Real durations in the simulation core. */
  readonly ramp: CompressionRamp;
}

/**
 * The largest Sim step one frame of a long action takes: enough for the highest content cap at 60
 * frames a second, and a bound on a frame's cost when many shamblers are active (`DESIGN.md`, "Long actions").
 */
const LONG_ACTION_MAX_SIM_PER_FRAME = simSeconds(6);

/** Long-action compression up to a content cap; frame-driver timing is owned outside the simulation. */
export const longActionLimits = (cap: number): CompressionLimits => ({
  cap,
  maxSimPerFrame: LONG_ACTION_MAX_SIM_PER_FRAME,
  ramp: 'normal',
});

/** Before any start: no compression and no Sim step bound. */
const UNCOMPRESSED: CompressionLimits = { cap: 1, maxSimPerFrame: Number.POSITIVE_INFINITY, ramp: 'normal' };

/** Debug skip: a high Sim multiplier, bounded by Sim step size for scheduler cost. */
export const SKIP_COMPRESSION: CompressionLimits = {
  cap: 2400,
  maxSimPerFrame: simSeconds(40),
  ramp: 'skip',
};

export class Compression {
  /** Current dimensionless simulation multiplier; 1 is uncompressed. */
  c = 1;
  /** Limits of the latest start; a start without its own uses the defaults. */
  limits = UNCOMPRESSED;
  /** Whether debug controls or a player long action started compression. */
  owner: CompressionOwner = 'debug';
  /** A long action wants compression. */
  active = false;
  /** Why compression was interrupted; set until the player continues or stops. */
  interruption: string | undefined;
  private readonly defaults: CompressionLimits;

  constructor(defaults: CompressionLimits) {
    this.defaults = defaults;
  }

  /** Asks for compression. Refused, with the reason, when the caller has one. */
  start(
    refusal: string | undefined,
    owner: CompressionOwner,
    limits: CompressionLimits = this.defaults,
  ): { ok: true } | { ok: false; reason: string } {
    if (refusal !== undefined) {
      return { ok: false, reason: refusal };
    }
    this.limits = limits;
    this.owner = owner;
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
