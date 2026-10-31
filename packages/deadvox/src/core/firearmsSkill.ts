import type { BreathHoldTuning } from './aim.ts';
import { canonicalJson } from './canonicalJson.ts';
import {
  SKILL_LEVEL_LEGENDARY,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  skillEffectLevel,
  skillSaturation,
} from './character.ts';
import type { PlayerStance } from './playerStance.ts';
import type { SkillDef } from './schema.ts';

export const FIREARMS_SKILL_ZERO_RANGES = {
  variance: { min: 0.1, max: 100, step: 0.1 },
  recoilKickScale: { min: 0.1, max: 100, step: 0.1 },
  recoilRecoveryScale: { min: 0.01, max: 10, step: 0.01 },
} as const;

export interface FirearmsSkillZeroEffect {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryScale: number;
}

export interface FirearmsSkillZeroHandling {
  readonly singleShot: FirearmsSkillZeroEffect;
  readonly automaticFollowup: FirearmsSkillZeroEffect;
}

export type FirearmsSkillShotKind = keyof FirearmsSkillZeroHandling;

export const skillZeroHandlingForFirearm = (
  firearm: FirearmsSkillZeroHandling | undefined,
  shared: FirearmsSkillZeroHandling,
): FirearmsSkillZeroHandling => firearm ?? shared;

export const sameFirearmsSkillZeroHandling = (
  left: FirearmsSkillZeroHandling,
  right: FirearmsSkillZeroHandling,
): boolean => canonicalJson(left) === canonicalJson(right);

export interface FirearmsCombatTuning {
  readonly longGunSteadinessSkill: string;
  readonly raiseMinimumSimSeconds: number;
  readonly raiseRangeSimSeconds: number;
  readonly raiseHalfLifeLevels: number;
  /** The ADS-only speed floor, as the longest allowed aim-down-sights acquisition; bounds ADS, not raise. */
  readonly adsAcquisitionMaximumSimSeconds: number;
  readonly readyMovementMinimum: number;
  readonly readyMovementRange: number;
  readonly readyMovementHalfLifeLevels: number;
  readonly loweredPitchRadians: number;
  readonly skillZeroHandling: FirearmsSkillZeroHandling;
  readonly wobbleSkillTenVariance: number;
  readonly wobbleLimitRadians: number;
  readonly wobbleVerticalToHorizontalRatio: number;
  readonly wobbleLuneArchPower: number;
  readonly wobbleLunePhaseOffsetRadians: number;
  readonly wobbleNoiseReversionRatePerSimSecond: number;
  readonly wobbleNoiseSigmaRadiansPerSqrtSecond: number;
  readonly wobbleNoiseSmoothingSimSeconds: number;
  readonly wobbleStanceDriftScale: Readonly<Record<PlayerStance, number>>;
  readonly reloadFactorFloor: number;
  readonly reloadFactorHalfLifeLevels: number;
  readonly rackFactorFloor: number;
  readonly rackFactorHalfLifeLevels: number;
  readonly attachmentFactorFloor: number;
  readonly attachmentFactorHalfLifeLevels: number;
  readonly caseEjection: {
    readonly speedMetresPerSimSecond: number;
    readonly flightSimSeconds: number;
    readonly landingLiftMetres: number;
  };
  readonly shotTraceRangeBlocks: number;
  readonly breathHold: BreathHoldTuning;
  readonly curve?: { readonly saturationFloor: number; readonly saturationHalfLifeLevels: number } | undefined;
}

export interface FirearmsSkillEffects {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryRate: number;
  readonly reloadDuration: number;
  readonly rackDuration: number;
}

export interface FirearmStanceEffects {
  readonly raiseDurationSimSeconds: number;
  readonly adsAcquisitionDurationSimSeconds: number;
  readonly readyMovementFactor: number;
}

const curveFor = ({ curve }: FirearmsCombatTuning) => {
  if (curve === undefined) {
    throw new Error('Missing firearms-combat skill curve');
  }
  return { floor: curve.saturationFloor, halfLifeLevels: curve.saturationHalfLifeLevels };
};
const effectLevelFor = (level: number): number => {
  if (!Number.isSafeInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_LEGENDARY) {
    throw new Error('Invalid firearms skill level');
  }
  return skillEffectLevel(level);
};

/** Skill-zero handling endpoints are content-owned; expert handling remains the established curve endpoint. */
export const firearmsSkillEffects = (
  level: number,
  tuning: FirearmsCombatTuning,
  shotKind: FirearmsSkillShotKind = 'singleShot',
): FirearmsSkillEffects => {
  const effectLevel = effectLevelFor(level);
  const curve = curveFor(tuning);
  const expertControl = skillSaturation(SKILL_LEVEL_MAX, curve);
  const control = skillSaturation(effectLevel, curve);
  const progressFromExpert = (control - expertControl) / (1 - expertControl);
  const zero = tuning.skillZeroHandling[shotKind];
  const expertRecovery = 2 - expertControl;
  const atSkillZero = (expertValue: number, zeroValue: number): number =>
    expertValue + (zeroValue - expertValue) * progressFromExpert;
  return {
    variance: atSkillZero(tuning.wobbleSkillTenVariance, zero.variance),
    recoilKickScale: atSkillZero(expertControl, zero.recoilKickScale),
    recoilRecoveryRate: atSkillZero(expertRecovery, zero.recoilRecoveryScale),
    reloadDuration: skillSaturation(effectLevel, tuning.reloadFactorFloor, tuning.reloadFactorHalfLifeLevels),
    rackDuration: skillSaturation(effectLevel, tuning.rackFactorFloor, tuning.rackFactorHalfLifeLevels),
  };
};

export const steadinessTuning = (tuning: FirearmsCombatTuning, skill: SkillDef): FirearmsCombatTuning => {
  if (!(skill.steadiness && skill.curve)) {
    throw new Error(`Missing steadiness tuning on skill ${skill.id}`);
  }
  const { wobbleSkillTenVariance, ...breath } = skill.steadiness;
  return {
    ...tuning,
    curve: skill.curve,
    wobbleSkillTenVariance,
    breathHold: { ...tuning.breathHold, ...breath },
  };
};

/** The ADS-only speed floor: acquisition reads the raise duration, clamped to a content maximum. */
export const adsAcquisitionDuration = (raiseDurationSimSeconds: number, tuning: FirearmsCombatTuning): number =>
  Math.min(raiseDurationSimSeconds, tuning.adsAcquisitionMaximumSimSeconds);

/** Stance time and ready gait are read from the firearms-combat skill's content tuning. */
export const firearmStanceEffects = (level: number, tuning: FirearmsCombatTuning): FirearmStanceEffects => {
  const effectLevel = effectLevelFor(level);
  const raiseDurationSimSeconds =
    tuning.raiseMinimumSimSeconds +
    tuning.raiseRangeSimSeconds * skillSaturation(effectLevel, 0, tuning.raiseHalfLifeLevels);
  return {
    raiseDurationSimSeconds,
    adsAcquisitionDurationSimSeconds: adsAcquisitionDuration(raiseDurationSimSeconds, tuning),
    readyMovementFactor:
      tuning.readyMovementMinimum +
      tuning.readyMovementRange * (effectLevel / (effectLevel + tuning.readyMovementHalfLifeLevels)),
  };
};
