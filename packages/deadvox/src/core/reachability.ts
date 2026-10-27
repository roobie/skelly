// Static type reachability, not an inventory/quantity/seed or whole-game solver.
import { startingKnownRecipes } from './character.ts';
import type { FurnitureDef, RecipeDef, Registry } from './content.ts';
import { disassemblyOutputs } from './disassembly.ts';
import { scenarioSources } from './scenarioComposition.ts';
import type { ScenarioDef, SiteLayoutDef } from './schema.ts';
import { HORDE_TYPE, ordinarySpawnWeights } from './settlementSpawns.ts';
import { type CompiledTemplate, compileMapPiece, compileTemplate, kitSlotChoices } from './templates.ts';

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

const addItemOutputs = (registry: Registry, items: Set<string>): void => {
  for (const id of items) {
    const item = registry.items.get(id);
    for (const output of [item?.unpack?.item, item?.serving?.empty]) {
      if (output !== undefined) {
        items.add(output);
      }
    }
    // A default attachment arrives fitted to its host and comes off it as its own item.
    for (const fitted of registry.models.get(item?.model ?? '')?.gun?.attachments ?? []) {
      const child = [...registry.items.values()].find(
        (candidate) => registry.models.get(candidate.model ?? '')?.gun?.attachment?.id === fitted.id,
      );
      if (child) {
        items.add(child.id);
      }
    }
  }
};

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
  skills: ReadonlySet<string>;
  workstationQualities: ReadonlyMap<string, number>;
}

const addDisassemblyOutputs = (registry: Registry, items: Set<string>) => {
  for (const id of items) {
    const definition = registry.items.get(id);
    if (!definition) {
      continue;
    }
    const topSkill = Math.max(
      0,
      ...(definition.disassembly?.yields.map(({ fractions }) => fractions.length - 1) ?? []),
    );
    for (const output of disassemblyOutputs(definition, topSkill)) {
      items.add(output.item);
    }
  }
};

