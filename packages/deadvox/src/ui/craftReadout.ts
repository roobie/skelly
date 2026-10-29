// Read-only crafting projection: one reach index, no item ownership or commands.
import type { CraftCharacter } from '../core/character.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { type CraftPreference, planCraft, requirementStatus } from '../core/crafting.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { LongJob } from '../core/longAction.ts';
import { decimalText } from '../core/numberText.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import type { TimedActionPresentation } from './hud.ts';

export const craftingText = (registry: Registry): ScreenText['crafting'] =>
  registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.crafting;
export const craftTime = (seconds: number, text: ScreenText['crafting']): string =>
  seconds >= 60
    ? fillText(text.mins, { value: decimalText(seconds / 60) })
    : fillText(text.secs, { value: decimalText(seconds) });
export const workName = (registry: Registry, item: Item): string => {
  const { work } = item;
  const text = craftingText(registry);
  if (work?.kind === 'disassembly') {
    return fillText(text.disassembly, { item: registry.items.get(work.source)!.name });
  }
  const recipe = work?.kind === 'craft' ? registry.recipes.get(work.recipe) : undefined;
  if (!recipe) {
    return registry.items.get(item.type)!.name;
  }
  const { name } = recipe.repair?.entity
    ? registry.furniture.get(recipe.repair.entity)!
    : registry.items.get(recipe.result.item)!;
  return fillText(recipe.kind === 'repair' ? text.repairing : text.inProgress, { item: name });
};
/** A running craft is progress in the handling HUD; a paused one has none, so a dropped work item shows nothing. */
export const runningCraftPresentation = (
  inventory: Inventory,
  job: Readonly<LongJob> | undefined,
): TimedActionPresentation | undefined => {
  if (job?.jobType !== 'craft' || job.stopped) {
    return undefined;
  }
  const item = inventory.itemByUid(job.workUid);
  if (!item?.work) {
    return undefined;
  }
  // The work record already carries the elapsed and duration the presentation reads.
  return { ...item.work, kind: 'craft', label: workName(inventory.registry, item), stopped: false };
};
export interface CraftRow {
  id: string;
  name: string;
  /** The result's own name, for the start button. */
  itemName: string;
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
  { startReason, noRepairTarget }: { startReason: string | undefined; noRepairTarget: string },
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
    return noRepairTarget;
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
  [...character.knownRecipes]
    .filter((id) => !registry.recipes.get(id)!.activation)
    .sort()
    .map((id) => {
      const recipe = registry.recipes.get(id)!;
      const prefer = preferences[id];
      const result = planCraft(recipe, reach, character, prefer);
      const status = requirementStatus(recipe, reach, character);
      const text = craftingText(registry);
      const itemName = registry.items.get(recipe.result.item)!.name;
      return {
        id,
        name: recipe.kind === 'repair' ? fillText(text.repairName, { item: itemName }) : itemName,
        itemName,
        kind: recipe.kind === 'repair' ? 'repair' : 'craft',
        time: craftTime('plan' in result ? result.plan.gather + result.plan.work : recipe.timeGameMinutes, text),
        reason: recipeStartReason(recipe, result, reach, { startReason, noRepairTarget: text.noRepairTarget }),
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
