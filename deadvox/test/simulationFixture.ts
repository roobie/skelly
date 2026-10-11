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
  shockPerDamage: { blunt: 2, cut: 0, pierce: 0 },
  treatmentSimSeconds: simSeconds(1),
  treatmentSpread: { min: 0.5, max: 1.5 },
  wakeShock: 5,
  // The fixture's own tiers, three of them, so tests never lean on base content's list.
  bleeding: {
    refusal: 'Fixture bleeding',
    blockCompressionAtLossPerSimSecond: simRate(0),
    tiers: [
      {
        id: 'minor',
        label: 'Minor',
        warn: false,
        bloodLossPerSimSecond: simRate(0.002),
        closeSimSeconds: simSeconds(60),
        treatmentEffort: 1,
        minDamage: 0,
        chance: { blunt: 0.1, cut: 0.3, pierce: 0.3 },
        drip: { rate: 0.5, size: 1 },
      },
      {
        id: 'serious',
        label: 'Serious',
        warn: true,
        notice: 'Fixture serious',
        bloodLossPerSimSecond: simRate(0.01),
        closeSimSeconds: simSeconds(600),
        treatmentEffort: 2,
        minDamage: 5,
        chance: { blunt: 0.05, cut: 0.3, pierce: 0.3 },
        drip: { rate: 1, size: 1 },
      },
      {
        id: 'critical',
        label: 'Critical',
        warn: true,
        notice: 'Fixture critical',
        bloodLossPerSimSecond: simRate(1),
        closeSimSeconds: simSeconds(6000),
        treatmentEffort: 4,
        minDamage: 20,
        regionFactor: { head: 0, torso: 0.5, leftArm: 0, rightArm: 0 },
        chance: { blunt: 0.01, cut: 0.1, pierce: 0.1 },
        drip: { rate: 4, size: 1.5 },
      },
    ],
  },
  bloodRecoveryPerSimSecond: simRate(0.002),
  shockRecoveryPerSimSecond: simRate(0.1),
  advancedInfectionHealthLossPerSimSecond: simRate(0.0005),
  aimSwayPerDamage: 0.01,
  swingSlowdownPerDamage: 0.01,
  movementSlowdownPerDamage: 0.005,
  minimumMovementSpeed: 0.5,
};

/** The index of a fixture bleeding tier, by its id. */
export const fixtureTier = (id: 'minor' | 'serious' | 'critical'): number =>
  BODY_TUNING_FIXTURE.bleeding.tiers.findIndex((tier) => tier.id === id);

export class Simulation extends CoreSimulation {
  constructor(options: Omit<SimOptions, 'bodyTuning'> & { bodyTuning?: BodyTuningDef }) {
    super({ ...options, bodyTuning: options.bodyTuning ?? BODY_TUNING_FIXTURE });
  }
}
