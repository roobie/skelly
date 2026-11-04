import { maxValue, minValue, number, optional, pipe, strictObject } from 'valibot';
import { capabilityField } from './capability.ts';
import {
  FirearmsSkillZeroHandlingSchema,
  Fraction,
  Id,
  NonNegative,
  NonNegativeSimRate,
  Positive,
  PositiveSimSeconds,
  range,
  SimSeconds,
} from './primitives.ts';

export const FirearmsEffectsSchema = strictObject({
  longGunSteadinessRole: capabilityField('skills'),
  raiseMinimumSimSeconds: PositiveSimSeconds,
  raiseHalfLifeLevels: Positive,
  readyMovementRange: Fraction,
  readyMovementHalfLifeLevels: Positive,
  wobbleSkillTenVariance: pipe(Positive, maxValue(100)),
  reloadFactorFloor: Fraction,
  reloadFactorHalfLifeLevels: Positive,
  rackFactorFloor: Fraction,
  rackFactorHalfLifeLevels: Positive,
  attachmentFactorFloor: Fraction,
  attachmentFactorHalfLifeLevels: Positive,
  breathHold: strictObject({ steadyingSkillRange: Fraction, steadyingSkillHalfLifeLevels: Positive }),
});

export const MeleeEffectsSchema = strictObject({
  blockChanceRange: Fraction,
  blockChanceHalfLifeLevels: Positive,
  mitigationRange: Fraction,
  mitigationHalfLifeLevels: Positive,
  staminaCostFloor: Fraction,
  staminaCostHalfLifeLevels: Positive,
});

export const RangedTuningSchema = strictObject({
  id: Id,
  capability: capabilityField('rangedTuning'),
  caseEjection: strictObject({
    speedMetresPerSimSecond: Positive,
    flightSimSeconds: PositiveSimSeconds,
    landingLiftMetres: NonNegative,
  }),
  shotTraceRangeBlocks: Positive,
  /**
   * Share of capacity loaded in a magazine placed as loot, inclusive; each whole count in the
   * rounded range is equally likely. Absent, such magazines spawn empty.
   */
  lootMagazineLoad: optional(range(Fraction)),
});

export const CombatPolicySchema = strictObject({
  id: Id,
  capability: capabilityField('combatPolicy'),
  aim: optional(
    strictObject({
      moveYawPerSpeed: NonNegative,
      lookLagPerRadian: NonNegative,
      lookSettleSimSeconds: PositiveSimSeconds,
      recoilRecoverySimSeconds: PositiveSimSeconds,
      maxOffsetRadians: pipe(Positive, maxValue(Math.PI / 2)),
    }),
  ),
  firearms: optional(
    strictObject({
      raiseSimSeconds: PositiveSimSeconds,
      adsAcquisitionMaximumSimSeconds: PositiveSimSeconds,
      readyMovementMinimum: Fraction,
      loweredPitchRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
      skillZeroHandling: FirearmsSkillZeroHandlingSchema,
      wobbleLimitRadians: pipe(Positive, maxValue(Math.PI / 2)),
      wobbleVerticalToHorizontalRatio: pipe(Positive, maxValue(1)),
      wobbleLuneArchPower: pipe(Positive, maxValue(4)),
      wobbleLunePhaseOffsetRadians: pipe(NonNegative, maxValue(0.45)),
      wobbleNoiseReversionRatePerSimSecond: pipe(Positive, maxValue(30)),
      wobbleNoiseSigmaRadiansPerSqrtSecond: pipe(NonNegative, maxValue(1)),
      wobbleNoiseSmoothingSimSeconds: pipe(Positive, maxValue(1)),
      wobbleStanceDriftScale: strictObject({ standing: NonNegative, crouching: NonNegative, prone: NonNegative }),
      breathHold: strictObject({
        staminaPerSimSecond: NonNegativeSimRate,
        recoverySimSeconds: SimSeconds,
        recoverySwayScale: pipe(number(), minValue(1), maxValue(10)),
        steadyingMinimum: Fraction,
        painWeakeningPerRatio: NonNegative,
      }),
    }),
  ),
  melee: optional(
    strictObject({
      blockChanceMinimum: Fraction,
      mitigationMinimum: Fraction,
      staminaPerAbsorbedPoint: Positive,
      joltPerAbsorbedPoint: NonNegative,
      joltRealSeconds: NonNegative,
      deflectRiseMetres: NonNegative,
      deflectRiseFloor: Fraction,
      deflectRealSeconds: NonNegative,
    }),
  ),
});
