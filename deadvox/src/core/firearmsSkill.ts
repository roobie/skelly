import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN, skillEffectLevel } from './character.ts';

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

const saturation = (level: number, floor: number, halfLife: number): number =>
  floor + (1 - floor) * (halfLife / (halfLife + level));

const effectLevelFor = (level: number): number => {
  if (!Number.isSafeInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_LEGENDARY) {
    throw new Error('Invalid firearms skill level');
  }
  return skillEffectLevel(level);
};

/** Existing firearm handling effects remain code-owned until the content-language spike. */
export const firearmsSkillEffects = (level: number): FirearmsSkillEffects => {
  const effectLevel = effectLevelFor(level);
  const control = saturation(effectLevel, 0.42, 4);
  return {
    variance: control,
    recoilKickScale: control,
    recoilRecoveryRate: 2 - control,
    reloadDuration: saturation(effectLevel, 0.55, 5),
    rackDuration: saturation(effectLevel, 0.62, 3),
  };
};

/** Stance time and ready gait are read from the firearms-combat skill's content tuning. */
export const firearmStanceEffects = (level: number, tuning: FirearmsCombatTuning): FirearmStanceEffects => {
  const effectLevel = effectLevelFor(level);
  return {
    raiseDuration:
      tuning.raiseMinimumSeconds + tuning.raiseRangeSeconds * saturation(effectLevel, 0, tuning.raiseHalfLifeLevels),
    readyMovementFactor:
      tuning.readyMovementMinimum +
      tuning.readyMovementRange * (effectLevel / (effectLevel + tuning.readyMovementHalfLifeLevels)),
  };
};
