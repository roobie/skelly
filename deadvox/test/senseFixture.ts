import type { SenseDef } from '../src/core/schema.ts';

export const TEST_SENSE_TUNING: SenseDef = {
  id: 'player',
  crouch: {
    speedMetresPerSecond: 0.8,
    hearingRangeScale: 0.5,
    sightRangeScale: 0.5,
    eyeDropMetres: 0.8,
  },
  wall: {
    hearingRangeScale: 0.5,
    gain: 0.5,
    cutoffHz: 1200,
    clearGain: 1,
    clearCutoffHz: 18_000,
  },
  light: {
    playerDaySightScale: 0,
    lureRangeScale: 0.5,
    throwMaxDistanceMetres: 8,
    throwChargeSeconds: 1.25,
  },
};
