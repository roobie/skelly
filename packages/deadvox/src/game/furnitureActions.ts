import type { Inventory } from '@skelly/engine/inventory';
import { claimed } from '@skelly/engine/inventory';
import type { BlockEntity } from '@skelly/engine/world';
import { movableRefusal, slidableFurniture } from '@skelly/engine/world';
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
