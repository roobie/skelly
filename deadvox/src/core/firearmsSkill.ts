import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, skillEffectLevel, skillSaturation } from './character.ts';

export interface FirearmsSkillEffects {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryRate: number;
  readonly reloadDuration: number;
  readonly rackDuration: number;
}

const expertControl = skillSaturation(SKILL_LEVEL_MAX, 0.42, 4);
const recoilKickAtZero = 3;
/** Independent, monotone and saturating effects for the firearms skill. */
export const firearmsSkillEffects = (level: number): FirearmsSkillEffects => {
  if (!Number.isSafeInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_LEGENDARY) {
    throw new Error('Invalid firearms skill level');
  }
  // BR ruled legendary mostly vanity, so it shares the ordinary expert's mechanics.
  const effectLevel = skillEffectLevel(level);
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
