import { type ItemAction, ItemActionSelection } from './itemActions.ts';

export class FurnitureActionSelection extends ItemActionSelection {
  private uid: number | undefined;

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
