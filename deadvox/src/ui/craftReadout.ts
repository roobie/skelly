// Read-only crafting projection: one reach index, no item ownership or commands.
import type { CraftCharacter } from '../core/character.ts';
import type { Registry } from '../core/content.ts';
import { type CraftPreference, indexCraftReach, planCraft } from '../core/crafting.ts';
import type { Inventory } from '../core/inventory.ts';
import { type Item, isEmpty } from '../core/items.ts';
import type { LongJob } from '../core/longAction.ts';
import type { ReachSnapshot } from '../core/reach.ts';

export const craftTime = (seconds: number): string =>
  seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`;
export const workName = (registry: Registry, item: Item): string => {
  const recipe = item.work && registry.recipes.get(item.work.recipe);
  return recipe ? `${registry.items.get(recipe.result.item)!.name} in progress` : registry.items.get(item.type)!.name;
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
  job: Readonly<LongJob> | undefined,
  reason: string | undefined,
): CraftStatus | undefined => {
  const item = job?.jobType === 'craft' ? inventory.itemByUid(job.workUid) : inventory.hands.right;
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
}): CraftRow[] => {
  const index = indexCraftReach(reach);
  return [...character.knownRecipes].sort().map((id) => {
    const recipe = registry.recipes.get(id)!;
    const prefer = preferences[id];
    const result = planCraft(recipe, reach, character, prefer);
    return {
      id,
      name: registry.items.get(recipe.result.item)!.name,
      time: craftTime('plan' in result ? result.plan.gather + result.plan.work : recipe.time * 60),
      reason: startReason ?? ('missing' in result ? result.missing.reason : undefined),
      components: recipe.components.map((alternatives, group) => ({
        group,
        preferred: prefer?.[group] ?? '',
        alternatives: alternatives.map((a) => ({
          id: a.item,
          name: registry.items.get(a.item)!.name,
          needed: a.count,
          found: (index.byType.get(a.item) ?? [])
            .filter((e) => isEmpty(e.item))
            .reduce((sum, e) => sum + e.item.count, 0),
        })),
      })),
      qualities: Object.entries(recipe.qualities).map(([name, required]) => ({
        name,
        required,
        best: Math.max(0, ...(index.qualities.get(name) ?? []).map((entry) => entry.level)),
      })),
      skills: Object.entries(recipe.skills).map(([name, required]) => ({
        name: registry.skills.get(name)!.name,
        required,
        available: character.skills[name] ?? 0,
      })),
      workstation: recipe.workstation ?? null,
    };
  });
};
