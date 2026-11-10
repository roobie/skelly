import { actionText } from '@skelly/engine/input';
import type { HandlingQueue, Inventory, Item } from '@skelly/engine/inventory';
import { quickbarPutAway, quickbarTake } from '@skelly/engine/inventory';
import type { Vec3 } from '@skelly/engine/world';
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
