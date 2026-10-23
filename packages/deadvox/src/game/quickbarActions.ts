import { actionText } from '../core/actionText.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { quickbarPutAway, quickbarTake } from '../core/options.ts';
import type { Survival } from './survival.ts';

interface Dependencies {
  inventory: Inventory;
  queue: HandlingQueue;
  feet: () => Vec3;
  survival: Survival;
  notice: (text: string) => void;
}

export class QuickbarActions {
  private readonly dependencies: Dependencies;

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
  }

  tap(item: Item): void {
    const { inventory, queue, notice } = this.dependencies;
    const at = inventory.locate(item);
    if (!at) {
      return;
    }
    const reason = at.kind === 'hand' ? quickbarPutAway(inventory, queue, item) : quickbarTake(inventory, queue, item);
    if (reason) {
      notice(reason);
    }
  }

  hold(item: Item): void {
    const { inventory, queue, survival, notice } = this.dependencies;
    if (queue.busy) {
      notice(actionText(inventory.registry).common.busy);
      return;
    }
    const reason = survival.useFromQuickbar(item);
    if (reason) {
      notice(reason);
    }
  }
}
