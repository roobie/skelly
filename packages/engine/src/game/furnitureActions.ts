import { type BlockEntity, boardableDoor, boardingFits } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { coreLabel } from '../core/coreText.ts';
import { jobName } from '../core/craftCommands.ts';
import { pieceRecoveryWork } from '../core/disassembly.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import { repairCeiling } from '../core/items.ts';
import type { ItemAction } from './itemActions.ts';

const repairAction = (
  inventory: Inventory,
  entity: BlockEntity,
  knownRecipes: ReadonlySet<string>,
): ItemAction | undefined => {
  const condition = inventory.entities.conditionOf(entity);
  const repairable = [...knownRecipes].some((id) => {
    const recipe = inventory.registry.recipes.get(id);
    return recipe?.repair?.entity === entity.type && condition < repairCeiling(inventory.registry, recipe);
  });
  return repairable
    ? { id: 'repair', label: claimed(inventory.registry.ui, 'interface')!.screenText.worldService.repair }
    : undefined;
};

const boardingActions = (
  inventory: Inventory,
  entity: BlockEntity,
  knownRecipes: ReadonlySet<string>,
): ItemAction[] => {
  const definition = inventory.registry.furniture.get(entity.type)!;
  if (!boardableDoor(definition)) {
    return [];
  }
  return [...knownRecipes].sort().flatMap((id) => {
    const result = inventory.registry.recipes.get(id)?.result;
    const boarding = result && 'boarding' in result ? inventory.registry.boardings.get(result.boarding) : undefined;
    return boarding && boardingFits(definition, boarding)
      ? [
          {
            id: 'board_up',
            label: claimed(inventory.registry.ui, 'interface')!.screenText.worldService.boardUp,
            placementRecipe: id,
          },
        ]
      : [];
  });
};

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
  const repair = repairAction(inventory, entity, knownRecipes);
  if (repair) {
    actions.push(repair);
  }
  const takeApart = registry.furniture.get(entity.type)?.takeApart;
  if (pieceRecoveryWork(registry, entity.type, entity.boarding?.type) || takeApart?.parts) {
    actions.push({ id: 'take_apart', label: text.worldService.takeApart });
  }
  // Ring entries come from recipe data, not recipe ids in code: every known recipe whose result boards this leaf
  // names its own entry, so a pack's boarding recipe reaches the ring without an engine edit. A second boarding
  // recipe needs its own ring slot decision before content ships one.
  actions.push(...boardingActions(inventory, entity, knownRecipes));
  return actions;
};
