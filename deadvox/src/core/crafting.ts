// Pure craft planning: no removal, effect, timer or world mutation.
import type { BlockEntity } from './blockEntities.ts';
import type { CraftCharacter } from './character.ts';
import { CLOCK_RATIO } from './clock.ts';
import type { RecipeDef } from './content.ts';
import type { DisassemblyPlan } from './disassembly.ts';
import type { Location } from './inventory.ts';
import { type Item, isEmpty } from './items.ts';
import type { ReachEntry, ReachSnapshot } from './reach.ts';

export interface CraftComponent {
  item: Item;
  count: number;
  from: Location;
}
export interface CraftPlan {
  kind: 'craft';
  recipe: string;
  components: CraftComponent[];
  tools: { item: Item; quality: string }[];
  workstation?: BlockEntity;
  /** Game seconds, not simulation seconds. */
  gather: number;
  work: number;
}
export type WorkPlan = CraftPlan | DisassemblyPlan;
export interface CraftMissing {
  reason: string;
  knowledge: boolean;
  skills: { skill: string; required: number; available: number }[];
  qualities: { quality: string; required: number; available: number }[];
  workstation?: string;
  /** Raw stock per alternative; groups and tools may compete for it. */
  components: { group: number; alternatives: { item: string; needed: number; available: number }[] }[];
}
export type CraftRequirements = Omit<CraftMissing, 'reason'>;
export type CraftResult = { plan: CraftPlan } | { missing: CraftMissing };
/** Optional alternative item id for each component group, never a silent fallback. */
export type CraftPreference = Readonly<Record<number, string>>;

interface ReachIndex {
  byType: Map<string, ReachEntry[]>;
  qualities: Map<string, { entry: ReachEntry; level: number }[]>;
}
const indexes = new WeakMap<ReachSnapshot, ReachIndex>();
const plans = new WeakMap<ReachSnapshot, WeakMap<RecipeDef, Map<string, CraftPlan | null>>>();
const cachedPlans = (snapshot: ReachSnapshot, recipe: RecipeDef): Map<string, CraftPlan | null> => {
  let recipes = plans.get(snapshot);
  if (!recipes) {
    recipes = new WeakMap();
    plans.set(snapshot, recipes);
  }
  let cache = recipes.get(recipe);
  if (!cache) {
    cache = new Map();
    recipes.set(recipe, cache);
  }
  return cache;
};
// Copy plan records, not owned Items. A caller cannot mutate a later cached allocation.
const copyPlan = (plan: CraftPlan): CraftPlan => ({
  ...plan,
  components: plan.components.map((component) => ({ ...component, from: { ...component.from } })),
  tools: plan.tools.map((tool) => ({ ...tool })),
});
/** Derived per-snapshot index, not an owning UID lookup or a global item registry. */
export const indexCraftReach = (snapshot: ReachSnapshot): ReachIndex => {
  const cached = indexes.get(snapshot);
  if (cached) {
    return cached;
  }
  const byType = new Map<string, ReachEntry[]>();
  const qualities = new Map<string, { entry: ReachEntry; level: number }[]>();
  for (const entry of snapshot.entries) {
    const { item } = entry;
    if (isEmpty(item)) {
      const candidates = byType.get(item.type) ?? [];
      candidates.push(entry);
      byType.set(item.type, candidates);
    }
    if (item.condition <= 0) {
      continue;
    }
    for (const [quality, level] of Object.entries(
      snapshot.player.inventory.registry.items.get(item.type)?.tool?.qualities ?? {},
    )) {
      const providers = qualities.get(quality) ?? [];
      providers.push({ entry, level });
      qualities.set(quality, providers);
    }
  }
  for (const entries of byType.values()) {
    entries.sort((a, b) => a.handlingTime - b.handlingTime || stackTie(a.item, b.item));
  }
  const index = { byType, qualities };
  indexes.set(snapshot, index);
  return index;
};

const stackTie = (a: Item, b: Item): number => a.count - b.count || a.condition - b.condition || a.uid - b.uid;
interface Allocation {
  components: CraftComponent[];
  gather: number;
}
const compareAllocation = (a: Allocation, b: Allocation): number => {
  if (a.gather !== b.gather) {
    return a.gather - b.gather;
  }
  const left = [...a.components].sort((x, y) => stackTie(x.item, y.item));
  const right = [...b.components].sort((x, y) => stackTie(x.item, y.item));
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const difference = stackTie(left[i]!.item, right[i]!.item);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
};

/** Spec ordering within a type; retrieving a stack costs once, even for a partial count. */
const allocate = (
  entries: readonly ReachEntry[],
  needed: number,
  reserved: ReadonlySet<number>,
): Allocation | undefined => {
  const allocation: Allocation = { components: [], gather: 0 };
  let remaining = needed;
  // The snapshot index is already in cost/tie order. Reserving tools cannot change it.
  for (const entry of entries) {
    const { item } = entry;
    if (reserved.has(item.uid)) {
      continue;
    }
    const { location, handlingTime } = entry;
    const count = Math.min(item.count, remaining);
    allocation.components.push({ item, count, from: location });
    allocation.gather += handlingTime * CLOCK_RATIO;
    remaining -= count;
    if (remaining === 0) {
      return allocation;
    }
  }
  return undefined;
};

