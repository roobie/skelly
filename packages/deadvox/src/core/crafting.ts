// Pure craft planning: no removal, effect, timer or world mutation.
import type { BlockEntity } from './blockEntities.ts';
import { type CraftCharacter, SKILL_LEVEL_MIN, skillEffectLevel } from './character.ts';
import type { RecipeDef, Registry } from './content.ts';
import { coreMessage } from './coreText.ts';
import { allocateLiquids, type CraftLiquid, type LiquidDemand } from './craftLiquids.ts';
import type { DisassemblyPlan } from './disassembly.ts';
import type { Location } from './inventory.ts';
import { craftComponentEligible, type Item, isEmpty } from './items.ts';
import { countText } from './numberText.ts';
import type { ReachEntry, ReachSnapshot } from './reach.ts';

interface CraftComponent {
  item: Item;
  count: number;
  from: Location;
}
interface CraftPlan {
  kind: 'craft';
  recipe: string;
  components: CraftComponent[];
  liquids: CraftLiquid[];
  tools: { item: Item; quality: string }[];
  workstation?: BlockEntity;
  /** Game seconds, not simulation seconds. */
  gather: number;
  work: number;
}
export type WorkPlan = CraftPlan | DisassemblyPlan;
interface CraftMissing {
  reason: string;
  knowledge: boolean;
  skills: { skill: string; required: number; available: number }[];
  qualities: { quality: string; required: number; available: number }[];
  workstation?: string;
  /** Raw stock per alternative; groups and tools may compete for it. */
  components: { group: number; alternatives: (AlternativeRef & { needed: number; available: number })[] }[];
}
export type CraftRequirements = Omit<CraftMissing, 'reason'>;
export type CraftResult = { plan: CraftPlan } | { missing: CraftMissing };
export type AlternativeRef = { kind: 'item'; item: string } | { kind: 'liquid'; liquid: string };
export type CraftPreference = Readonly<Record<number, AlternativeRef>>;
export type CraftSources = Readonly<Record<number, readonly number[]>>;
const alternativeRef = (input: RecipeDef['components'][number][number]): AlternativeRef =>
  'item' in input ? { kind: 'item', item: input.item } : { kind: 'liquid', liquid: input.liquid };
const sameAlternative = (a: AlternativeRef, b: AlternativeRef): boolean =>
  a.kind === b.kind &&
  ('item' in a && 'item' in b ? a.item === b.item : 'liquid' in a && 'liquid' in b && a.liquid === b.liquid);

interface ReachIndex {
  byType: Map<string, ReachEntry[]>;
  byLiquid: Map<string, ReachEntry[]>;
  qualities: Map<string, { entry: ReachEntry; level: number }[]>;
}
const indexes = new WeakMap<ReachSnapshot, Map<boolean, ReachIndex>>();
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
  liquids: plan.liquids.map((draw) => ({
    ...draw,
    sources: draw.sources.map((source) => ({ ...source, from: { ...source.from } })),
  })),
});
const liquidVolume = (item: Item): number =>
  item.liquidContents?.kind === 'filled' ? item.liquidContents.volumeMicrolitres : 0;
const indexLiquidReach = (snapshot: ReachSnapshot): Map<string, ReachEntry[]> => {
  const byLiquid = new Map<string, ReachEntry[]>();
  for (const entry of snapshot.entries) {
    const { item } = entry;
    const contents = item.liquidContents;
    if (
      contents?.kind !== 'filled' ||
      !snapshot.player.inventory.planLiquidDraws([
        { uid: item.uid, liquid: contents.liquid, volumeMicrolitres: contents.volumeMicrolitres },
      ]).ok
    ) {
      continue;
    }
    const vessels = byLiquid.get(contents.liquid) ?? [];
    vessels.push(entry);
    byLiquid.set(contents.liquid, vessels);
  }
  for (const entries of byLiquid.values()) {
    entries.sort(
      (a, b) =>
        a.handlingTime - b.handlingTime || liquidVolume(a.item) - liquidVolume(b.item) || a.item.uid - b.item.uid,
    );
  }
  return byLiquid;
};

