import { canonicalJson } from './canonicalJson.ts';
import {
  SKILL_LEVEL_LEGENDARY,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  skillEffectLevel,
  skillSaturation,
} from './character.ts';

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
  readonly raiseMinimumSimSeconds: number;
  readonly raiseRangeSimSeconds: number;
  readonly raiseHalfLifeLevels: number;
  readonly readyMovementMinimum: number;
  readonly readyMovementRange: number;
  readonly readyMovementHalfLifeLevels: number;
  readonly loweredPitchRadians: number;
  readonly adsApertureFill: number;
  readonly skillZeroHandling: FirearmsSkillZeroHandling;
}

export interface FirearmsSkillEffects {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryRate: number;
  readonly reloadDuration: number;
  readonly rackDuration: number;
}

export interface FirearmStanceEffects {
  readonly raiseDuration: number;
  readonly readyMovementFactor: number;
}

const expertControl = skillSaturation(SKILL_LEVEL_MAX, 0.42, 4);
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
  const control = skillSaturation(effectLevel, 0.42, 4);
  const progressFromExpert = (control - expertControl) / (1 - expertControl);
  const zero = tuning.skillZeroHandling[shotKind];
  const expertRecovery = 2 - expertControl;
  const atSkillZero = (expertValue: number, zeroValue: number): number =>
    expertValue + (zeroValue - expertValue) * progressFromExpert;
  return {
    variance: atSkillZero(expertControl, zero.variance),
    recoilKickScale: atSkillZero(expertControl, zero.recoilKickScale),
    recoilRecoveryRate: atSkillZero(expertRecovery, zero.recoilRecoveryScale),
    reloadDuration: skillSaturation(effectLevel, 0.55, 5),
    rackDuration: skillSaturation(effectLevel, 0.62, 3),
  };
};

/** Stance time and ready gait are read from the firearms-combat skill's content tuning. */
export const firearmStanceEffects = (level: number, tuning: FirearmsCombatTuning): FirearmStanceEffects => {
  const effectLevel = effectLevelFor(level);
  return {
    raiseDuration:
      tuning.raiseMinimumSimSeconds +
      tuning.raiseRangeSimSeconds * skillSaturation(effectLevel, 0, tuning.raiseHalfLifeLevels),
    readyMovementFactor:
      tuning.readyMovementMinimum +
      tuning.readyMovementRange * (effectLevel / (effectLevel + tuning.readyMovementHalfLifeLevels)),
  };
};
