import type { RecipeDef, Registry, ScreenText } from '@skelly/engine/content';
import { repairTargetName } from '@skelly/engine/content';
import {
  type ConditionBand,
  type CraftCommands,
  type CraftPreference,
  type CraftSources,
  claimed,
  type Inventory,
  type Item,
  indexCraftReach,
  instanceName,
  jobName,
  pieceRecoveryWork,
  planCraft,
  repairCeiling,
  requirementStatus,
} from '@skelly/engine/inventory';
import { compareCodeUnits } from '@skelly/engine/packs';
import type { CraftCharacter, LongJob, ReachSnapshot } from '@skelly/engine/sim';
import { decimalText, fillText, volumeText } from '@skelly/engine/text';
import type { BlockEntity } from '@skelly/engine/world';
import type { TimedActionPresentation } from './hud.ts';

export const craftingText = (registry: Registry): ScreenText['crafting'] =>
  claimed(registry.ui, 'interface')!.screenText.crafting;
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
  if (work?.kind === 'partService') {
    return jobName(registry, work);
  }
  const recipe = work?.kind === 'craft' ? registry.recipes.get(work.recipe) : undefined;
  if (!recipe) {
    return instanceName(registry, item);
  }
  return fillText(recipe.kind === 'repair' ? text.repairing : text.inProgress, {
    item: repairTargetName(registry, recipe),
  });
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
  kind: 'craft' | 'repair' | 'take_apart' | 'remove_part' | 'fit_part' | 'continue';
  /** The commitment strip's formatted length line, from `craftTime`; the time left when `progress` is set. */
  length: string;
  /** A resumed job's formatted time worked and in all. */
  progress?: { done: string; total: string };
  /** The inputs a resumed job holds, read-only. */
  held?: { name: string; count: number }[];
  /** A world repair's condition bands now and after the repair. */
  condition?: { now: ConditionBand; after: ConditionBand };
  /** A part service's slot and part: the band of the part leaving, or of the spare going in when one is in reach. */
  part?: { slot: string; condition?: ConditionBand };
  /** Where a fit's spare lies, worded. */
  where?: string;
  /** Take apart's read-only yield; crafting and repair choose inputs instead. */
  yields?: { name: string; count: number }[];
  reason: string | undefined;
  components: {
    group: number;
    preferred: string;
    selected: string;
    alternatives: { kind: 'item' | 'liquid'; id: string; name: string; needed: number; found: number }[];
    draws: string[];
    automatic: boolean;
    vessels: { uid: number; label: string; selected: boolean }[];
  }[];
  qualities: { name: string; required: number; best: number }[];
  skills: { name: string; required: number; available: number }[];
  workstation: string | null;
}
/** An activation or world repair recipe never starts from the catalogue; the all-known view says where it does. */
const startsElsewhere = (recipe: RecipeDef, text: ScreenText['crafting'], allKnown: boolean): string | undefined => {
  if (!allKnown) {
    return undefined;
  }
  if (recipe.activation) {
    return text.startsFromItem;
  }
  if (recipe.repair?.block !== undefined) {
    return text.startsFromCell;
  }
  return recipe.repair?.entity === undefined ? undefined : text.startsFromPiece;
};
const recipeStartReason = (
  recipe: RecipeDef,
  result: ReturnType<typeof planCraft>,
  reach: ReachSnapshot,
  {
    startReason,
    noRepairTarget,
    ceiling,
  }: { startReason: string | undefined; noRepairTarget: string; ceiling: number },
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
      (entry) =>
        'item' in recipe.result &&
        entry.item.type === recipe.result.item &&
        entry.item.count === 1 &&
        entry.item.condition < ceiling,
    )
  ) {
    return noRepairTarget;
  }
  return undefined;
};

/** Taking a pinned piece apart: the command owner's preview yield and refusal, read-only. */
export const takeApartRow = (
  registry: Registry,
  target: BlockEntity | import('./cellWork.ts').CellWorldWork,
  crafting: Pick<CraftCommands, 'previewTakeApartEntity' | 'previewTakeApartCell'>,
): CraftRow => {
  const text = craftingText(registry);
  const cell = 'cell' in target;
  const projection = cell ? crafting.previewTakeApartCell(target.cell) : crafting.previewTakeApartEntity(target.uid);
  const plan = 'plan' in projection ? projection.plan : projection.work;
  const { refusal } = projection;
  const itemName = cell
    ? registry.blocks[registry.blockIds.get(target.block)!]!.name
    : registry.furniture.get(target.type)!.name;
  const gameSeconds =
    plan?.timeGameMinutes ?? (cell ? 0 : pieceRecoveryWork(registry, target.type)?.timeGameMinutes) ?? 0;
  return {
    id: `take_apart:${cell ? target.cell.join(',') : target.uid}`,
    name: fillText(text.takeApartName, { item: itemName }),
    itemName,
    kind: 'take_apart',
    length: craftTime(gameSeconds, text),
    yields: (plan?.outputs ?? []).map(({ item, count }) => ({ name: registry.items.get(item)!.name, count })),
    reason: refusal,
    components: [],
    qualities: [],
    skills: [],
    workstation: null,
  };
};

