import { SKILL_LEVEL_MAX } from './character.ts';
import type { Registry } from './content.ts';

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
