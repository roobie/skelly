import type { BlockEntity } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ItemAction } from './itemActions.ts';

export const furnitureActionsFor = (inventory: Inventory, entity: BlockEntity, blockSize: number): ItemAction[] => {
  const text = claimed(inventory.registry.ui, 'interface')!.screenText;
  const actions: ItemAction[] = [];
  if (slidableFurniture(inventory, entity, blockSize)) {
    actions.push({ id: 'push', label: text.worldService.push }, { id: 'drag', label: text.worldService.drag });
  } else if (movableRefusal(inventory, entity, blockSize) === undefined) {
    actions.push({ id: 'lift', label: text.worldService.lift });
  }
  return actions;
};
