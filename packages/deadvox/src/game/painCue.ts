// The seen pain cue (`INTERFACE.md`, "Bodily cues: the body tells, the HUD doesn't"): while felt pain is at a
// tier, the colour drains in a short pulse as deep as the tier says and as often as its interval says, and a
// hit's tilt settles more slowly. Time is the frame loop's, like `DamageFeedback`, so scripted frames repeat.

import type { BodyTuningDef } from '../core/schema.ts';

type PainTierDef = BodyTuningDef['pain']['tiers'][number];

export interface PainCueTuning {
  readonly pulseRiseRealSeconds: number;
  readonly pulseFallRealSeconds: number;
  readonly settleStretch: number;
}

export interface PainCueState {
  /** How much colour to drain now, 0 to 1. */
  readonly desaturation: number;
  /** What a hit's settle time is multiplied by; 1 without pain. */
  readonly settle: number;
}

export class PainCue {
  private readonly tuning: PainCueTuning;
  private sincePulse = Number.POSITIVE_INFINITY;
  private depth = 0;

  constructor(tuning: PainCueTuning) {
    this.tuning = tuning;
  }

  /** `tier` is felt pain's tier, undefined below the first; a pulse under way finishes when pain eases. */
  step(dt: number, tier: PainTierDef | undefined): PainCueState {
    this.sincePulse += dt;
    if (tier && this.sincePulse >= tier.pulseIntervalRealSeconds) {
      this.sincePulse = 0;
      this.depth = tier.desaturation;
    }
    const t = this.sincePulse;
    const envelope =
      t < this.tuning.pulseRiseRealSeconds
        ? t / this.tuning.pulseRiseRealSeconds
        : 1 - (t - this.tuning.pulseRiseRealSeconds) / this.tuning.pulseFallRealSeconds;
    return {
      desaturation: this.depth * Math.max(0, envelope),
      settle: 1 + this.tuning.settleStretch * (tier?.desaturation ?? 0),
    };
  }
}
