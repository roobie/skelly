import { SKILL_LEVEL_MAX, skillEffectLevel } from './character.ts';

export interface MeleeCombatTuning {
  readonly blockChanceMinimum: number;
  readonly blockChanceRange: number;
  readonly blockChanceHalfLifeLevels: number;
}

export interface MeleeCombatEffects {
  readonly blockChance: number;
}

/** Blocking effectiveness improves monotonically and legendary uses ordinary-top effects. */
export const meleeCombatEffects = (level: number, tuning: MeleeCombatTuning): MeleeCombatEffects => {
  if (!Number.isFinite(level) || level < 0) {
    throw new Error('Invalid melee combat skill level');
  }
  const effective = skillEffectLevel(Math.min(level, SKILL_LEVEL_MAX));
  return {
    blockChance:
      tuning.blockChanceMinimum +
      tuning.blockChanceRange * (effective / (effective + tuning.blockChanceHalfLifeLevels)),
  };
};

export const blocksAttack = (level: number, roll: number, tuning: MeleeCombatTuning): boolean => {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new Error('Invalid block roll');
  }
  return roll < meleeCombatEffects(level, tuning).blockChance;
};
