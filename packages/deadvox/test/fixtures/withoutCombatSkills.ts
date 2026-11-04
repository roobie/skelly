import { buildRegistry } from '../../src/core/content.ts';
import type { ContentFile } from '../../src/core/schema.ts';
import { baseSources } from '../../src/game/bundledContent.ts';

// Admission is fixture setup, not baseline handling work; each caller still owns its mutable registry.
const fixture = (() => {
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
})();

export const withoutCombatSkills = () => structuredClone(fixture);
