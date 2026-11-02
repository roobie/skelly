import { buildRegistry } from '../../src/core/content.ts';
import type { ContentFile } from '../../src/core/schema.ts';
import { baseSources } from '../../src/game/bundledContent.ts';

export const withoutCombatSkills = () => {
  const omitted = new Set(['firearmsCombat', 'meleeCombat', 'inventoryManagement']);
  return buildRegistry(
    baseSources.map(({ source, data }) => {
      const file = data as ContentFile;
      return {
        source,
        data: {
          ...file,
          ...(file.skills ? { skills: file.skills.filter((skill) => !omitted.has(String(skill.capability))) } : {}),
        },
      };
    }),
  );
};
