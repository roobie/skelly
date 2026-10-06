import type { BodyTuningDef } from '../src/core/schema.ts';
import { Simulation as CoreSimulation, type SimOptions } from '../src/core/sim.ts';

export const BODY_TUNING_FIXTURE: BodyTuningDef = {
  id: 'player-fixture',
  infectionOnsetGameHours: 0.01,
  antisepticWindowGameHours: 0.02,
  infectionChance: 0.5,
  knockoutSeconds: 1,
  proneEyeHeightMetres: 0.2,
  bluntShockPerDamage: 2,
  treatmentSeconds: 1,
  wakeShock: 5,
  bloodLossPerSecond: 0.004,
  bloodRecoveryPerSecond: 0.002,
  shockRecoveryPerSecond: 0.1,
  advancedInfectionHealthLossPerSecond: 0.0005,
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
