import type { BodyTuningDef } from '../src/core/schema.ts';
import { Simulation as CoreSimulation, type SimOptions } from '../src/core/sim.ts';
import { gameHours, simRate, simSeconds } from '../src/core/time.ts';

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
  bleeding: {
    scratch: { bloodLossPerSimSecond: simRate(0.002), stopSimSeconds: simSeconds(60) },
    moderate: { bloodLossPerSimSecond: simRate(0.01), minDamage: 5, chance: 0.5 },
    heavy: { bloodLossPerSimSecond: simRate(0.1), minDamage: 10, chance: 0.2 },
    arterial: {
      bloodLossPerSimSecond: simRate(1),
      minDamage: 20,
      chance: 0.05,
      regions: ['leftLeg', 'rightLeg'],
    },
  },
  bleedingTreatments: { bandage: { stops: 'arterial' }, rag: { stops: 'moderate', eases: 'heavy' } },
  bloodRecoveryPerSimSecond: simRate(0.002),
  shockRecoveryPerSimSecond: simRate(0.1),
  advancedInfectionHealthLossPerSimSecond: simRate(0.0005),
  aimSwayPerDamage: 0.01,
  swingSlowdownPerDamage: 0.01,
  movementSlowdownPerDamage: 0.005,
  minimumMovementSpeed: 0.5,
};

export class Simulation extends CoreSimulation {
  constructor(options: Omit<SimOptions, 'bodyTuning'> & { bodyTuning?: BodyTuningDef }) {
    super({ ...options, bodyTuning: options.bodyTuning ?? BODY_TUNING_FIXTURE });
  }
}
