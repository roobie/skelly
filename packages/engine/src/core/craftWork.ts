// Native craft effects and live admission. Item progress/inputs stay Inventory-owned.

import type { BlockEntity } from './blockEntities.ts';
import { claimed } from './capabilities.ts';
import { type Character, dominantSide, offSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import { admissionRefusal } from './crafting.ts';
import {
  type DisassemblyPlan,
  planDisassembly,
  planPieceDisassembly,
  sameDisassemblyOutputs,
  samePieceDisassembly,
} from './disassembly.ts';
import { type Inventory, validateWorkItem } from './inventory.ts';
import type { Item } from './items.ts';
import type { CraftActionHooks } from './longAction.ts';
import type { ReachSnapshot } from './reach.ts';
import { recipeSkillRequirements } from './recipeSkills.ts';
import { type CellDisassemblyPlan, rubbleClearWork } from './rubble.ts';
import { craftingActivityTier } from './skillTraining.ts';
import { gameSecondsToMinutes } from './time.ts';

const inputsValid = (inventory: Inventory, item: Item): boolean => {
  try {
    validateWorkItem(inventory.registry, item);
    return true;
  } catch {
    return false;
  }
};

/** `work` is the repair's own work item once begun, which the piece's reservation admits. */
export const entityRepairRefusal = (
  inventory: Inventory,
  target: { uid: number; entityType: string | undefined; amount: number },
  work?: Item,
): string | undefined => {
  const entity = inventory.entities.byUid(target.uid);
  if (!entity || entity.type !== target.entityType || !inventory.entities.canRepair(entity, target.amount)) {
    return coreMessage(inventory.registry, 'repairTargetGone');
  }
  return (
    inventory.entities.useRefusal(entity, work) ??
    (inventory.canReachEntity(entity) ? undefined : coreMessage(inventory.registry, 'repairTargetOutOfReach'))
  );
};

/**
 * Why a rubble cell can't be cleared now, at Start, at each resume and at completion alike. A cell holds no
 * work item, so nothing reserves it: the pinned episode and reach revalidate live instead.
 */
export const cellTakeApartRefusal = (
  inventory: Inventory,
  target: { cell: Vec3; epoch?: number },
): string | undefined =>
  (inventory.rubble
    ? inventory.rubble.refusal(target.cell, target.epoch)
    : coreMessage(inventory.registry, 'rubbleGone')) ??
  (inventory.canReachCell(target.cell) ? undefined : coreMessage(inventory.registry, 'outOfReach'));

/**
 * Ownership only: the cell holds no work item, so the world's episode and reach gate the job, and the yield
 * must still match what the standing block's content gives.
 */
const cellDisassemblyAdmission = (inventory: Inventory, plan: CellDisassemblyPlan): string | undefined => {
  const standing = inventory.rubble?.standing(plan.cell);
  const current = standing ? rubbleClearWork(inventory.registry, standing) : undefined;
  return (
    cellTakeApartRefusal(inventory, { cell: plan.cell }) ??
    (current &&
    standing === plan.block &&
    current.timeGameMinutes === plan.timeGameMinutes &&
    sameDisassemblyOutputs(current.outputs, plan.outputs)
      ? undefined
      : coreMessage(inventory.registry, 'yieldChanged'))
  );
};

/** Releases a finished cell clearing through the world's clear; a refusal keeps the job paused in hand. */
const releaseCellClear = (
  inventory: Inventory,
  item: Item,
  work: Extract<NonNullable<Item['work']>, { kind: 'cellDisassembly' }>,
  release: { feet: () => Vec3; calendar: () => number; clear?: (cell: Vec3, epoch: number) => string | undefined },
): void => {
  const blocked =
    cellTakeApartRefusal(inventory, { cell: work.cell, epoch: work.epoch }) ??
    (release.clear ? undefined : 'No rubble owner for a cell taken apart');
  if (blocked) {
    throw new Error(blocked);
  }
  inventory.releaseWork(item, true, {
    feet: release.feet(),
    calendar: release.calendar(),
    ...(release.clear ? { clearRubble: release.clear } : {}),
  });
};

const repairTargetRefusal = (inventory: Inventory, item: Item, reach: ReachSnapshot): string | undefined => {
  const destination = item.work?.repairTarget;
  if (destination === undefined) {
    return undefined;
  }
  if (destination.kind === 'entity') {
    const recipe = item.work?.kind === 'craft' ? inventory.registry.recipes.get(item.work.recipe) : undefined;
    return entityRepairRefusal(
      inventory,
      { uid: destination.uid, entityType: recipe?.repair?.entity, amount: item.work?.repairAmount ?? 0 },
      item,
    );
  }
  const target = inventory.itemByUid(destination.uid);
  const { work } = item;
  const { registry } = inventory;
  if (work?.kind !== 'craft') {
    return coreMessage(registry, 'repairTargetGone');
  }
  const recipe = registry.recipes.get(work.recipe);
  if (!(recipe && target) || target.uid === item.uid || target.type !== recipe.result.item || target.count !== 1) {
    return coreMessage(registry, 'repairTargetGone');
  }
  return reach.entries.some((entry) => entry.item === target)
    ? undefined
    : coreMessage(registry, 'repairTargetOutOfReach');
};

/** The world's say over a piece leaving it: what stands in the way, and the removal itself. */
export interface PieceRemoval {
  removalRefusal: (entity: BlockEntity) => string | undefined;
  remove: (entity: BlockEntity) => string | undefined;
}

/**
 * Why a piece can't be taken apart now, at Start, at each resume and at completion alike. `work` is the job's own
 * work item once begun, which the piece's reservation admits.
 */
export const pieceTakeApartRefusal = (
  inventory: Inventory,
  entity: BlockEntity | undefined,
  pieces: PieceRemoval | undefined,
  work?: Item,
): string | undefined => {
  const messages = claimed(inventory.registry.ui, 'interface')!.furnitureMoveMessages;
  if (!entity || inventory.entities.byUid(entity.uid) !== entity || entity.carried) {
    return coreMessage(inventory.registry, 'gone');
  }
  if (!pieces) {
    return 'No piece remover';
  }
  if (inventory.hands.left || inventory.hands.right) {
    return messages.handsFull;
  }
  return (
    inventory.entities.useRefusal(entity, work) ??
    (inventory.canReachEntity(entity) ? undefined : messages.outOfReach) ??
    pieces.removalRefusal(entity)
  );
};

const hostOf = (inventory: Inventory, item: Item): BlockEntity | undefined => {
  const at = inventory.locate(item);
  return at?.kind === 'pieceWork' ? at.entity : undefined;
};

const disassemblyAdmission = (
  inventory: Inventory,
  plan: DisassemblyPlan,
  snapshot: ReachSnapshot,
  character: Character,
): string | undefined => {
  const current = planDisassembly(plan.source, snapshot, character, plan);
  const sameTools =
    current &&
    Object.keys(current.toolLevels).length === Object.keys(plan.toolLevels).length &&
    Object.entries(current.toolLevels).every(([quality, level]) => plan.toolLevels[quality] === level);
  return current &&
    current.source === plan.source &&
    current.skillLevel === plan.skillLevel &&
    current.duration === plan.duration &&
    current.gather === plan.gather &&
    sameTools &&
    sameDisassemblyOutputs(current.outputs, plan.outputs) &&
    JSON.stringify(current.liquids) === JSON.stringify(plan.liquids)
    ? inventory.liquidReceiptRefusal(inventory.planLiquidReceipts(plan.liquids, plan))
    : coreMessage(inventory.registry, 'yieldChanged');
};

/** A job on a piece leaves both hands free; a hand-held job takes the dominant hand with the other empty. */
const handsReady = (inventory: Inventory, item: Item, hosted: boolean): boolean =>
  hosted
    ? !(inventory.hands.left || inventory.hands.right)
    : inventory.hands[dominantSide(inventory.character)] === item && !inventory.hands[offSide(inventory.character)];

const recipePractice = (inventory: Inventory, work: NonNullable<Item['work']>) => {
  const recipe = work.kind === 'craft' ? inventory.registry.recipes.get(work.recipe) : undefined;
  if (!recipe) {
    return [];
  }
  return recipeSkillRequirements(inventory.registry, recipe).map(({ skill, level, provider }) => {
    const offset = provider.training?.craftingTierOffset;
    if (offset === undefined) {
      throw new Error('Missing crafting practice tier offset');
    }
    return { skill, amount: gameSecondsToMinutes(recipe.timeGameMinutes), tier: craftingActivityTier(level, offset) };
  });
};

export const craftActionHooks = (
  inventory: Inventory,
  character: Character,
  reach: () => ReachSnapshot,
  {
    feet,
    calendar,
    pieces,
    rubble,
  }: {
    feet: () => Vec3;
    calendar: () => number;
    pieces?: PieceRemoval;
    /** The world's clear for a finished rubble take-apart; it rechecks the episode and clears the cell. */
    rubble?: { clear: (cell: Vec3, epoch: number) => string | undefined };
  },
): CraftActionHooks => ({
  admit: (plan) => {
    const snapshot = reach();
    if (plan.kind === 'craft') {
      const recipe = inventory.registry.recipes.get(plan.recipe);
      return recipe ? admissionRefusal(recipe, snapshot, character) : 'Unknown recipe';
    }
    if (plan.kind === 'pieceDisassembly') {
      const current = planPieceDisassembly(plan.entity, snapshot, character);
      return (
        pieceTakeApartRefusal(inventory, plan.entity, pieces) ??
        (current && samePieceDisassembly(current, plan) ? undefined : coreMessage(inventory.registry, 'yieldChanged'))
      );
    }
    if (plan.kind === 'cellDisassembly') {
      return cellDisassemblyAdmission(inventory, plan);
    }
    return disassemblyAdmission(inventory, plan, snapshot, character);
  },
  begin: (plan, repair) => inventory.beginWork(plan, repair)?.uid,
  owns: (uid) => inventory.itemByUid(uid)?.work !== undefined,
  validate: (uid) => {
    const item = inventory.itemByUid(uid);
    const work = item?.work;
    if (!(item && work)) {
      return coreMessage(inventory.registry, 'gone');
    }
    if (!inputsValid(inventory, item)) {
      return coreMessage(inventory.registry, 'craftInputsChanged');
    }
    const host = hostOf(inventory, item);
    if (work.kind === 'pieceDisassembly') {
      return pieceTakeApartRefusal(inventory, host, pieces, item);
    }
    if (!handsReady(inventory, item, host !== undefined)) {
      return coreMessage(inventory.registry, 'workNeedsBothHands');
    }
    return (
      (work.kind === 'cellDisassembly'
        ? cellTakeApartRefusal(inventory, { cell: work.cell, epoch: work.epoch })
        : undefined) ??
      repairTargetRefusal(inventory, item, reach()) ??
      (work.kind === 'craft'
        ? admissionRefusal(inventory.registry.recipes.get(work.recipe)!, reach(), character)
        : undefined)
    );
  },
  advance: (uid, seconds) => {
    const work = inventory.itemByUid(uid)!.work!;
    work.elapsed = Math.min(work.duration, work.elapsed + seconds);
    inventory.version += 1;
    return work.elapsed === work.duration;
  },
  finish: (uid): string | undefined => {
    const item = inventory.itemByUid(uid);
    const work = item?.work;
    if (!(item && work)) {
      return undefined;
    }
    if (work.kind === 'pieceDisassembly') {
      // A blocker at the last moment keeps the finished job on its piece, paused, to finish once it clears.
      const blocked = pieceTakeApartRefusal(inventory, hostOf(inventory, item), pieces, item);
      if (blocked || !pieces) {
        throw new Error(blocked);
      }
      inventory.releaseWork(item, true, { feet: feet(), calendar: calendar(), retirePiece: pieces.remove });
      return undefined;
    }
    if (work.kind === 'cellDisassembly') {
      releaseCellClear(inventory, item, work, {
        feet,
        calendar,
        ...(rubble ? { clear: rubble.clear } : {}),
      });
      return undefined;
    }
    const refusal = repairTargetRefusal(inventory, item, reach());
    if (refusal) {
      inventory.releaseWork(item, false, { feet: feet() });
      return refusal;
    }
    const practice = recipePractice(inventory, work);
    inventory.releaseWork(item, true, { feet: feet(), calendar: calendar() });
    for (const entry of practice) {
      character.awardPractice(entry.skill, entry.amount, entry.tier);
    }
    return undefined;
  },
  cancel: (uid) => {
    const item = inventory.itemByUid(uid);
    if (item) {
      inventory.releaseWork(item, false, { feet: feet() });
    }
  },
});
