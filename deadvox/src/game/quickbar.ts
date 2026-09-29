import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';

export const QUICKBAR_SLOTS = 5;

/** Item bindings live with game logic; the UI only renders this state. */
export class Quickbar {
  readonly slots: (Item | undefined)[] = new Array(QUICKBAR_SLOTS).fill(undefined);

  snapshotState(): readonly (number | null)[] {
    return Object.freeze(this.slots.map((item) => item?.uid ?? null));
  }

  restoreState(state: readonly (number | null)[], inventory: Inventory): void {
    if (state.length !== QUICKBAR_SLOTS) {
      throw new Error('Invalid quickbar slot count');
    }
    for (const [index, uid] of state.entries()) {
      const item = uid === null ? undefined : inventory.itemByUid(uid);
      if (uid !== null && !item) {
        throw new Error(`Missing quickbar item ${uid}`);
      }
      this.slots[index] = item;
    }
  }

  assign(slot: number, item: Item): void {
    // An item sits in one slot at most.
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === item) {
        this.slots[i] = undefined;
      }
    }
    this.slots[slot] = item;
  }
}
