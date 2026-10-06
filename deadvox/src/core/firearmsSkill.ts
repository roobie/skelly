import {
  SKILL_LEVEL_LEGENDARY,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  skillEffectLevel,
  skillSaturation,
} from './character.ts';

export interface FirearmsCombatTuning {
  readonly raiseMinimumSeconds: number;
  readonly raiseRangeSeconds: number;
  readonly raiseHalfLifeLevels: number;
  readonly readyMovementMinimum: number;
  readonly readyMovementRange: number;
  readonly readyMovementHalfLifeLevels: number;
  readonly loweredPitchRadians: number;
  readonly adsApertureFill: number;
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
const recoilKickAtZero = 3;
const effectLevelFor = (level: number): number => {
  if (!Number.isSafeInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_LEGENDARY) {
    throw new Error('Invalid firearms skill level');
  }
  return skillEffectLevel(level);
};

/** Existing firearm handling effects remain code-owned until the content-language spike. */
export const firearmsSkillEffects = (level: number): FirearmsSkillEffects => {
  const effectLevel = effectLevelFor(level);
  const control = skillSaturation(effectLevel, 0.42, 4);
  const progressFromExpert = (control - expertControl) / (1 - expertControl);
  return {
    variance: control,
    recoilKickScale: expertControl + (recoilKickAtZero - expertControl) * progressFromExpert,
    recoilRecoveryRate: 2 - control,
    reloadDuration: skillSaturation(effectLevel, 0.55, 5),
    rackDuration: skillSaturation(effectLevel, 0.62, 3),
  };
};

/** Stance time and ready gait are read from the firearms-combat skill's content tuning. */
export const firearmStanceEffects = (level: number, tuning: FirearmsCombatTuning): FirearmStanceEffects => {
  const effectLevel = effectLevelFor(level);
  return {
    raiseDuration:
      tuning.raiseMinimumSeconds +
      tuning.raiseRangeSeconds * skillSaturation(effectLevel, 0, tuning.raiseHalfLifeLevels),
    readyMovementFactor:
      tuning.readyMovementMinimum +
      tuning.readyMovementRange * (effectLevel / (effectLevel + tuning.readyMovementHalfLifeLevels)),
  };
};