/** Raw requirement status shared by admission and readouts, before filtering shortages. */
export const requirementStatus = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  character: CraftCharacter,
): CraftRequirements => {
  const index = indexCraftReach(snapshot);
  return {
    knowledge: !character.knownRecipes.has(recipe.id),
    skills: Object.entries(recipe.skills).map(([skill, required]) => ({
      skill,
      required,
      available: character.skills[skill] ?? 0,
    })),
    qualities: Object.entries(recipe.qualities).map(([quality, required]) => ({
      quality,
      required,
      available: Math.max(
        0,
        ...(index.qualities.get(quality) ?? []).map((provider) => provider.level),
        ...snapshot.workstations.map((station) => station.qualities[quality] ?? 0),
      ),
    })),
    ...(recipe.workstation && !snapshot.workstations.some((station) => stationMatches(recipe, station))
      ? { workstation: recipe.workstation }
      : {}),
    components: recipe.components.map((group, number) => ({
      group: number,
      alternatives: group.map((alternative) => ({
        item: alternative.item,
        needed: alternative.count,
        available: (index.byType.get(alternative.item) ?? []).reduce((sum, entry) => sum + entry.item.count, 0),
      })),
    })),
  };
};

function* componentAlternatives(
  recipe: RecipeDef,
  prefer: CraftPreference,
  group = 0,
  requirements = new Map<string, number>(),
): Generator<Map<string, number>> {
  if (group === recipe.components.length) {
    yield requirements;
    return;
  }
  for (const alternative of recipe.components[group]!) {
    if (prefer[group] !== undefined && prefer[group] !== alternative.item) {
      continue;
    }
    const next = new Map(requirements);
    next.set(alternative.item, (next.get(alternative.item) ?? 0) + alternative.count);
    yield* componentAlternatives(recipe, prefer, group + 1, next);
  }
}

function* toolSelections(
  needs: [string, number][],
  index: ReachIndex,
  requirements: ReadonlyMap<string, number>,
): Generator<CraftPlan['tools']> {
  const providers = needs.map(([quality, level]) =>
    (index.qualities.get(quality) ?? []).filter((provider) => provider.level >= level),
  );
  // A type can reserve at most one UID per quality it supplies. Keep that many
  // representatives, not just one: multiple reservations can change greedy stack
  // allocation. At equal quantities/cost, reserve the better-condition/larger-UID
  // members so strictly preferred component members remain available. Condition
  // changes ordering, not provided quality levels (usable providers are already indexed).
  const limits = new Map<string, number>();
  for (const candidates of providers) {
    for (const type of new Set(candidates.map(({ entry }) => entry.item.type))) {
      limits.set(type, (limits.get(type) ?? 0) + 1);
    }
  }
  const choices = providers.map((candidates) => {
    const [free] = candidates
      .filter(({ entry }) => !requirements.has(entry.item.type))
      .sort((a, b) => a.entry.item.uid - b.entry.item.uid);
    const classes = new Map<string, ReachEntry[]>();
    for (const { entry } of candidates) {
      if (!requirements.has(entry.item.type)) {
        continue;
      }
      const key = JSON.stringify([entry.item.type, entry.item.count, entry.handlingTime, isEmpty(entry.item)]);
      const group = classes.get(key) ?? [];
      group.push(entry);
      classes.set(key, group);
    }
    const retained = [...classes.values()].flatMap((group) =>
      group.sort((a, b) => stackTie(b.item, a.item)).slice(0, limits.get(group[0]!.item.type)!),
    );
    return free ? [free.entry, ...retained] : retained;
  });
  // Different quality assignments with the same reserved UIDs have identical
  // future feasibility and allocation. Evaluate each reservation set only once.
  const visited = Array.from({ length: needs.length + 1 }, () => new Set<string>());
  function* visit(selected: CraftPlan['tools']): Generator<CraftPlan['tools']> {
    const position = selected.length;
    const key = [...new Set(selected.map(({ item }) => item.uid))].sort((a, b) => a - b).join(',');
    if (visited[position]!.has(key)) {
      return;
    }
    visited[position]!.add(key);
    if (position === needs.length) {
      yield selected;
      return;
    }
    const [quality] = needs[position]!;
    for (const entry of choices[position]!) {
      yield* visit([...selected, { item: entry.item, quality }]);
    }
  }
  yield* visit([]);
}

