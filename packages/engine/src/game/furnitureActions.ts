import { type BlockEntity, boardable } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { coreLabel } from '../core/coreText.ts';
import { jobName } from '../core/craftCommands.ts';
import { pieceRecoveryWork } from '../core/disassembly.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import { repairCeiling } from '../core/items.ts';
import type { ItemAction } from './itemActions.ts';

/**
 * Continue leads while the piece hosts a job, since that job is its pending work. Repair and Work on open the pinned world-work review, which shows any refusal, so they are offered on every piece
 * a known recipe or authored take-apart route covers, except that Repair is not offered once the piece stands at its recipe's
 * repair ceiling (`packages/deadvox/DESIGN.md`, "World repair selection"; `packages/deadvox/DESIGN.md`, "Repair ceiling").
 */
export const furnitureActionsFor = (
  inventory: Inventory,
  entity: BlockEntity,
  knownRecipes: ReadonlySet<string> = new Set(),
): ItemAction[] => {
  const { registry } = inventory;
  const text = claimed(registry.ui, 'interface')!.screenText;
  const actions: ItemAction[] = [];
  if (entity.work) {
    actions.push({
      id: 'continue',
      label: coreLabel(registry, 'continueWork', { item: jobName(registry, entity.work.work!).toLowerCase() }),
      workUid: entity.work.uid,
    });
  }
  if (slidableFurniture(inventory, entity)) {
    actions.push({ id: 'push', label: text.worldService.push }, { id: 'drag', label: text.worldService.drag });
  } else if (movableRefusal(inventory, entity) === undefined) {
    actions.push({ id: 'lift', label: text.worldService.lift });
  }
  const condition = inventory.entities.conditionOf(entity);
  if (
    [...knownRecipes].some((id) => {
      const recipe = registry.recipes.get(id);
      return recipe?.repair?.entity === entity.type && condition < repairCeiling(registry, recipe);
    })
  ) {
    actions.push({ id: 'repair', label: text.worldService.repair });
  }
  const takeApart = registry.furniture.get(entity.type)?.takeApart;
  if (pieceRecoveryWork(registry, entity.type, entity.boarding?.type) || takeApart?.parts) {
    actions.push({ id: 'take_apart', label: text.worldService.takeApart });
  }
  // Ring entries come from recipe data, not recipe ids in code: every known recipe whose result boards a leaf or
  // opening names its own entry, so a pack's boarding recipe reaches the ring without an engine edit. A second
  // boarding recipe needs its own ring slot decision before content ships one.
  if (boardable(registry.furniture.get(entity.type)!)) {
    for (const id of [...knownRecipes].sort()) {
      const boarding = registry.recipes.get(id)?.result;
      if (boarding && 'doorBoarding' in boarding && registry.boardings.has(boarding.doorBoarding)) {
        actions.push({ id: 'board_up', label: text.worldService.boardUp, placementRecipe: id });
      }
    }
  }
  return actions;
};
