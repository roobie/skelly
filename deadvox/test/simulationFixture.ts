import type { BodyTuningDef, CompressionCaps } from '../src/core/schema.ts';
import { Simulation as CoreSimulation, type SimOptions } from '../src/core/sim.ts';
import { gameHours, gamePerHour, simRate, simSeconds } from '../src/core/time.ts';

export const BODY_TUNING_FIXTURE: BodyTuningDef = {
  id: 'player-fixture',
  infectionOnsetGameHours: gameHours(0.01),
  antisepticWindowGameHours: gameHours(0.02),
  infectionChance: 0.5,
  knockoutSimSeconds: simSeconds(1),
  staminaRegenDelaySimSeconds: simSeconds(5),
  proneEyeHeightMetres: 0.2,
  bluntShockPerDamage: 2,
  treatmentSimSeconds: simSeconds(1),
  wakeShock: 5,
  bloodLossPerSimSecond: simRate(0.004),
  bloodRecoveryPerSimSecond: simRate(0.002),
  shockRecoveryPerSimSecond: simRate(0.1),
  advancedInfectionHealthLossPerSimSecond: simRate(0.0005),
  fatigueRisePerGameHour: gamePerHour(4),
  restFatigueRecoveryPerGameHour: gamePerHour(5),
  sleepFatigueRecoveryPerGameHour: gamePerHour(10),
  roughSleepShare: 0.5,
  healthRecoveryPerGameHour: gamePerHour(2),
  healthRecoveryNeedsFloor: { calories: 25, hydration: 25 },
  healthRecoveryFatigueCeiling: { awake: 80 },
  sleepRecoveryFactor: 3,
  aimSwayPerDamage: 0.01,
  swingSlowdownPerDamage: 0.01,
  movementSlowdownPerDamage: 0.005,
  minimumMovementSpeed: 0.5,
};

/** Passing time and working get different caps, so a test can tell which one a start used. */
export const COMPRESSION_CAPS_FIXTURE: CompressionCaps = {
  wait: 360,
  rest: 360,
  sleep: 360,
  craft: 30,
  reading: 30,
  treatment: 30,
};

export class Simulation extends CoreSimulation {
  constructor(
    options: Omit<SimOptions, 'bodyTuning' | 'compressionCaps'> & {
      bodyTuning?: BodyTuningDef;
      compressionCaps?: CompressionCaps;
    },
  ) {
    super({
      ...options,
      bodyTuning: options.bodyTuning ?? BODY_TUNING_FIXTURE,
      compressionCaps: options.compressionCaps ?? COMPRESSION_CAPS_FIXTURE,
    });
  }
}
