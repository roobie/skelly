// Static type reachability, not an inventory/quantity/seed or whole-game solver.
import { startingKnownRecipes } from './character.ts';
import type { FurnitureDef, RecipeDef, Registry } from './content.ts';
import { HAMLET_TEMPLATES, possibleHamletZombies } from './hamlet.ts';
import { WORK_IN_PROGRESS } from './inventory.ts';
import { compileTemplate, type SpawnMarker } from './templates.ts';

/** Deferred source contracts. Their owning milestones must promote these to hard checks. */
export const PENDING_REACHABILITY = { skill: '2.5' } as const;

/** BR's content-count exclusions for the current base; extend with new debug/case/part definitions. */
export const CONTENT_COUNT_EXCLUSIONS: ReadonlySet<string> = new Set([
  WORK_IN_PROGRESS, // Runtime-owned escrow, not an acquired content type.
  'debug_shotgun_pump',
  'debug_rifle_assault',
  'spent_case_5_d_56x45',
  'shambler_torso',
  'shambler_left_arm',
  'shambler_right_arm',
  'shambler_left_leg',
  'shambler_right_leg',
]);

interface RecipeDiagnostic {
  recipe: string;
  /** Suffix of the winning recipe's origin path. */
  path: string;
  message: string;
}

/** Walk only positive-probability, positive-count loot, once per table. */
const addLoot = (registry: Registry, roots: ReadonlySet<string>): Set<string> => {
  const items = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const table = registry.loot.get(id);
    if (!table || table.rolls[1] === 0) {
      return;
    }
    for (const entry of table.entries) {
      if (entry.table !== undefined) {
        visit(entry.table);
      } else if (entry.item !== undefined && (entry.count?.[1] ?? 1) > 0) {
        items.add(entry.item);
      }
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return items;
};

const inputsReady = (recipe: RecipeDef, items: ReadonlySet<string>): boolean =>
  recipe.components.every((group) => group.some((component) => items.has(component.item)));

interface QualitySources {
  registry: Registry;
  items: ReadonlySet<string>;
  workstationQualities: ReadonlyMap<string, number>;
}

const qualityReady = (
  { registry, items, workstationQualities }: QualitySources,
  quality: string,
  level: number,
): boolean =>
  (workstationQualities.get(quality) ?? 0) >= level ||
  [...items].some((id) => (registry.items.get(id)?.tool?.qualities[quality] ?? 0) >= level);

interface ClosureInput {
  registry: Registry;
  found: ReadonlySet<string>;
  tools: boolean;
  knowledge: ReadonlySet<string>;
  workstationQualities: ReadonlyMap<string, number>;
}

/** Both closures start at loot, never at declared recipe results. Tools gate only the second. */
const closure = ({ registry, found, tools, knowledge, workstationQualities }: ClosureInput): Set<string> => {
  const items = new Set(found);
  let previous: number;
  do {
    previous = items.size;
    for (const recipe of registry.recipes.values()) {
      if (
        recipe.kind !== 'repair' &&
        knowledge.has(recipe.id) &&
        inputsReady(recipe, items) &&
        (!tools ||
          Object.entries(recipe.qualities).every(([quality, level]) =>
            qualityReady({ registry, items, workstationQualities }, quality, level),
          ))
      ) {
        items.add(recipe.result.item);
      }
    }
  } while (items.size !== previous);
  return items;
};

const addWorkstationSource = (
  workstation: FurnitureDef['workstation'],
  workstations: Set<string>,
  workstationQualities: Map<string, number>,
): void => {
  if (!workstation) {
    return;
  }
  workstations.add(workstation.id);
  for (const [quality, level] of Object.entries(workstation.qualities)) {
    workstationQualities.set(quality, Math.max(workstationQualities.get(quality) ?? 0, level));
  }
};

const worldSources = (registry: Registry) => {
  const roots = new Set<string>();
  const workstations = new Set<string>();
  const workstationQualities = new Map<string, number>();
  const markers = new Map<string, readonly SpawnMarker[]>();
  // Compiling uses the actual marked pieces/spawns, not unused palette declarations.
  for (const id of HAMLET_TEMPLATES) {
    const definition = registry.templates.get(id);
    if (!definition) {
      continue; // A rejected/missing template provides no sources.
    }
    const template = compileTemplate(registry, definition);
    for (const piece of template.pieces) {
      if (piece.loot !== undefined) {
        roots.add(piece.loot);
      }
      addWorkstationSource(registry.furniture.get(piece.furniture)?.workstation, workstations, workstationQualities);
    }
    markers.set(id, template.spawns);
  }
  for (const id of possibleHamletZombies(markers)) {
    const loot = registry.zombies.get(id)?.loot;
    if (loot !== undefined) {
      roots.add(loot);
    }
  }
  return { found: addLoot(registry, roots), workstations, workstationQualities };
};

type Pending = RecipeDiagnostic & { kind: keyof typeof PENDING_REACHABILITY };
const pendingFor = (recipe: RecipeDef): Pending[] => {
  const pending: Pending[] = [];
  for (const [skill, level] of Object.entries(recipe.skills)) {
    if (level > 0) {
      pending.push({
        recipe: recipe.id,
        path: `.skills.${skill}`,
        kind: 'skill',
        message: `pending: no source yet (${PENDING_REACHABILITY.skill})`,
      });
    }
  }
  return pending;
};

const recipeDiagnostics = (
  registry: Registry,
  components: ReadonlySet<string>,
  toolReachable: ReadonlySet<string>,
  {
    workstations,
    workstationQualities,
    knowledge,
  }: {
    workstations: ReadonlySet<string>;
    workstationQualities: ReadonlyMap<string, number>;
    knowledge: ReadonlySet<string>;
  },
) => {
  const issues: RecipeDiagnostic[] = [];
  const pending: Pending[] = [];
  for (const recipe of registry.recipes.values()) {
    if (!knowledge.has(recipe.id)) {
      issues.push({
        recipe: recipe.id,
        path: '.knowledge',
        message: `recipe "${recipe.id}" has no starting knowledge source (books arrive in 2.5)`,
      });
    }
    recipe.components.forEach((group, g) => {
      group.forEach((component, a) => {
        if (!components.has(component.item)) {
          issues.push({
            recipe: recipe.id,
            path: `.components[${g}][${a}].item`,
            message: `item "${component.item}" is neither found nor craftable`,
          });
        }
      });
    });
    for (const [quality, level] of Object.entries(recipe.qualities)) {
      if (!qualityReady({ registry, items: toolReachable, workstationQualities }, quality, level)) {
        issues.push({
          recipe: recipe.id,
          path: `.qualities.${quality}`,
          message: `no reachable tool or placed workstation provides "${quality}" level ${level} without bootstrapping its own requirements`,
        });
      }
    }
    if (typeof recipe.workstation === 'string' && !workstations.has(recipe.workstation)) {
      issues.push({
        recipe: recipe.id,
        path: '.workstation',
        message: `workstation "${recipe.workstation}" is not placed in the hamlet`,
      });
    }
    pending.push(...pendingFor(recipe));
  }
  return { issues, pending };
};

export const checkReachability = (
  registry: Registry,
  known: ReadonlySet<string> = new Set(startingKnownRecipes(registry)),
) => {
  const { found, workstations, workstationQualities } = worldSources(registry);
  const components = closure({ registry, found, tools: false, knowledge: known, workstationQualities });
  const toolReachable = closure({ registry, found, tools: true, knowledge: known, workstationQualities });
  const { issues, pending } = recipeDiagnostics(registry, components, toolReachable, {
    workstations,
    workstationQualities,
    knowledge: known,
  });
  const eligible = [...registry.items.keys()].filter((id) => !CONTENT_COUNT_EXCLUSIONS.has(id));
  return {
    found,
    components,
    toolReachable,
    workstations,
    issues,
    pending,
    count: eligible.filter((id) => components.has(id)).length,
    defined: eligible.length,
    unreachable: eligible.filter((id) => !components.has(id)).sort(),
  };
};
