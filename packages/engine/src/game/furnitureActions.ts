import type { BlockEntity } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ItemAction } from './itemActions.ts';

/**
 * Repair and Take apart open the pinned world-work review, which shows any refusal, so they are offered on every piece
 * a known recipe or authored yield covers (`packages/deadvox/DESIGN.md`, "World repair selection").
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
  if ([...knownRecipes].some((id) => registry.recipes.get(id)?.repair?.entity === entity.type)) {
    actions.push({ id: 'repair', label: text.worldService.repair });
  }
  if (registry.furniture.get(entity.type)?.takeApart?.yield) {
    actions.push({ id: 'take_apart', label: text.worldService.takeApart });
  }
  return actions;
};
