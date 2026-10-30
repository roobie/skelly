import type { Registry } from '../core/content.ts';
import type { CraftPreference, requirementStatus } from '../core/crafting.ts';
import type { CraftRow } from './craftReadout.ts';

// A base readout can be overlaid independently, so this adapter must not need its runtime exports.
export const craftRequirementRows = (
  registry: Registry,
  status: ReturnType<typeof requirementStatus>,
  prefer: CraftPreference | undefined,
): Pick<CraftRow, 'components' | 'qualities' | 'skills'> => ({
  components: status.components.map(({ alternatives, group }) => ({
    group,
    preferred: prefer?.[group] ?? '',
    alternatives: alternatives.map((a) => ({
      id: a.item,
      name: registry.items.get(a.item)!.name,
      needed: a.needed,
      found: a.available,
    })),
  })),
  qualities: status.qualities.map(({ quality, required, available }) => ({
    name: quality,
    required,
    best: available,
  })),
  skills: status.skills.map(({ skill, required, available }) => ({
    name: registry.skills.get(skill)!.name,
    required,
    available,
  })),
});