/** Both closures start at loot, never at declared recipe results. Tools gate only the second. */
const closure = ({ registry, found, tools, knowledge, skills, workstationQualities }: ClosureInput): Set<string> => {
  const items = new Set(found);
  let previous: number;
  do {
    previous = items.size;
    addItemOutputs(registry, items);
    addDisassemblyOutputs(registry, items);
    for (const recipe of registry.recipes.values()) {
      if (
        recipe.kind !== 'repair' &&
        knowledge.has(recipe.id) &&
        Object.entries(recipe.skills).every(([skill, level]) => level === 0 || skills.has(skill)) &&
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

const authoredFixedLootItems = (layouts: readonly SiteLayoutDef[]): Set<string> => {
  const items = new Set<string>();
  for (const layout of layouts) {
    for (const building of layout.buildings) {
      for (const override of building.fixedLoot ?? []) {
        for (const fixed of override.items) {
          items.add(fixed.item);
        }
      }
    }
  }
  return items;
};

const worldZombieTypes = (
  registry: Registry,
  layouts: readonly SiteLayoutDef[],
  scenarios: Iterable<ScenarioDef>,
): Set<string> => {
  const types = new Set(layouts.flatMap((layout) => layout.shamblers.map((spawn) => spawn.type)));
  const populations = [...scenarios].map((scenario) => scenario.population);
  if (layouts.some((layout) => layout.hordes?.length) || populations.some((population) => population.hordes > 0)) {
    types.add(HORDE_TYPE);
  }
  if (populations.some((population) => population.settlementPressure)) {
    for (const [type, weight] of ordinarySpawnWeights(registry)) {
      if (weight > 0) {
        types.add(type);
      }
    }
  }
  return types;
};

export interface ReachabilityScope {
  /** Site ids whose authored sources are included; absent means every playable site. */
  readonly sites?: ReadonlySet<string>;
}

const compiledSource = (registry: Registry, id: string): CompiledTemplate | undefined => {
  const template = registry.templates.get(id);
  if (template) {
    return compileTemplate(registry, template);
  }
  const piece = registry.mapPieces.get(id);
  return piece ? compileMapPiece(registry, piece) : undefined;
};

const assemblySourceIds = (registry: Registry, id: string): string[] => {
  const assembly = registry.mapAssemblies.get(id);
  return assembly
    ? assembly.slots.flatMap((slot) =>
        kitSlotChoices(registry, slot)
          .filter(({ weight }) => weight > 0)
          .map(({ ref }) => ref.id),
      )
    : [];
};

const sourceTemplates = (registry: Registry, ids: Iterable<string>) => {
  const templates: CompiledTemplate[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const source = compiledSource(registry, id);
    if (source) {
      templates.push(source);
      return;
    }
    for (const child of assemblySourceIds(registry, id)) {
      visit(child);
    }
  };
  for (const id of ids) {
    visit(id);
  }
  return templates;
};

const worldSources = (registry: Registry, scope: ReachabilityScope = {}) => {
  const roots = new Set<string>();
  const workstations = new Set<string>();
  const workstationQualities = new Map<string, number>();
  const selected = (id: string) => scope.sites === undefined || scope.sites.has(id);
  const authoredLayouts = [...registry.layouts.values()].filter((layout) => !layout.demo && selected(layout.id));
  const scenarios = [...registry.scenarios.values()].filter((scenario) => selected(scenario.id));
  const zombieTypes = worldZombieTypes(registry, authoredLayouts, scenarios);
  const authoredTemplates = authoredLayouts.flatMap((layout) => layout.buildings.map(({ template }) => template));
  const scenarioContent = scenarioSources(registry, scenarios);
  // Compilation follows every positive-weight kit alternative, not unused palette declarations.
  for (const template of sourceTemplates(registry, new Set([...authoredTemplates, ...scenarioContent.templates]))) {
    for (const piece of template.pieces) {
      if (piece.loot !== undefined) {
        roots.add(piece.loot);
      }
      addWorkstationSource(registry.furniture.get(piece.furniture)?.workstation, workstations, workstationQualities);
    }
    for (const marker of template.spawns.filter((spawn) => spawn.chance > 0)) {
      zombieTypes.add(marker.zombie);
    }
  }
  for (const id of zombieTypes) {
    const loot = registry.zombies.get(id)?.loot;
    if (loot !== undefined) {
      roots.add(loot);
    }
  }
  const rolled = addLoot(registry, roots);
  const placed = authoredFixedLootItems(authoredLayouts);
  for (const fixed of scenarioContent.fixedLoot.flatMap((source) => source.items)) {
    placed.add(fixed.item);
  }
  const found = new Set([...rolled, ...placed]);
  addItemOutputs(registry, found);
  return { found, placed, rolled, workstations, workstationQualities };
};

interface RecipeDiagnosticContext {
  registry: Registry;
  components: ReadonlySet<string>;
  toolReachable: ReadonlySet<string>;
  workstations: ReadonlySet<string>;
  workstationQualities: ReadonlyMap<string, number>;
  knowledge: ReadonlySet<string>;
  skills: ReadonlySet<string>;
}

const knowledgeIssues = (recipe: RecipeDef, knowledge: ReadonlySet<string>): RecipeDiagnostic[] =>
  knowledge.has(recipe.id)
    ? []
    : [
        {
          recipe: recipe.id,
          path: '.knowledge',
          message: `recipe "${recipe.id}" has no starting or reachable book knowledge source`,
        },
      ];

const componentIssues = (recipe: RecipeDef, components: ReadonlySet<string>): RecipeDiagnostic[] => {
  const issues: RecipeDiagnostic[] = [];
  for (let groupIndex = 0; groupIndex < recipe.components.length; groupIndex += 1) {
    const group = recipe.components[groupIndex]!;
    for (let alternativeIndex = 0; alternativeIndex < group.length; alternativeIndex += 1) {
      const component = group[alternativeIndex]!;
      if (!components.has(component.item)) {
        issues.push({
          recipe: recipe.id,
          path: `.components[${groupIndex}][${alternativeIndex}].item`,
          message: `item "${component.item}" is neither found nor craftable`,
        });
      }
    }
  }
  return issues;
};

const skillIssues = (recipe: RecipeDef, skills: ReadonlySet<string>): RecipeDiagnostic[] => {
  const issues: RecipeDiagnostic[] = [];
  for (const [skill, level] of Object.entries(recipe.skills)) {
    if (level > 0 && !skills.has(skill)) {
      issues.push({
        recipe: recipe.id,
        path: `.skills.${skill}`,
        message: `no reachable practice source can raise "${skill}" to level ${level}`,
      });
    }
  }
  return issues;
};

const qualityIssues = (
  recipe: RecipeDef,
  { registry, toolReachable, workstationQualities }: RecipeDiagnosticContext,
): RecipeDiagnostic[] => {
  const issues: RecipeDiagnostic[] = [];
  for (const [quality, level] of Object.entries(recipe.qualities)) {
    if (!qualityReady({ registry, items: toolReachable, workstationQualities }, quality, level)) {
      issues.push({
        recipe: recipe.id,
        path: `.qualities.${quality}`,
        message: `no reachable tool or placed workstation provides "${quality}" level ${level} without bootstrapping its own requirements`,
      });
    }
  }
  return issues;
};

const workstationIssues = (recipe: RecipeDef, workstations: ReadonlySet<string>): RecipeDiagnostic[] => {
  if (typeof recipe.workstation !== 'string' || workstations.has(recipe.workstation)) {
    return [];
  }
  return [
    {
      recipe: recipe.id,
      path: '.workstation',
      message: `workstation "${recipe.workstation}" is not placed in a playable world`,
    },
  ];
};

const recipeDiagnostics = (context: RecipeDiagnosticContext): { issues: RecipeDiagnostic[] } => {
  const issues: RecipeDiagnostic[] = [];
  for (const recipe of context.registry.recipes.values()) {
    issues.push(
      ...knowledgeIssues(recipe, context.knowledge),
      ...componentIssues(recipe, context.components),
      ...skillIssues(recipe, context.skills),
      ...qualityIssues(recipe, context),
      ...workstationIssues(recipe, context.workstations),
    );
  }
  return { issues };
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
    workstationQualities,
  }: {
    registry: Registry;
    tools: ReadonlySet<string>;
    skills: ReadonlySet<string>;
    knowledge: ReadonlySet<string>;
    workstations: ReadonlySet<string>;
    workstationQualities: ReadonlyMap<string, number>;
  },
): boolean =>
  knowledge.has(recipe.id) &&
  inputsReady(recipe, tools) &&
  Object.entries(recipe.skills).every(([skill, level]) => level === 0 || skills.has(skill)) &&
  Object.entries(recipe.qualities).every(([quality, level]) =>
    qualityReady({ registry, items: tools, workstationQualities }, quality, level),
  ) &&
  (typeof recipe.workstation !== 'string' || workstations.has(recipe.workstation));

interface ReachableSkillContext {
  registry: Registry;
  found: ReadonlySet<string>;
  workstations: ReadonlySet<string>;
  workstationQualities: ReadonlyMap<string, number>;
  knowledge: ReadonlySet<string>;
}

const reachableSkills = ({
  registry,
  found,
  workstations,
  workstationQualities,
  knowledge,
}: ReachableSkillContext): Set<string> => {
  const skills = new Set<string>();
  let tools = new Set(found);
  let changed: boolean;
  do {
    tools = closure({ registry, found, tools: true, knowledge, skills, workstationQualities });
    changed = false;
    for (const recipe of registry.recipes.values()) {
      if (canPracticeRecipe(recipe, { registry, tools, skills, knowledge, workstations, workstationQualities })) {
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
  scope?: ReachabilityScope,
) => {
  const { found, placed, rolled, workstations, workstationQualities } = worldSources(registry, scope);
  const knowledge = knownRecipes(registry, found, known);
  const skills = reachableSkills({ registry, found, workstations, workstationQualities, knowledge });
  const components = closure({ registry, found, tools: false, knowledge, skills, workstationQualities });
  const toolReachable = closure({ registry, found, tools: true, knowledge, skills, workstationQualities });
  const { issues } = recipeDiagnostics({
    registry,
    components,
    toolReachable,
    workstations,
    workstationQualities,
    knowledge,
    skills,
  });
  const eligible = [...registry.items.values()].filter((item) => !item.notLoot).map((item) => item.id);
  return {
    found,
    placed,
    rolled,
    components,
    toolReachable,
    workstations,
    issues,
    count: eligible.filter((id) => components.has(id)).length,
    defined: eligible.length,
    unreachable: eligible.filter((id) => !components.has(id)).sort(),
  };
};
