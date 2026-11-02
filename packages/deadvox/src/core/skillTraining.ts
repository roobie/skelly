import { claimed, claimedId } from './capabilities.ts';
import { SKILL_LEVEL_MAX } from './character.ts';
import type { Registry } from './content.ts';
import { isLongGun } from './firearmFitting.ts';
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

// The skill schema's completeness check makes these tunings present on a loaded core skill.
export const inventoryManagementTuning = (registry: Registry) => {
  const tuning = claimed(registry.skills, 'inventoryManagement')?.inventory;
  if (!tuning) {
    throw new Error('Missing inventory tuning on capability "inventoryManagement"');
  }
  return tuning;
};

export const firearmsCombatTuning = (registry: Registry) => {
  const tuning = claimed(registry.skills, 'firearmsCombat')?.combat?.firearms;
  if (!tuning) {
    throw new Error('Missing firearms tuning on capability "firearmsCombat"');
  }
  return tuning;
};

export const firearmSteadinessSkill = (registry: Registry, firearm: ItemDef | undefined): string =>
  isLongGun(firearm)
    ? firearmsCombatTuning(registry).longGunSteadinessSkill
    : claimedId(registry.skills, 'firearmsCombat');

export const firearmShotPracticeSkill = (registry: Registry, firearm: ItemDef, sighted: boolean): string =>
  sighted ? firearmSteadinessSkill(registry, firearm) : claimedId(registry.skills, 'firearmsCombat');

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
