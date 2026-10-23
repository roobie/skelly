import type { DamageFeedbackTuning } from '../src/game/damageFeedback.ts';
import type { PainCueTuning } from '../src/game/painCue.ts';
import type { GoreTuning } from '../src/render/gore.ts';

export const GORE_TUNING_FIXTURE: GoreTuning = {
  dropletCap: 17,
  splatCap: 19,
  dropletSpawnsPerFrame: 7,
  dripSourceCap: 3,
};

export const PAIN_CUE_TUNING_FIXTURE: PainCueTuning = {
  pulseRiseRealSeconds: 0.12,
  pulseFallRealSeconds: 1.1,
  settleStretch: 1.7,
};

export const DAMAGE_FEEDBACK_TUNING_FIXTURE: DamageFeedbackTuning = {
  vignetteMax: 0.64,
  damageForFullStrength: 20,
  vignetteFadeRealSeconds: 0.9,
  rollPeakDegrees: 5,
  rollRiseRealSeconds: 0.05,
  rollSettleRealSeconds: 0.3,
};
