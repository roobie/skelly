import { claimed } from './capabilities.ts';
import { type CraftCharacter, skillEffectLevel } from './character.ts';
import type { RecipeDef, Registry } from './content.ts';
import { SKILL_LEVEL_MIN } from './skillLevels.ts';

export const recipeSkillRequirements = (registry: Registry, recipe: Pick<RecipeDef, 'skills'>) =>
  Object.entries(recipe.skills).flatMap(([role, level]) => {
    const provider = claimed(registry.skills, role);
    return provider ? [{ skill: provider.id, level, provider }] : [];
  });

export const recipeSkillLevel = (registry: Registry, character: CraftCharacter, role: string): number => {
  const provider = claimed(registry.skills, role);
  return provider ? skillEffectLevel(character.skills[provider.id] ?? SKILL_LEVEL_MIN) : SKILL_LEVEL_MIN;
};