/** The job a pinned piece hosts, as its Continue resumes it: the command owner's progress, holdings and refusal. */
export const pieceWorkRow = (
  registry: Registry,
  target: BlockEntity,
  crafting: Pick<CraftCommands, 'previewPieceWork'>,
): { row: CraftRow; workUid: number } | undefined => {
  const work = crafting.previewPieceWork(target.uid);
  if (!work) {
    return undefined;
  }
  const text = craftingText(registry);
  const named = (entries: { item: string; count: number }[]) =>
    entries.map(({ item, count }) => ({ name: registry.items.get(item)!.name, count }));
  return {
    workUid: work.workUid,
    row: {
      id: `continue:${work.workUid}`,
      name: work.name,
      itemName: work.name,
      kind: 'continue',
      length: craftTime(Math.max(0, work.durationGameSeconds - work.elapsedGameSeconds), text),
      progress: {
        done: craftTime(work.elapsedGameSeconds, text),
        total: craftTime(work.durationGameSeconds, text),
      },
      held: named(work.held),
      yields: named(work.outputs),
      reason: work.refusal,
      components: [],
      qualities: [],
      skills: [],
      workstation: null,
    },
  };
};

export const craftRows = ({
  registry,
  character,
  reach,
  preferences,
  sources = {},
  startReason,
  entityRepair,
  cellRepair,
  recipeIds,
  allKnown = false,
}: {
  registry: Registry;
  character: CraftCharacter;
  reach: ReachSnapshot;
  preferences: Readonly<Record<string, CraftPreference>>;
  sources?: Readonly<Record<string, CraftSources>>;
  startReason: string | undefined;
  entityRepair?: { target: BlockEntity; crafting: Pick<CraftCommands, 'previewEntityRepair'> };
  cellRepair?: { target: import('./cellWork.ts').CellWorldWork; crafting: Pick<CraftCommands, 'previewCellRepair'> };
  recipeIds?: readonly string[];
  /** The all-known view reviews every known recipe; those that cannot start from the catalogue read as refused. */
  allKnown?: boolean;
}): CraftRow[] => {
  const matchesTarget = (recipe: RecipeDef): boolean => {
    if (cellRepair) {
      return recipe.repair?.block === cellRepair.target.block;
    }
    return entityRepair
      ? recipe.repair?.entity === entityRepair.target.type
      : recipe.repair?.entity === undefined && recipe.repair?.block === undefined;
  };
  const previewWorld = (id: string, prefer: CraftPreference | undefined) => {
    if (cellRepair) {
      return cellRepair.crafting.previewCellRepair(id, cellRepair.target.cell, prefer, sources[id]);
    }
    return entityRepair?.crafting.previewEntityRepair(id, entityRepair.target.uid, prefer, sources[id]);
  };
  return [...(recipeIds ?? character.knownRecipes)]
    .filter((id) => {
      const recipe = registry.recipes.get(id)!;
      return character.knownRecipes.has(id) && (allKnown || (!recipe.activation && matchesTarget(recipe)));
    })
    .sort(compareCodeUnits)
    .map((id) => {
      const recipe = registry.recipes.get(id)!;
      const prefer = preferences[id];
      const result = planCraft(recipe, reach, character, { prefer, sources: sources[id] });
      const status = requirementStatus(recipe, reach, character);
      const selected = 'plan' in result ? result.plan.selectedAlternatives : {};
      const text = craftingText(registry);
      const itemName = repairTargetName(registry, recipe);
      const world = previewWorld(id, prefer);
      return {
        id,
        name: recipe.kind === 'repair' ? fillText(text.repairName, { item: itemName }) : itemName,
        itemName,
        kind: recipe.kind === 'repair' ? 'repair' : 'craft',
        length: craftTime('plan' in result ? result.plan.gather + result.plan.work : recipe.timeGameMinutes, text),
        ...(world?.condition ? { condition: world.condition } : {}),
        reason: world
          ? world.refusal
          : recipeStartReason(recipe, result, reach, {
              startReason: startsElsewhere(recipe, text, allKnown) ?? startReason,
              noRepairTarget: text.noRepairTarget,
              ceiling: repairCeiling(registry, recipe),
            }),
        components: status.components.map(({ alternatives, group }) => ({
          group,
          preferred: prefer?.[group] ? JSON.stringify(prefer[group]) : '',
          selected: prefer?.[group] || selected[group] ? JSON.stringify(prefer?.[group] ?? selected[group]) : '',
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
};
