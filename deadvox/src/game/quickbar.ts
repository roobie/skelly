import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';

const QUICKBAR_SLOTS = 5;

/** Non-owning UID bindings; Inventory is the sole authority for live items. */
export class Quickbar {
  private readonly bindings: (number | null)[] = new Array(QUICKBAR_SLOTS).fill(null);

  get slots(): readonly (number | null)[] {
    return this.bindings;
  }

  resolve(slot: number, inventory: Inventory): Item | undefined {
    const uid = this.bindings[slot];
    if (uid === null || uid === undefined) {
      return undefined;
    }
    const item = inventory.itemByUid(uid);
    if (!item) {
      this.bindings[slot] = null;
    }
    return item;
  }

  snapshotState(inventory: Inventory): readonly (number | null)[] {
    return Object.freeze(this.bindings.map((_, slot) => this.resolve(slot, inventory)?.uid ?? null));
  }

  restoreState(state: readonly (number | null)[], inventory: Inventory): void {
    if (state.length !== QUICKBAR_SLOTS) {
      throw new Error('Invalid quickbar slot count');
    }
    for (const [index, uid] of state.entries()) {
      if (uid !== null && !inventory.itemByUid(uid)) {
        throw new Error(`Missing quickbar item ${uid}`);
      }
      this.bindings[index] = uid;
    }
  }

  assign(slot: number, item: Item): void {
    // An item sits in one slot at most; binding it never owns its lifetime.
    for (let i = 0; i < this.bindings.length; i++) {
      if (this.bindings[i] === item.uid) {
        this.bindings[i] = null;
      }
    }
    this.bindings[slot] = item.uid;
  }
}
