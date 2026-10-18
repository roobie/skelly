import type { SenseDef } from '../src/core/schema.ts';
import { simRate, simSeconds } from '../src/core/time.ts';
import { startupContent } from './baseRegistry.ts';

export const BASE_SENSE_TUNING: SenseDef = startupContent().registry.senses.get('player')!;

/** The bundled player row with only the values these fixtures deliberately set overridden. */
export const TEST_SENSE_TUNING: SenseDef = {
  ...BASE_SENSE_TUNING,
  crouch: {
    ...BASE_SENSE_TUNING.crouch,
    speedMetresPerSimSecond: simRate(0.8),
    eyeDropMetres: 0.8,
  },
  wall: {
    ...BASE_SENSE_TUNING.wall,
    gain: 0.5,
    cutoffHz: 1200,
  },
  light: {
    ...BASE_SENSE_TUNING.light,
    throwMaxDistanceMetres: 8,
    throwMinimumHoldSimSeconds: simSeconds(0.8),
    throwStanceDropHoldRealSeconds: 1,
    wornLightToggleHoldRealSeconds: 1,
    renderedBeamLimit: 3,
    throwArmSpeedMetresPerRealSecond: 6,
    throwArmEnergyJoules: 20,
  },
};
