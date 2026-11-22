// Native craft effects and live admission. Item progress/inputs stay Inventory-owned.

import type { BlockEntity } from './blockEntities.ts';
import { claimed } from './capabilities.ts';
import { type Character, dominantSide, offSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import { admissionRefusal, equipmentRefusal, type WorkPlan } from './crafting.ts';
import {
  type DisassemblyPlan,
  planDisassembly,
  planPieceDisassembly,
  sameDisassemblyOutputs,
  samePieceDisassembly,
} from './disassembly.ts';
import { slotAccepts } from './housing.ts';
import { type Inventory, validateWorkItem } from './inventory.ts';
import { type Item, repairCeiling } from './items.ts';
import type { CraftActionHooks } from './longAction.ts';
import { type PartServicePlan, serviceSlot, serviceStatus } from './partService.ts';
import type { ReachSnapshot } from './reach.ts';
import { recipeSkillRequirements } from './recipeSkills.ts';
import { type CellDisassemblyPlan, rubbleClearWork } from './rubble.ts';
import { craftingActivityTier } from './skillTraining.ts';
import { gameSecondsToMinutes } from './time.ts';
import { validWorldDestination, type WorldDestination } from './worldDestination.ts';

export const placementRefusal = (
  inventory: Inventory,
  recipeId: string,
  destination?: WorldDestination,
  work?: Item,
): string | undefined => {
  const recipe = inventory.registry.recipes.get(recipeId);
  if (!(recipe && validWorldDestination(destination, recipe))) {
    return coreMessage(inventory.registry, 'placementTargetRequired');
  }
  if (!destination) {
    return undefined;
  }
  return inventory.worldPlacement
    ? inventory.worldPlacement.refusal(recipe, destination, work)
    : coreMessage(inventory.registry, 'placementTargetRequired');
};

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
  target: { uid: number; entityType: string | undefined; amount: number; ceiling: number },
  work?: Item,
): string | undefined => {
  const entity = inventory.entities.byUid(target.uid);
  if (
    !entity ||
    entity.type !== target.entityType ||
    !inventory.entities.canRepair(entity, target.amount, target.ceiling)
  ) {
    return coreMessage(inventory.registry, 'repairTargetGone');
  }
  return (
    inventory.entities.useRefusal(entity, work) ??
    (inventory.canReachEntity(entity) ? undefined : coreMessage(inventory.registry, 'repairTargetOutOfReach'))
  );
};

/**
 * Why a damaged terrain cell can't be repaired now, at Start, at each resume and at completion alike. A cell holds no
 * work item, so nothing reserves it: identity, damage and reach revalidate live instead, and the epoch pins the
 * damage episode so a replacement block's fresh damage is a different target.
 */
export const cellRepairRefusal = (
  inventory: Inventory,
  target: { cell: Vec3; epoch: number; block: string | undefined; amount: number; ceiling: number },
): string | undefined =>
  (inventory.cellRepair
    ? inventory.cellRepair.refusal(target.cell, target.epoch, target.block, {
        amount: target.amount,
        ceiling: target.ceiling,
      })
    : coreMessage(inventory.registry, 'repairTargetGone')) ??
  (inventory.canReachCell(target.cell) ? undefined : coreMessage(inventory.registry, 'repairTargetOutOfReach'));

/**
 * Why a rubble cell can't be cleared now, at Start, at each resume and at completion alike. A cell holds no
 * work item, so nothing reserves it: the pinned episode and reach revalidate live instead.
 */
export const cellTakeApartRefusal = (
  inventory: Inventory,
  target: { cell: Vec3; epoch?: number },
): string | undefined =>
  (inventory.buried() ? coreMessage(inventory.registry, 'handsBusy') : undefined) ??
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
  release: {
    feet: () => Vec3;
    calendar: () => number;
    clear?: (cell: Readonly<Vec3>, epoch: number) => string | undefined;
  },
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
      {
        uid: destination.uid,
        entityType: recipe?.repair?.entity,
        amount: item.work?.repairAmount ?? 0,
        ceiling: repairCeiling(inventory.registry, recipe),
      },
      item,
    );
  }
  if (destination.kind === 'cell') {
    const recipe = item.work?.kind === 'craft' ? inventory.registry.recipes.get(item.work.recipe) : undefined;
    return cellRepairRefusal(inventory, {
      cell: destination.cell,
      epoch: destination.epoch,
      block: recipe?.repair?.block,
      amount: item.work?.repairAmount ?? 0,
      ceiling: repairCeiling(inventory.registry, recipe),
    });
  }
  const target = inventory.itemByUid(destination.uid);
  const { work } = item;
  const { registry } = inventory;
  if (work?.kind !== 'craft') {
    return coreMessage(registry, 'repairTargetGone');
  }
  const recipe = registry.recipes.get(work.recipe);
  if (
    !(recipe && target && 'item' in recipe.result) ||
    target.uid === item.uid ||
    target.type !== recipe.result.item ||
    target.count !== 1
  ) {
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
  { work, boarding }: { work?: Item | undefined; boarding?: string | undefined } = {},
): string | undefined => {
  const refusal = pieceJobRefusal(inventory, entity, { work });
  if (refusal) {
    return refusal;
  }
  if (boarding) {
    return entity!.boarding?.type === boarding ? undefined : coreMessage(inventory.registry, 'yieldChanged');
  }
  return pieces ? pieces.removalRefusal(entity!) : 'No piece remover';
};

