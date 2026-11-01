import type { BlockEntity } from '../core/blockEntities.ts';
import type { CraftCharacter } from '../core/character.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { CraftCommands } from '../core/craftCommands.ts';
import {
  type CraftPreference,
  type CraftSources,
  indexCraftReach,
  planCraft,
  requirementStatus,
} from '../core/crafting.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { LongJob } from '../core/longAction.ts';
import { decimalText, volumeText } from '../core/numberText.ts';
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
  {
    simSeconds,
    clockRatio,
    compressionActive,
  }: {
    readonly simSeconds: number;
    readonly clockRatio: number;
    readonly compressionActive: boolean;
  },
): TimedActionPresentation | undefined => {
  if (job?.jobType !== 'craft' || job.stopped) {
    return undefined;
  }
  const item = inventory.itemByUid(job.workUid);
  if (!item?.work) {
    return undefined;
  }
  const text = craftingText(inventory.registry);
  const draws =
    item.work.kind === 'craft'
      ? (item.work.liquids ?? []).flatMap((draw) =>
          draw.sources.map((source) => {
            const vessel = inventory.itemByUid(source.uid);
            return fillText(text.liquidDraw, {
              liquid: inventory.registry.liquids.get(draw.liquid)!.name,
              volume: volumeText(source.volumeMicrolitres / 1000),
              vessel: vessel ? inventory.registry.items.get(vessel.type)!.name : decimalText(source.uid),
            });
          }),
        )
      : [];
  return {
    durationGameSeconds: item.work.duration,
    elapsedGameSeconds: Math.min(
      item.work.duration,
      item.work.elapsed + (compressionActive ? Math.max(0, simSeconds - job.last) * clockRatio : 0),
    ),
    kind: 'craft',
    label: [workName(inventory.registry, item), ...draws].join(' · '),
    stopped: false,
  };
};
export interface CraftRow {
  id: string;
  name: string;
  /** The repair subject or craft result name, for the start button. */
  itemName: string;
  kind: 'craft' | 'repair';
  time: string;
  reason: string | undefined;
  components: {
    group: number;
    preferred: string;
    alternatives: { kind: 'item' | 'liquid'; id: string; name: string; needed: number; found: number }[];
    draws: string[];
    automatic: boolean;
    vessels: { uid: number; label: string; selected: boolean }[];
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
  sources = {},
  startReason,
  entityRepair,
}: {
  registry: Registry;
  character: CraftCharacter;
  reach: ReachSnapshot;
  preferences: Readonly<Record<string, CraftPreference>>;
  sources?: Readonly<Record<string, CraftSources>>;
  startReason: string | undefined;
  entityRepair?: { target: BlockEntity; crafting: Pick<CraftCommands, 'previewEntityRepair'> };
}): CraftRow[] =>
  [...character.knownRecipes]
    .filter((id) => {
      const recipe = registry.recipes.get(id)!;
      return (
        !recipe.activation &&
        (entityRepair ? recipe.repair?.entity === entityRepair.target.type : recipe.repair?.entity === undefined)
      );
    })
    .sort()
    .map((id) => {
      const recipe = registry.recipes.get(id)!;
      const prefer = preferences[id];
      const result = planCraft(recipe, reach, character, { prefer, sources: sources[id] });
      const status = requirementStatus(recipe, reach, character);
      const text = craftingText(registry);
      const itemName = recipe.repair?.entity
        ? registry.furniture.get(recipe.repair.entity)!.name
        : registry.items.get(recipe.result.item)!.name;
      return {
        id,
        name: recipe.kind === 'repair' ? fillText(text.repairName, { item: itemName }) : itemName,
        itemName,
        kind: recipe.kind === 'repair' ? 'repair' : 'craft',
        time: craftTime('plan' in result ? result.plan.gather + result.plan.work : recipe.timeGameMinutes, text),
        reason: entityRepair
          ? entityRepair.crafting.previewEntityRepair(id, entityRepair.target.uid, prefer, sources[id]).refusal
          : recipeStartReason(recipe, result, reach, { startReason, noRepairTarget: text.noRepairTarget }),
        components: status.components.map(({ alternatives, group }) => ({
          group,
          preferred: prefer?.[group] ? JSON.stringify(prefer[group]) : '',
          alternatives: alternatives.map((a) => ({
            kind: a.kind,
            id: JSON.stringify(a.kind === 'item' ? { kind: a.kind, item: a.item } : { kind: a.kind, liquid: a.liquid }),
            name: a.kind === 'item' ? registry.items.get(a.item)!.name : registry.liquids.get(a.liquid)!.name,
            needed: a.needed,
            found: a.available,
          })),
          automatic: sources[id]?.[group] === undefined,
          vessels: [
            ...new Map(
              alternatives
                .filter((a) => a.kind === 'liquid')
                .flatMap((a) => indexCraftReach(reach, recipe.consumeFitted).byLiquid.get(a.liquid) ?? [])
                .map((entry) => [entry.item.uid, entry]),
            ).values(),
          ].map(({ item }) => ({
            uid: item.uid,
            label: fillText(text.sourceVessel, {
              vessel: registry.items.get(item.type)!.name,
              volume: volumeText(
                item.liquidContents!.kind === 'filled' ? item.liquidContents!.volumeMicrolitres / 1000 : 0,
              ),
            }),
            selected: sources[id]?.[group]?.includes(item.uid) ?? false,
          })),
          draws:
            'plan' in result
              ? result.plan.liquids
                  .filter((draw) => draw.group === group)
                  .flatMap((draw) =>
                    draw.sources.map((source) =>
                      fillText(text.liquidDraw, {
                        liquid: registry.liquids.get(draw.liquid)!.name,
                        volume: volumeText(source.volumeMicrolitres / 1000),
                        vessel: registry.items.get(source.item.type)!.name,
                      }),
                    ),
                  )
              : [],
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