/** Derived per-snapshot index, not an owning UID lookup or a global item registry. */
export const indexCraftReach = (snapshot: ReachSnapshot, consumeFitted = false): ReachIndex => {
  const cached = indexes.get(snapshot)?.get(consumeFitted);
  if (cached) {
    return cached;
  }
  const byType = new Map<string, ReachEntry[]>();
  const qualities = new Map<string, { entry: ReachEntry; level: number }[]>();
  let byLiquid: Map<string, ReachEntry[]> | undefined;
  for (const entry of snapshot.entries) {
    const { item } = entry;
    if (craftComponentEligible(item, consumeFitted)) {
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
  const index = {
    byType,
    qualities,
    get byLiquid() {
      byLiquid ??= indexLiquidReach(snapshot);
      return byLiquid;
    },
  };
  const variants = indexes.get(snapshot) ?? new Map<boolean, ReachIndex>();
  variants.set(consumeFitted, index);
  indexes.set(snapshot, variants);
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

/** Handling is authored in simulation seconds; plans and work durations are game seconds. */
export const gatherGameSeconds = (handlingTime: number, clockRatio: number): number => handlingTime * clockRatio;

/** Spec ordering within a type; retrieving a stack costs once, even for a partial count. */
const allocate = (
  entries: readonly ReachEntry[],
  needed: number,
  reserved: ReadonlySet<number>,
  clockRatio: number,
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
    allocation.gather += gatherGameSeconds(handlingTime, clockRatio);
    remaining -= count;
    if (remaining === 0) {
      return allocation;
    }
  }
  return undefined;
};

const equipmentStatus = (recipe: RecipeDef, snapshot: ReachSnapshot, character: CraftCharacter): CraftRequirements => {
  const index = indexCraftReach(snapshot, recipe.consumeFitted);
  return {
    knowledge: !character.knownRecipes.has(recipe.id),
    skills: Object.entries(recipe.skills).map(([skill, required]) => ({
      skill,
      required,
      available: skillEffectLevel(character.skills[skill] ?? SKILL_LEVEL_MIN),
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
    components: [],
  };
};

/** Raw requirement status shared by planning and readouts, before filtering shortages. */
export const requirementStatus = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  character: CraftCharacter,
): CraftRequirements => {
  const index = indexCraftReach(snapshot, recipe.consumeFitted);
  return {
    ...equipmentStatus(recipe, snapshot, character),
    components: recipe.components.map((group, number) => ({
      group: number,
      alternatives: group.map((alternative) =>
        'item' in alternative
          ? {
              kind: 'item' as const,
              item: alternative.item,
              needed: alternative.count,
              available: (index.byType.get(alternative.item) ?? []).reduce((sum, entry) => sum + entry.item.count, 0),
            }
          : {
              kind: 'liquid' as const,
              liquid: alternative.liquid,
              needed: alternative.volumeMicrolitres,
              available: (index.byLiquid.get(alternative.liquid) ?? []).reduce(
                (sum, entry) =>
                  sum +
                  (entry.item.liquidContents!.kind === 'filled' ? entry.item.liquidContents!.volumeMicrolitres : 0),
                0,
              ),
            },
      ),
    })),
  };
};

interface CraftSelection {
  prefer?: CraftPreference | undefined;
  sources?: CraftSources | undefined;
}
interface Combination {
  group: number;
  requirements: Map<string, number>;
  demands: LiquidDemand[];
}
function* componentAlternatives(
  context: { recipe: RecipeDef; index: ReachIndex; prefer: CraftPreference; sources: CraftSources },
  { group, requirements, demands }: Combination = { group: 0, requirements: new Map(), demands: [] },
): Generator<Omit<Combination, 'group'>> {
  const { recipe, index, prefer, sources } = context;
  if (group === recipe.components.length) {
    yield { requirements, demands };
    return;
  }
  for (const alternative of recipe.components[group]!) {
    if (prefer[group] !== undefined && !sameAlternative(prefer[group]!, alternativeRef(alternative))) {
      continue;
    }
    const next = new Map(requirements);
    if ('item' in alternative) {
      next.set(alternative.item, (next.get(alternative.item) ?? 0) + alternative.count);
      yield* componentAlternatives(context, { group: group + 1, requirements: next, demands });
    } else {
      const candidates = index.byLiquid.get(alternative.liquid) ?? [];
      const allowed =
        sources[group] === undefined
          ? candidates
          : [...new Set(sources[group])].flatMap((uid) => candidates.filter((entry) => entry.item.uid === uid));
      yield* componentAlternatives(context, {
        group: group + 1,
        requirements: next,
        demands: [
          ...demands,
          { group, liquid: alternative.liquid, volumeMicrolitres: alternative.volumeMicrolitres, allowed },
        ],
      });
    }
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
  clockRatio: number,
): Allocation | undefined => {
  const reserved = new Set(tools.map((tool) => tool.item.uid));
  const allocation: Allocation = { components: [], gather: 0 };
  for (const [type, count] of [...requirements].sort(([a], [b]) => a.localeCompare(b))) {
    const picked = allocate(index.byType.get(type) ?? [], count, reserved, clockRatio);
    if (!picked) {
      return undefined;
    }
    allocation.components.push(...picked.components);
    allocation.gather += picked.gather;
  }
  return allocation;
};

export const craftWorkDuration = (recipe: RecipeDef, character: CraftCharacter, workFactorBonus = 0): number => {
  const skillLevel = Math.max(
    SKILL_LEVEL_MIN,
    ...Object.keys(recipe.skills).map((skill) => skillEffectLevel(character.skills[skill] ?? SKILL_LEVEL_MIN)),
  );
  return (recipe.timeGameMinutes * (1 - workFactorBonus)) / (1 + skillLevel * 0.1);
};

const craftPlan = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  { allocation, tools, character }: { allocation: Allocation; tools: CraftPlan['tools']; character: CraftCharacter },
): CraftPlan => {
  const workstation = recipe.workstation
    ? snapshot.workstations
        .filter((station) => stationMatches(recipe, station))
        .sort((a, b) => b.workFactorBonus - a.workFactorBonus || a.entity.uid - b.entity.uid)[0]
    : undefined;
  const work = craftWorkDuration(recipe, character, workstation?.workFactorBonus);
  return {
    kind: 'craft',
    recipe: recipe.id,
    liquids: [],
    ...allocation,
    tools,
    ...(workstation ? { workstation: workstation.entity } : {}),
    work,
  };
};

const refusalReason = (
  registry: Registry,
  recipe: RecipeDef,
  prefer: CraftPreference,
  missing: CraftRequirements,
): string | undefined => {
  for (const [number, ref] of Object.entries(prefer)) {
    if (!recipe.components[Number(number)]?.some((alternative) => sameAlternative(ref, alternativeRef(alternative)))) {
      return `Invalid alternative for group ${number}`;
    }
  }
  if (missing.knowledge) {
    return coreMessage(registry, 'recipeUnknown');
  }
  if (missing.skills.some(({ available, required }) => available < required)) {
    return coreMessage(registry, 'skillTooLow');
  }
  const quality = missing.qualities.find(({ available, required }) => available < required);
  if (quality) {
    return coreMessage(registry, 'toolNotInReach', { quality: quality.quality });
  }
  if (missing.workstation) {
    return coreMessage(registry, 'workstationNotInReach');
  }
  return undefined;
};

const componentRefusal = (snapshot: ReachSnapshot, status: CraftRequirements, prefer: CraftPreference): string => {
  const { registry } = snapshot.player.inventory;
  const shortage = status.components.find(
    ({ group, alternatives }) =>
      !alternatives.some(
        (candidate) =>
          (prefer[group] === undefined || sameAlternative(prefer[group]!, candidate)) &&
          candidate.available >= candidate.needed,
      ),
  );
  const alternative = shortage?.alternatives.find(
    (candidate) => prefer[shortage.group] === undefined || sameAlternative(prefer[shortage.group]!, candidate),
  );
  if (alternative?.kind === 'liquid') {
    return coreMessage(registry, 'craftLiquidShort', { liquid: registry.liquids.get(alternative.liquid)!.name });
  }
  if (alternative?.kind === 'item') {
    return coreMessage(registry, 'componentsShort', {
      count: countText(alternative.needed),
      item: registry.items.get(alternative.item)!.name.toLowerCase(),
      found: countText(alternative.available),
    });
  }
  return coreMessage(registry, Object.keys(prefer).length > 0 ? 'preferredCompete' : 'componentsCompete');
};

/** Shared equipment/knowledge/skill admission; components are held in escrow on Continue. */
export const admissionRefusal = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  character: CraftCharacter,
): string | undefined =>
  refusalReason(snapshot.player.inventory.registry, recipe, {}, equipmentStatus(recipe, snapshot, character));

const stationMatches = (recipe: RecipeDef, station: ReachSnapshot['workstations'][number]): boolean =>
  Boolean(recipe.workstation) && station.id === recipe.workstation;

/** Native recipe validator caps alternative combinations at 1,024. */
export const planCraft = (
  recipe: RecipeDef,
  snapshot: ReachSnapshot,
  character: CraftCharacter,
  { prefer = {}, sources = {} }: CraftSelection = {},
): CraftResult => {
  const index = indexCraftReach(snapshot, recipe.consumeFitted);
  const status = requirementStatus(recipe, snapshot, character);
  const missing: CraftMissing = {
    ...status,
    reason: '',
    skills: status.skills.filter(({ available, required }) => available < required),
    qualities: status.qualities.filter(({ available, required }) => available < required),
  };
  const refusal = (reason: string): CraftResult => ({ missing: { ...missing, reason } });
  const requirementReason = refusalReason(snapshot.player.inventory.registry, recipe, prefer, missing);
  if (requirementReason) {
    return refusal(requirementReason);
  }

  const cache = cachedPlans(snapshot, recipe);
  const skillKey = Object.keys(recipe.skills)
    .sort()
    .map((skill) => [skill, skillEffectLevel(character.skills[skill] ?? SKILL_LEVEL_MIN)]);
  const key = JSON.stringify([
    Object.entries(prefer).sort(([a], [b]) => Number(a) - Number(b)),
    Object.entries(sources).sort(([a], [b]) => Number(a) - Number(b)),
    skillKey,
  ]);
  const componentReason = componentRefusal(snapshot, status, prefer);
  const componentFailure = (): CraftResult => {
    // Blame the selected vessels only if the craft is feasible without that restriction.
    const sourcesShort =
      Object.keys(sources).length > 0 && 'plan' in planCraft(recipe, snapshot, character, { prefer });
    return refusal(
      sourcesShort ? coreMessage(snapshot.player.inventory.registry, 'craftSourcesShort') : componentReason,
    );
  };
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached ? { plan: copyPlan(cached) } : componentFailure();
  }
  const best = bestCraftAllocation({ recipe, snapshot, index, character }, { prefer, sources });
  cache.set(key, best ?? null);
  return best ? { plan: copyPlan(best) } : componentFailure();
};

const liquidGather = (liquids: CraftLiquid[], allocation: Allocation, snapshot: ReachSnapshot): number => {
  const handled = new Set(allocation.components.map(({ item }) => item.uid));
  let gather = 0;
  for (const source of liquids.flatMap((draw) => draw.sources)) {
    if (handled.has(source.item.uid)) {
      continue;
    }
    handled.add(source.item.uid);
    const entry = snapshot.entries.find(({ item }) => item === source.item)!;
    gather += gatherGameSeconds(entry.handlingTime, snapshot.player.clock.ratio);
  }
  return gather;
};
const bestCraftAllocation = (
  {
    recipe,
    snapshot,
    index,
    character,
  }: { recipe: RecipeDef; snapshot: ReachSnapshot; index: ReachIndex; character: CraftCharacter },
  { prefer, sources }: { prefer: CraftPreference; sources: CraftSources },
): CraftPlan | undefined => {
  let best: CraftPlan | undefined;
  const toolNeeds = Object.entries(recipe.qualities)
    .filter(([quality, level]) => !snapshot.workstations.some((station) => (station.qualities[quality] ?? 0) >= level))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const { requirements, demands } of componentAlternatives({ recipe, prefer, index, sources })) {
    const liquids = allocateLiquids(demands);
    if (!liquids) {
      continue;
    }
    for (const tools of toolSelections(toolNeeds, index, requirements)) {
      const allocation = allocateCombination(requirements, index, tools, snapshot.player.clock.ratio);
      if (!allocation) {
        continue;
      }
      allocation.gather += liquidGather(liquids, allocation, snapshot);
      if (!best || compareAllocation(allocation, best) < 0) {
        best = { ...craftPlan(recipe, snapshot, { allocation, tools, character }), liquids };
      }
    }
  }
  return best;
};
