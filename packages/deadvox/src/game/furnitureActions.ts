import type { BlockEntity } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import { type ItemAction, ItemActionSelection } from './itemActions.ts';

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

export class FurnitureActionSelection extends ItemActionSelection {
  private uid: number | undefined;

  constructor(openCanLabel: string) {
    super(openCanLabel);
  }

  open(entity: { uid: number }, actions: readonly ItemAction[]): void {
    this.uid = entity.uid;
    this.forItem(entity, actions);
  }

  isOpen(entity: { uid: number }): boolean {
    return this.uid === entity.uid;
  }

  sync(targetUid: number | undefined, paused = false): void {
    if (paused || targetUid !== this.uid) {
      this.uid = undefined;
    }
  }

  confirm(entity: { uid: number }, actions: readonly ItemAction[]): ItemAction | undefined {
    const action = this.isOpen(entity) ? this.forItem(entity, actions) : undefined;
    this.uid = undefined;
    return action;
  }
}
