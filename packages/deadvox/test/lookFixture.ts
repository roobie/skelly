import type { LookDefaults } from '../src/core/mood.ts';

// A default look of the test's own, with every switch on and the tone mapper non-trivial, so the
// URL tests exercise both directions of each switch without depending on the content's look.
export const LOOK_FIXTURE: LookDefaults = {
  tone: 'auto',
  exposure: 3,
  srgb: true,
  patterns: true,
  vao: true,
  post: true,
  bloom: true,
  film: true,
  grade: 1,
  heightFog: { baseMetres: 11, scaleMetres: 9 },
  painCue: { pulseRiseRealSeconds: 0.1, pulseFallRealSeconds: 0.8, settleStretch: 1.5 },
  damageFeedback: {
    vignetteMax: 0.5,
    damageForFullStrength: 12,
    vignetteFadeRealSeconds: 0.7,
    rollPeakDegrees: 4,
    rollRiseRealSeconds: 0.04,
    rollSettleRealSeconds: 0.25,
  },
  mobActors: {
    corpseLieSimSeconds: 5,
    corpseSinkSimSeconds: 1,
    corpseSinkDepthMetres: 1,
    launchSpinRadiansPerSecond: 12,
    hearingGazeJitter: { yawDegrees: 3, pitchDegrees: 2, cyclesPerSimSecond: 0.4 },
  },
};
