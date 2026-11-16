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
  SimSeconds,
} from './primitives.ts';
import { skillFeeds } from './skillFeeds.ts';

const FirearmsShotSkillFeedsSchema = strictObject({
  variance: skillFeeds('firearm.noviceHandlingShare'),
  recoilKickScale: skillFeeds('firearm.noviceHandlingShare'),
  recoilRecoveryScale: skillFeeds('firearm.noviceHandlingShare'),
});

/** The skills feeding each firearm handling effect from its skill-zero value. */
const FirearmsSkillFeedsSchema = strictObject({
  raise: skillFeeds('firearm.raiseSimSeconds'),
  readyMovement: skillFeeds('firearm.readyMovementFactor'),
  reload: skillFeeds('firearm.reloadFactor'),
  rack: skillFeeds('firearm.rackFactor'),
  attachment: skillFeeds('firearm.attachmentSimSeconds'),
  breathSteadying: skillFeeds('aim.breathSteadying'),
  singleShot: optional(FirearmsShotSkillFeedsSchema),
  automaticFollowup: optional(FirearmsShotSkillFeedsSchema),
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
      /** The skill role sighted long-gun practice trains, matching the role that steadies long guns. */
      longGunSteadinessRole: optional(capabilityField('skills')),
      raiseSimSeconds: PositiveSimSeconds,
      adsAcquisitionMaximumSimSeconds: PositiveSimSeconds,
      readyMovementMinimum: Fraction,
      loweredPitchRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
      skillZeroHandling: FirearmsSkillZeroHandlingSchema,
      expertHandling: strictObject({
        variance: NonNegative,
        recoilKickScale: NonNegative,
        recoilRecoveryScale: Positive,
      }),
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
      skills: optional(FirearmsSkillFeedsSchema),
      /** Feeds that replace the matching ones while a long gun is in hand. */
      longGunSkills: optional(FirearmsSkillFeedsSchema),
    }),
  ),
  melee: optional(
    strictObject({
      blockChanceMinimum: Fraction,
      mitigationMinimum: Fraction,
      staminaPerAbsorbedPoint: Positive,
      /** The skills feeding each block effect from its skill-zero value. */
      skills: optional(
        strictObject({
          blockChance: skillFeeds('melee.blockChance'),
          mitigation: skillFeeds('melee.mitigation'),
          staminaPerAbsorbedPoint: skillFeeds('melee.staminaPerAbsorbedPoint'),
        }),
      ),
      joltPerAbsorbedPoint: NonNegative,
      joltRealSeconds: NonNegative,
      deflectRiseMetres: NonNegative,
      deflectRiseFloor: Fraction,
      deflectRealSeconds: NonNegative,
    }),
  ),
});
