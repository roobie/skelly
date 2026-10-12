import type { Registry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { BodyTuningDef, CompressionCaps } from '../src/core/schema.ts';
import { Simulation as CoreSimulation, type SimOptions } from '../src/core/sim.ts';
import { gameHours, gamePerHour, realSeconds, simRate, simSeconds } from '../src/core/time.ts';

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
        pain: 2,
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
        pain: 6,
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
        pain: 12,
      },
    ],
  },
  // The fixture's own pain scale and tiers, so pain tests never lean on base content's tuning.
  pain: {
    knockoutAt: 50,
    perDamage: { blunt: 1, cut: 2, pierce: 2 },
    regionWeight: { head: 2, torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 },
    perRegionDamage: 0.4,
    infection: { early: 5, advanced: 10 },
    acuteFadePerSimSecond: simRate(0.1),
    acuteFadeSharePerSimSecond: simRate(0.02),
    aimSway: { perShare: 2, max: 1 },
    handlingSlowdown: { perShare: 1, max: 0.5 },
    tiers: [
      { id: 'twinge', from: 0.2, desaturation: 0.1, pulseIntervalRealSeconds: realSeconds(10) },
      { id: 'agony', from: 0.7, notice: 'Fixture agony', desaturation: 0.5, pulseIntervalRealSeconds: realSeconds(2) },
    ],
  },
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

/** Content whose player body is this fixture, so a whole-session test owns the body tuning it asserts on. */
export const withFixtureBody = (content: Registry): Registry => ({
  ...content,
  body: new Map(content.body).set(CORE_CONTENT_IDS.player, BODY_TUNING_FIXTURE),
});

/** The index of a fixture bleeding tier, by its id. */
export const fixtureTier = (id: 'minor' | 'serious' | 'critical'): number =>
  BODY_TUNING_FIXTURE.bleeding.tiers.findIndex((tier) => tier.id === id);

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