/**
 * Why a job on a piece can't run now: the piece stands, both hands are free for it but for the `taken` item Start
 * escrows from them, no other job holds it and it is in reach. `work` is the job's own work item once begun, which the
 * piece's reservation admits.
 */
const pieceJobRefusal = (
  inventory: Inventory,
  entity: BlockEntity | undefined,
  { work, taken }: { work?: Item | undefined; taken?: Item | undefined } = {},
): string | undefined => {
  const messages = claimed(inventory.registry.ui, 'interface')!.furnitureMoveMessages;
  if (!(entity && inventory.entities.stands(entity))) {
    return coreMessage(inventory.registry, 'gone');
  }
  if (!inventory.handsFreeBut(taken)) {
    return messages.handsFull;
  }
  return (
    inventory.entities.useRefusal(entity, work) ?? (inventory.canReachEntity(entity) ? undefined : messages.outOfReach)
  );
};

/**
 * Why a part service can't run now, at Start, at each resume and at completion alike: the piece as for any job on
 * it, then the slot still in the state the job needs, then the spare before Start, then the slot's tools and skills.
 * A fit's spare may be in hand at Start, which escrows it. Once begun, the spare is the job's own component, so only
 * the slot and the piece can change under it.
 */
export const partServiceRefusal = (
  inventory: Inventory,
  job: Pick<PartServicePlan, 'entity' | 'slot' | 'operation' | 'part' | 'spare'>,
  context: { snapshot: ReachSnapshot; character: Character; work?: Item },
): string | undefined => {
  const { registry } = inventory;
  const blocked = pieceJobRefusal(inventory, job.entity, { work: context.work, taken: job.spare });
  if (blocked) {
    return blocked;
  }
  const slot = serviceSlot(registry, job.entity.type, job.slot);
  const part = inventory.entities.housingView(job.entity).find((view) => view.slot === job.slot)?.part;
  if (!slot || (job.operation === 'remove' ? part?.type !== job.part : part !== undefined)) {
    return coreMessage(registry, 'gone');
  }
  if (!slot.accepts.includes(job.part)) {
    return coreMessage(registry, 'partDoesNotFit');
  }
  if (job.operation === 'fit' && !context.work) {
    const { spare } = job;
    const reachable = spare && context.snapshot.entries.some(({ item }) => item === spare);
    if (!(spare && reachable && spare.type === job.part && slotAccepts(slot, spare))) {
      return coreMessage(registry, 'noFittingPart');
    }
    const held = inventory.fittingSourceRefusal(spare);
    if (held) {
      return held;
    }
  }
  return equipmentRefusal(registry, serviceStatus(slot, context.snapshot, context.character));
};

type PartServiceWork = Extract<NonNullable<Item['work']>, { kind: 'partService' }>;

/** A begun part service, judged on the piece that hosts it. */
const partServiceWorkRefusal = (
  inventory: Inventory,
  item: Item,
  work: PartServiceWork,
  context: { snapshot: ReachSnapshot; character: Character },
): string | undefined => {
  const entity = hostOf(inventory, item);
  return entity
    ? partServiceRefusal(
        inventory,
        { entity, slot: work.slot, operation: work.operation, part: work.part },
        { ...context, work: item },
      )
    : coreMessage(inventory.registry, 'gone');
};

