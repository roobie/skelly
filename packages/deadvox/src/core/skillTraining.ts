import { claimed } from './capabilities.ts';
import { SKILL_LEVEL_MAX } from './character.ts';
import type { Registry } from './content.ts';
import { isLongGun } from './firearmFitting.ts';
import type { FirearmsCombatTuning } from './firearmsSkill.ts';
import type { MeleeCombatTuning } from './meleeCombat.ts';
import type { ItemDef } from './schema.ts';

export const craftingActivityTier = (requiredLevel: number, offset: number): number => {
  if (
    !Number.isSafeInteger(requiredLevel) ||
    requiredLevel < 0 ||
    requiredLevel > SKILL_LEVEL_MAX ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new Error('Invalid crafting skill tier input');
  }
  return Math.min(SKILL_LEVEL_MAX, requiredLevel + offset);
};

const rangedTuning = (registry: Registry) => {
  const tuning = claimed(registry.rangedTuning, 'ranged');
  if (!tuning) {
    throw new Error('Missing ranged mechanism tuning');
  }
  return tuning;
};

export const firearmsCombatTuning = (registry: Registry): FirearmsCombatTuning => {
  const policy = claimed(registry.combatPolicy, 'player')?.firearms;
  if (!policy) {
    throw new Error('Missing firearms combat policy');
  }
  const skill = claimed(registry.skills, 'firearmsCombat');
  const effects = skill?.combat?.firearms;
  const { caseEjection, shotTraceRangeBlocks } = rangedTuning(registry);
  return {
    caseEjection,
    shotTraceRangeBlocks,
    ...policy,
    ...effects,
    curve: skill?.curve,
    breathHold: { ...policy.breathHold, ...effects?.breathHold },
  };
};

export const meleeCombatTuning = (registry: Registry): MeleeCombatTuning | undefined => {
  const policy = claimed(registry.combatPolicy, 'player')?.melee;
  return policy && { ...policy, ...claimed(registry.skills, 'meleeCombat')?.combat?.melee };
};

export const firearmSteadinessSkill = (registry: Registry, firearm: ItemDef | undefined): string | undefined => {
  const skill = claimed(registry.skills, 'firearmsCombat');
  return isLongGun(firearm) ? skill?.combat?.firearms?.longGunSteadinessSkill : skill?.id;
};

export const firearmShotPracticeSkill = (registry: Registry, firearm: ItemDef, sighted: boolean): string | undefined =>
  sighted ? firearmSteadinessSkill(registry, firearm) : claimed(registry.skills, 'firearmsCombat')?.id;

const skillActivityTraining = (registry: Registry, skillId: string, activityId: string) => {
  const activity = registry.skills.get(skillId)?.training?.activities?.[activityId];
  if (!activity) {
    throw new Error(`Missing training activity ${skillId}.${activityId}`);
  }
  return activity;
};

export const skillActivityPractice = (registry: Registry, skillId: string, activityId: string) => {
  const { practice, tier } = skillActivityTraining(registry, skillId, activityId);
  if (practice === undefined) {
    throw new Error(`Training activity ${skillId}.${activityId} has no practice amount`);
  }
  return { practice, tier };
};

export const skillActivityPracticeRate = (registry: Registry, skillId: string, activityId: string) => {
  const { practicePerSimSecond: practicePerSecond, tier } = skillActivityTraining(registry, skillId, activityId);
  if (practicePerSecond === undefined) {
    throw new Error(`Training activity ${skillId}.${activityId} has no practice rate`);
  }
  return { practicePerSecond, tier };
};