const allocateCombination = (
  requirements: ReadonlyMap<string, number>,
  index: ReachIndex,
  tools: CraftPlan['tools'],
): Allocation | undefined => {
  const reserved = new Set(tools.map((tool) => tool.item.uid));
  const allocation: Allocation = { components: [], gather: 0 };
  for (const [type, count] of [...requirements].sort(([a], [b]) => a.localeCompare(b))) {
    const picked = allocate(index.byType.get(type) ?? [], count, reserved);
    if (!picked) {
      return undefined;
    }
    allocation.components.push(...picked.components);
    allocation.gather += picked.gather;
  }
  return allocation;
};

const craftPlan = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  allocation: Allocation,
  tools: CraftPlan['tools'],
): CraftPlan => {
  const workstation = recipe.workstation
    ? snapshot.workstations
        .filter((station) => stationMatches(recipe, station))
        .sort((a, b) => b.workTimeBonus - a.workTimeBonus || a.entity.uid - b.entity.uid)[0]
    : undefined;
  const work = recipe.time * 60 * (1 - (workstation?.workTimeBonus ?? 0));
  return {
    kind: 'craft',
    recipe: recipe.id,
    ...allocation,
    tools,
    ...(workstation ? { workstation: workstation.entity } : {}),
    work,
  };
};

const refusalReason = (recipe: RecipeDef, prefer: CraftPreference, missing: CraftRequirements): string | undefined => {
  for (const [number, item] of Object.entries(prefer)) {
    if (!recipe.components[Number(number)]?.some((alternative) => alternative.item === item)) {
      return `Preferred ${item} is not an alternative for group ${number}`;
    }
  }
  if (missing.knowledge) {
    return 'Recipe not known';
  }
  if (missing.skills.some(({ available, required }) => available < required)) {
    return 'Skill level too low';
  }
  const quality = missing.qualities.find(({ available, required }) => available < required);
  if (quality) {
    return `Required ${quality.quality} tool is not in reach`;
  }
  if (missing.workstation) {
    return 'Required workstation not in reach';
  }
  return undefined;
};

const componentRefusal = (snapshot: ReachSnapshot, status: CraftRequirements, prefer: CraftPreference): string => {
  const shortage = status.components.find(
    ({ group, alternatives }) =>
      !alternatives.some(
        ({ item, available, needed }) => (prefer[group] === undefined || prefer[group] === item) && available >= needed,
      ),
  );
  const alternative = shortage?.alternatives.find(
    ({ item }) => prefer[shortage.group] === undefined || prefer[shortage.group] === item,
  );
  return alternative
    ? `Needs ${alternative.needed} ${snapshot.player.inventory.registry.items.get(alternative.item)!.name.toLowerCase()} (${alternative.available} found)`
    : `${Object.keys(prefer).length > 0 ? 'Preferred alternatives' : 'Components'} compete for the same stock or would consume a required tool`;
};

/** Shared equipment/knowledge/skill admission; components are held in escrow on Continue. */
export const admissionRefusal = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  character: CraftCharacter,
): string | undefined => refusalReason(recipe, {}, requirementStatus(recipe, snapshot, character));

export const stationMatches = (recipe: RecipeDef, station: ReachSnapshot['workstations'][number]): boolean =>
  Boolean(recipe.workstation) && station.id === recipe.workstation;

/** Native recipe validator caps alternative combinations at 1,024. */
export const planCraft = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  character: CraftCharacter,
  prefer: CraftPreference = {},
): CraftResult => {
  const index = indexCraftReach(snapshot);
  const status = requirementStatus(recipe, snapshot, character);
  const missing: CraftMissing = {
    ...status,
    reason: '',
    skills: status.skills.filter(({ available, required }) => available < required),
    qualities: status.qualities.filter(({ available, required }) => available < required),
  };
  const refusal = (reason: string): CraftResult => ({ missing: { ...missing, reason } });
  const requirementReason = refusalReason(recipe, prefer, missing);
  if (requirementReason) {
    return refusal(requirementReason);
  }

  const cache = cachedPlans(snapshot, recipe);
  const key = JSON.stringify(Object.entries(prefer).sort(([a], [b]) => Number(a) - Number(b)));
  const componentReason = componentRefusal(snapshot, status, prefer);
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached ? { plan: copyPlan(cached) } : refusal(componentReason);
  }
  let best: CraftPlan | undefined;
  const toolNeeds = Object.entries(recipe.qualities)
    .filter(([quality, level]) => !snapshot.workstations.some((station) => (station.qualities[quality] ?? 0) >= level))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const requirements of componentAlternatives(recipe, prefer)) {
    for (const tools of toolSelections(toolNeeds, index, requirements)) {
      const allocation = allocateCombination(requirements, index, tools);
      if (allocation && (!best || compareAllocation(allocation, best) < 0)) {
        best = craftPlan(recipe, snapshot, allocation, tools);
      }
    }
  }
  cache.set(key, best ?? null);
  return best ? { plan: copyPlan(best) } : refusal(componentReason);
};
