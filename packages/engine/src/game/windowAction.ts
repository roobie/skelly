import { coreMessage } from '../core/coreText.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Body } from '../core/physics.ts';

export const WINDOW_ACTION = 'furniture.window';
export type WindowOperation = 'open' | 'close' | 'latch' | 'unlatch';

export const registerWindowAction = (
  queue: HandlingQueue,
  inventory: Inventory,
  bodies: () => Iterable<Body>,
): void => {
  queue.registerAction(WINDOW_ACTION, (params) => {
    const { operation } = params;
    if (operation !== 'open' && operation !== 'close' && operation !== 'latch' && operation !== 'unlatch') {
      throw new Error('Invalid window operation');
    }
    const entity = typeof params.entityUid === 'number' && inventory.entities.byUid(params.entityUid);
    if (!entity) {
      return coreMessage(inventory.registry, 'gone');
    }
    const from = inventory.actorPosition();
    if (!(from && inventory.canReachEntity(entity))) {
      return coreMessage(inventory.registry, 'tooFar');
    }
    return inventory.entities.operateWindow(entity, operation, from, bodies());
  });
};
