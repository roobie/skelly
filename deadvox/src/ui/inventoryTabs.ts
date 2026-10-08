const INVENTORY_TABS = ['items', 'skills', 'crafting'] as const;
export type InventoryTab = (typeof INVENTORY_TABS)[number];

/** Last-used tab belongs to this runtime screen, not to saved or replayed game state. */
export class InventoryTabState {
  private lastUsed: InventoryTab = 'items';
  private openState = false;

  get isOpen(): boolean {
    return this.openState;
  }

  get active(): InventoryTab {
    return this.lastUsed;
  }

  open(): void {
    this.openState = true;
  }

  close(): void {
    this.openState = false;
  }

  select(tab: InventoryTab): void {
    if (!INVENTORY_TABS.includes(tab)) {
      throw new Error(`Unknown inventory tab: ${tab}`);
    }
    this.lastUsed = tab;
  }
}
