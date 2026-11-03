import { buildRegistry } from '../../src/core/content.ts';
import type { ContentFile } from '../../src/core/schema.ts';
import { baseSources } from '../../src/game/bundledContent.ts';

export const withoutCombatSkills = () => {
  const omitted = new Set(['firearmsCombat', 'meleeCombat', 'inventoryManagement']);
  const omittedIds = new Set(
    baseSources.flatMap(({ data }) =>
      ((data as ContentFile).skills ?? [])
        .filter((skill) => omitted.has(String(skill.capability)))
        .map((skill) => skill.id),
    ),
  );
  return buildRegistry(
    baseSources.map(({ source, data }) => {
      const file = data as ContentFile;
      return {
        source,
        data: {
          ...file,
          starts: file.starts?.filter((start) => Object.keys(start.skills).every((id) => !omittedIds.has(id))),
          ...(file.skills ? { skills: file.skills.filter((skill) => !omitted.has(String(skill.capability))) } : {}),
        },
      };
    }),
  );
};
