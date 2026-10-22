import type { ClockSettings } from '../src/core/clock.ts';
import type { Registry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { BodyTuningDef, CompressionCaps } from '../src/core/schema.ts';
import { Simulation as CoreSimulation, type SimOptions } from '../src/core/sim.ts';
import { gameHours, gameMinutes, gamePerHour, realSeconds, simRate, simSeconds } from '../src/core/time.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';

export const BODY_TUNING_FIXTURE: BodyTuningDef = {
  id: 'player-fixture',
  infectionOnsetGameHours: gameHours(0.01),
  antisepticWindowGameHours: gameHours(0.02),
  infectionChance: 0.5,
  knockoutSimSeconds: simSeconds(1),
  staminaRegenDelaySimSeconds: simSeconds(5),
  proneEyeHeightMetres: 0.2,
  fragmentRegionHeights: { head: 0.85, torso: 0.45 },
  shockPerDamage: { blunt: 2, cut: 0, pierce: 0, acid: 1 },
  outerWearMultiplier: { blunt: 1, cut: 1, pierce: 1, acid: 4 },
  coverage: {
    head: ['head'],
    torso: ['vest', 'torso'],
    leftArm: ['torso', 'hands'],
    rightArm: ['torso', 'hands'],
    leftLeg: ['legs', 'feet'],
    rightLeg: ['legs', 'feet'],
  },
  touchFirst: { ground: 'feet', hand: 'hands' },
  exposureRefusal: 'Fixture exposure',
  linger: { acid: { simSeconds: simSeconds(3) } },
  landing: {
    safeSpeedMetresPerSimSecond: simRate(8),
    damagePerSquaredSpeed: 0.25,
    damageSpread: { min: 0.2, max: 2 },
    kind: 'blunt',
    cause: 'a fixture fall',
    regions: [
      { region: 'leftLeg', weight: 1 },
      { region: 'rightLeg', weight: 1 },
    ],
  },
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
        chancePerDamage: { blunt: 0.01, cut: 0.03, pierce: 0.03, acid: 0 },
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
        chancePerDamage: { blunt: 0.005, cut: 0.03, pierce: 0.03, acid: 0 },
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
        chancePerDamage: { blunt: 0.001, cut: 0.01, pierce: 0.01, acid: 0 },
        drip: { rate: 4, size: 1.5 },
        pain: 12,
      },
    ],
  },
  // The fixture's own pain scale and tiers, so pain tests never lean on base content's tuning.
  pain: {
    knockoutAt: 50,
    perDamage: { blunt: 1, cut: 2, pierce: 2, acid: 3 },
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
  // The fixture's own needs, so survival tests never lean on base content's tuning.
  needs: {
    spawn: { calories: 40, hydration: 35, fatigue: 70, stamina: 100 },
    drainPerGameHour: { calories: gamePerHour(3), hydration: gamePerHour(5) },
    healthLossPerGameHour: { starving: gamePerHour(4), dehydrated: gamePerHour(8) },
    stamina: {
      sprintPerSimSecond: simRate(5),
      recoverPerSimSecond: simRate(4),
      wornRecoveryFactor: 0.5,
      windedBelow: 10,
    },
    full: { kcal: 2500, ml: 2500 },
    critical: [
      { need: 'calories', below: 10, message: 'Fixture starving' },
      { need: 'hydration', below: 10, message: 'Fixture parched' },
      { need: 'fatigue', above: 90, message: 'Fixture exhausted' },
    ],
    badlyHurt: { below: 25, message: 'Fixture badly hurt' },
  },
  heartbeat: {
    sounds: { slow: 'player_heartbeat_slow', fast: 'player_heartbeat_fast' },
    startStamina: 80,
    startHz: 1,
    exhaustedHz: 3,
    startGain: 0.1,
    exhaustedGain: 0.8,
  },
  fatigueRisePerGameHour: gamePerHour(4),
  restFatigueRecoveryPerGameHour: gamePerHour(5),
  sleepFatigueRecoveryPerGameHour: gamePerHour(10),
  sleepOnset: {
    minGameMinutes: gameMinutes(2),
    maxGameMinutes: gameMinutes(20),
    fatigueAtMinimum: 100,
  },
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

/** Content whose player body uses the supplied tuning, so a whole-session test owns its body definition. */
export const withPlayerBodyTuning = (content: Registry, body: BodyTuningDef): Registry => ({
  ...content,
  body: new Map(content.body).set(CORE_CONTENT_IDS.player, body),
});

/** Content whose player body is this fixture, so a whole-session test owns the body tuning it asserts on. */
export const withFixtureBody = (content: Registry): Registry => withPlayerBodyTuning(content, BODY_TUNING_FIXTURE);

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
    options: Omit<SimOptions, 'bodyTuning' | 'compressionCaps' | 'clock'> & {
      bodyTuning?: BodyTuningDef;
      compressionCaps?: CompressionCaps;
      clock?: ClockSettings;
    },
  ) {
    super({
      ...options,
      clock: options.clock ?? BASE_CLOCK,
      bodyTuning: options.bodyTuning ?? BODY_TUNING_FIXTURE,
      compressionCaps: options.compressionCaps ?? COMPRESSION_CAPS_FIXTURE,
    });
  }
}
