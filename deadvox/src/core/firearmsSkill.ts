import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, skillEffectLevel } from './character.ts';

export interface FirearmsSkillEffects {
  readonly variance: number;
  readonly recoilKickScale: number;
  readonly recoilRecoveryRate: number;
  readonly reloadDuration: number;
  readonly rackDuration: number;
}

const saturation = (level: number, floor: number, halfLife: number): number =>
  floor + (1 - floor) * (halfLife / (halfLife + level));
const expertControl = saturation(SKILL_LEVEL_MAX, 0.42, 4);
const recoilKickAtZero = 3;
/** Independent, monotone and saturating effects for the firearms skill. */
export const firearmsSkillEffects = (level: number): FirearmsSkillEffects => {
  if (!Number.isSafeInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_LEGENDARY) {
    throw new Error('Invalid firearms skill level');
  }
  // BR ruled legendary mostly vanity, so it shares the ordinary expert's mechanics.
  const effectLevel = skillEffectLevel(level);
  const control = saturation(effectLevel, 0.42, 4);
  const progressFromExpert = (control - expertControl) / (1 - expertControl);
  return {
    variance: control,
    recoilKickScale: expertControl + (recoilKickAtZero - expertControl) * progressFromExpert,
    recoilRecoveryRate: 2 - control,
    reloadDuration: saturation(effectLevel, 0.55, 5),
    rackDuration: saturation(effectLevel, 0.62, 3),
  };
};
