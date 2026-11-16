import type { BlockEntity } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import { repairCeiling } from '../core/items.ts';
import type { ItemAction } from './itemActions.ts';

/**
 * Repair and Take apart open the pinned world-work review, which shows any refusal, so they are offered on every piece
 * a known recipe or authored yield covers, except that Repair is not offered once the piece stands at its recipe's
 * repair ceiling (`packages/deadvox/DESIGN.md`, "World repair selection"; `packages/deadvox/DESIGN.md`, "Repair ceiling").
 */
export const furnitureActionsFor = (
  inventory: Inventory,
  entity: BlockEntity,
  blockSize: number,
  knownRecipes: ReadonlySet<string> = new Set(),
): ItemAction[] => {
  const { registry } = inventory;
  const text = claimed(registry.ui, 'interface')!.screenText;
  const actions: ItemAction[] = [];
  if (slidableFurniture(inventory, entity, blockSize)) {
    actions.push({ id: 'push', label: text.worldService.push }, { id: 'drag', label: text.worldService.drag });
  } else if (movableRefusal(inventory, entity, blockSize) === undefined) {
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
  if (registry.furniture.get(entity.type)?.takeApart?.yield) {
    actions.push({ id: 'take_apart', label: text.worldService.takeApart });
  }
  return actions;
};
