// Read-only crafting projection: one reach index, no item ownership or commands.
import type { CraftCharacter } from '../core/character.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import { type CraftPreference, planCraft, requirementStatus } from '../core/crafting.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { LongJob } from '../core/longAction.ts';
import type { ReachSnapshot } from '../core/reach.ts';

export const craftTime = (seconds: number): string =>
  seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`;
export const workName = (registry: Registry, item: Item): string => {
  const recipe = item.work && registry.recipes.get(item.work.recipe);
  if (!recipe) {
    return registry.items.get(item.type)!.name;
  }
  const { name } = registry.items.get(recipe.result.item)!;
  return recipe.kind === 'repair' ? `Repairing ${name}` : `${name} in progress`;
};
export interface CraftStatus {
  uid: number;
  name: string;
  progress: string;
  percent: number;
  stopped: boolean;
  reason: string | undefined;
}
export const craftStatus = (
  inventory: Inventory,
  uid: number | undefined,
  job: Readonly<LongJob> | undefined,
  reason: string | undefined,
): CraftStatus | undefined => {
  const item = uid === undefined ? undefined : inventory.itemByUid(uid);
  if (!item?.work) {
    return undefined;
  }
  const { elapsed, duration, recipe: id } = item.work;
  const work = inventory.registry.recipes.get(id)!.time * 60;
  const gather = duration - work;
  return {
    uid: item.uid,
    name: workName(inventory.registry, item),
    progress:
      elapsed < gather
        ? `Gathering · ${craftTime(elapsed)} / ${craftTime(gather)}`
        : `Work · ${craftTime(Math.max(0, elapsed - gather))} / ${craftTime(work)}`,
    percent: Math.round((elapsed / duration) * 100),
    stopped: job?.jobType !== 'craft' || job.stopped,
    reason,
  };
};
export interface CraftRow {
  id: string;
  name: string;
  kind: 'craft' | 'repair';
  time: string;
  reason: string | undefined;
  components: {
    group: number;
    preferred: string;
    alternatives: { id: string; name: string; needed: number; found: number }[];
  }[];
  qualities: { name: string; required: number; best: number }[];
  skills: { name: string; required: number; available: number }[];
  workstation: string | null;
}
const recipeStartReason = (
  recipe: RecipeDef,
  result: ReturnType<typeof planCraft>,
  reach: ReachSnapshot,
  startReason: string | undefined,
): string | undefined => {
  if (startReason) {
    return startReason;
  }
  if ('missing' in result) {
    return result.missing.reason;
  }
  if (
    recipe.kind === 'repair' &&
    !reach.entries.some(
      (entry) => entry.item.type === recipe.result.item && entry.item.count === 1 && entry.item.condition < 1,
    )
  ) {
    return 'No damaged repair target in reach';
  }
  return undefined;
};

export const craftRows = ({
  registry,
  character,
  reach,
  preferences,
  startReason,
}: {
  registry: Registry;
  character: CraftCharacter;
  reach: ReachSnapshot;
  preferences: Readonly<Record<string, CraftPreference>>;
  startReason: string | undefined;
}): CraftRow[] =>
  [...character.knownRecipes].sort().map((id) => {
    const recipe = registry.recipes.get(id)!;
    const prefer = preferences[id];
    const result = planCraft(recipe, reach, character, prefer);
    const status = requirementStatus(recipe, reach, character);
    return {
      id,
      name: `${recipe.kind === 'repair' ? 'Repair: ' : ''}${registry.items.get(recipe.result.item)!.name}`,
      kind: recipe.kind === 'repair' ? 'repair' : 'craft',
      time: craftTime('plan' in result ? result.plan.gather + result.plan.work : recipe.time * 60),
      reason: recipeStartReason(recipe, result, reach, startReason),
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
      workstation: recipe.workstation ?? null,
    };
  });
