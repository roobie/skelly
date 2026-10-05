// Static type reachability, not an inventory/quantity/seed or whole-game solver.
import { startingKnownRecipes } from './character.ts';
import type { RecipeDef, Registry } from './content.ts';
import { HAMLET_TEMPLATES, possibleHamletZombies } from './hamlet.ts';
import { WORK_IN_PROGRESS } from './inventory.ts';
import { compileTemplate, type SpawnMarker } from './templates.ts';

/** Deferred source contracts. Their owning milestones must promote these to hard checks. */
export const PENDING_REACHABILITY = { workstation: '2.8' } as const;

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

const qualityReady = (registry: Registry, items: ReadonlySet<string>, quality: string, level: number): boolean =>
  [...items].some((id) => (registry.items.get(id)?.tool?.qualities[quality] ?? 0) >= level);

/** Both closures start at loot, never at declared recipe results. Tools gate only the second. */
const closure = (
  registry: Registry,
  {
    found,
    tools,
    knowledge,
    skills,
  }: {
    found: ReadonlySet<string>;
    tools: boolean;
    knowledge: ReadonlySet<string>;
    skills: ReadonlySet<string>;
  },
): Set<string> => {
  const items = new Set(found);
  let previous: number;
  do {
    previous = items.size;
    for (const recipe of registry.recipes.values()) {
      if (
        recipe.kind !== 'repair' &&
        knowledge.has(recipe.id) &&
        Object.entries(recipe.skills).every(([skill, level]) => level === 0 || skills.has(skill)) &&
        inputsReady(recipe, items) &&
        (!tools ||
          Object.entries(recipe.qualities).every(([quality, level]) => qualityReady(registry, items, quality, level)))
      ) {
        items.add(recipe.result.item);
      }
    }
  } while (items.size !== previous);
  return items;
};

const worldSources = (registry: Registry) => {
  const roots = new Set<string>();
  const workstations = new Set<string>();
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
      const workstation = registry.furniture.get(piece.furniture)?.workstation;
      if (workstation) {
        workstations.add(workstation.id);
      }
    }
    markers.set(id, template.spawns);
  }
  for (const id of possibleHamletZombies(markers)) {
    const loot = registry.zombies.get(id)?.loot;
    if (loot !== undefined) {
      roots.add(loot);
    }
  }
  return { found: addLoot(registry, roots), workstations };
};

type Pending = RecipeDiagnostic & { kind: keyof typeof PENDING_REACHABILITY };
const pendingFor = (recipe: RecipeDef, workstations: ReadonlySet<string>): Pending[] => {
  const pending: Pending[] = [];
  const defer = (kind: keyof typeof PENDING_REACHABILITY, path: string) => {
    pending.push({ recipe: recipe.id, path, kind, message: `pending: no source yet (${PENDING_REACHABILITY[kind]})` });
  };
  if (typeof recipe.workstation === 'string' && !workstations.has(recipe.workstation)) {
    defer('workstation', '.workstation');
  }
  return pending;
};

const recipeDiagnostics = (
  registry: Registry,
  components: ReadonlySet<string>,
  toolReachable: ReadonlySet<string>,
  {
    workstations,
    knowledge,
    skills,
  }: { workstations: ReadonlySet<string>; knowledge: ReadonlySet<string>; skills: ReadonlySet<string> },
) => {
  const issues: RecipeDiagnostic[] = [];
  const pending: Pending[] = [];
  for (const recipe of registry.recipes.values()) {
    if (!knowledge.has(recipe.id)) {
      issues.push({
        recipe: recipe.id,
        path: '.knowledge',
        message: `recipe "${recipe.id}" has no starting or reachable book knowledge source`,
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
    for (const [skill, level] of Object.entries(recipe.skills)) {
      if (level > 0 && !skills.has(skill)) {
        issues.push({
          recipe: recipe.id,
          path: `.skills.${skill}`,
          message: `no reachable practice source can raise "${skill}" to level ${level}`,
        });
      }
    }
    for (const [quality, level] of Object.entries(recipe.qualities)) {
      if (!qualityReady(registry, toolReachable, quality, level)) {
        issues.push({
          recipe: recipe.id,
          path: `.qualities.${quality}`,
          message: `no reachable tool provides "${quality}" level ${level} without bootstrapping its own requirements`,
        });
      }
    }
    pending.push(...pendingFor(recipe, workstations));
  }
  return { issues, pending };
};

const knownRecipes = (registry: Registry, found: ReadonlySet<string>, known: ReadonlySet<string>) => {
  const taught = new Set(known);
  for (const item of found) {
    for (const recipe of registry.items.get(item)?.book?.recipes ?? []) {
      taught.add(recipe);
    }
  }
  return taught;
};

const canPracticeRecipe = (
  recipe: RecipeDef,
  {
    registry,
    tools,
    skills,
    knowledge,
    workstations,
  }: {
    registry: Registry;
    tools: ReadonlySet<string>;
    skills: ReadonlySet<string>;
    knowledge: ReadonlySet<string>;
    workstations: ReadonlySet<string>;
  },
): boolean =>
  knowledge.has(recipe.id) &&
  inputsReady(recipe, tools) &&
  Object.entries(recipe.skills).every(([skill, level]) => level === 0 || skills.has(skill)) &&
  Object.entries(recipe.qualities).every(([quality, level]) => qualityReady(registry, tools, quality, level)) &&
  (typeof recipe.workstation !== 'string' || workstations.has(recipe.workstation));

const reachableSkills = (
  registry: Registry,
  found: ReadonlySet<string>,
  workstations: ReadonlySet<string>,
  knowledge: ReadonlySet<string>,
): Set<string> => {
  const skills = new Set<string>();
  let tools = new Set(found);
  let changed: boolean;
  do {
    tools = closure(registry, { found, tools: true, knowledge, skills });
    changed = false;
    for (const recipe of registry.recipes.values()) {
      if (canPracticeRecipe(recipe, { registry, tools, skills, knowledge, workstations })) {
        for (const skill of Object.keys(recipe.skills)) {
          if (!skills.has(skill)) {
            skills.add(skill);
            changed = true;
          }
        }
      }
    }
  } while (changed);
  return skills;
};

export const checkReachability = (
  registry: Registry,
  known: ReadonlySet<string> = new Set(startingKnownRecipes(registry)),
) => {
  const { found, workstations } = worldSources(registry);
  const knowledge = knownRecipes(registry, found, known);
  const skills = reachableSkills(registry, found, workstations, knowledge);
  const components = closure(registry, { found, tools: false, knowledge, skills });
  const toolReachable = closure(registry, { found, tools: true, knowledge, skills });
  const { issues, pending } = recipeDiagnostics(registry, components, toolReachable, {
    workstations,
    knowledge,
    skills,
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