/** A finished part service: a blocker at the last moment keeps the job on its piece, paused, to finish once it clears. */
const finishPartService = (
  inventory: Inventory,
  item: Item,
  work: PartServiceWork,
  context: { snapshot: ReachSnapshot; character: Character; feet: () => Vec3; calendar: () => number },
): void => {
  const blocked = partServiceWorkRefusal(inventory, item, work, context);
  if (blocked) {
    throw new Error(blocked);
  }
  inventory.releaseWork(item, true, { feet: context.feet(), calendar: context.calendar() });
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

/** A finished piece take-apart: a blocker at the last moment keeps the job on its piece, paused, to finish once it clears. */
const finishPieceTakeApart = (
  inventory: Inventory,
  item: Item,
  pieces: PieceRemoval | undefined,
  release: { feet: () => Vec3; calendar: () => number },
): void => {
  const boarding = item.work?.kind === 'pieceDisassembly' ? item.work.boarding : undefined;
  const blocked = pieceTakeApartRefusal(inventory, hostOf(inventory, item), pieces, { work: item, boarding });
  if (blocked || !(boarding || pieces)) {
    throw new Error(blocked);
  }
  inventory.releaseWork(item, true, {
    feet: release.feet(),
    calendar: release.calendar(),
    ...(boarding
      ? {
          removeBoarding: (entity, type) =>
            inventory.entities.unboard(entity, type) ? undefined : coreMessage(inventory.registry, 'yieldChanged'),
        }
      : { retirePiece: pieces!.remove }),
  });
};

/** A finished craft, disassembly or repair: a gone repair target only drops the job; practice pays the maker. */
const finishCraftWork = (
  inventory: Inventory,
  item: Item,
  work: NonNullable<Item['work']>,
  context: { character: Character; snapshot: ReachSnapshot; feet: () => Vec3; calendar: () => number },
): string | undefined => {
  const placement =
    work.kind === 'craft' ? placementRefusal(inventory, work.recipe, work.destination, item) : undefined;
  if (placement) {
    throw new Error(placement);
  }
  const refusal = repairTargetRefusal(inventory, item, context.snapshot);
  if (refusal) {
    inventory.releaseWork(item, false, { feet: context.feet() });
    return refusal;
  }
  const practice = recipePractice(inventory, work);
  inventory.releaseWork(item, true, { feet: context.feet(), calendar: context.calendar() });
  for (const entry of practice) {
    context.character.awardPractice(entry.skill, entry.amount, entry.tier);
  }
  return undefined;
};

const craftAdmission = (
  inventory: Inventory,
  plan: Extract<WorkPlan, { kind: 'craft' }>,
  snapshot: ReachSnapshot,
  character: Character,
): string | undefined => {
  const recipe = inventory.registry.recipes.get(plan.recipe);
  return recipe
    ? (placementRefusal(inventory, plan.recipe, plan.destination) ?? admissionRefusal(recipe, snapshot, character))
    : 'Unknown recipe';
};

const worldWorkRefusal = (inventory: Inventory, item: Item): string | undefined => {
  const work = item.work!;
  if (work.kind === 'cellDisassembly') {
    return cellTakeApartRefusal(inventory, { cell: work.cell, epoch: work.epoch });
  }
  return work.kind === 'craft' ? placementRefusal(inventory, work.recipe, work.destination, item) : undefined;
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
    rubble?: { clear: (cell: Readonly<Vec3>, epoch: number) => string | undefined };
  },
): CraftActionHooks => ({
  admit: (plan) => {
    const snapshot = reach();
    if (plan.kind === 'craft') {
      return craftAdmission(inventory, plan, snapshot, character);
    }
    if (plan.kind === 'pieceDisassembly') {
      const current = planPieceDisassembly(plan.entity, snapshot, character);
      return (
        pieceTakeApartRefusal(inventory, plan.entity, pieces, { boarding: plan.boarding }) ??
        (current && samePieceDisassembly(current, plan) ? undefined : coreMessage(inventory.registry, 'yieldChanged'))
      );
    }
    if (plan.kind === 'cellDisassembly') {
      return cellDisassemblyAdmission(inventory, plan);
    }
    if (plan.kind === 'partService') {
      return partServiceRefusal(inventory, plan, { snapshot, character });
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
      return pieceTakeApartRefusal(inventory, host, pieces, { work: item, boarding: work.boarding });
    }
    if (work.kind === 'partService') {
      return partServiceWorkRefusal(inventory, item, work, { snapshot: reach(), character });
    }
    if (!handsReady(inventory, item, host !== undefined)) {
      return coreMessage(inventory.registry, 'workNeedsBothHands');
    }
    return (
      worldWorkRefusal(inventory, item) ??
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
      finishPieceTakeApart(inventory, item, pieces, { feet, calendar });
      return undefined;
    }
    if (work.kind === 'partService') {
      finishPartService(inventory, item, work, { snapshot: reach(), character, feet, calendar });
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
    return finishCraftWork(inventory, item, work, {
      character,
      snapshot: reach(),
      feet,
      calendar,
    });
  },
  cancel: (uid) => {
    const item = inventory.itemByUid(uid);
    if (item) {
      inventory.releaseWork(item, false, { feet: feet() });
    }
  },
});
