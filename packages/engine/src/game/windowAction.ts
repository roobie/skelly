import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import { coreMessage } from '../core/coreText.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Body } from '../core/physics.ts';
import type { WindowOperation } from '../core/windowParts.ts';

export type { WindowOperation } from '../core/windowParts.ts';

export const WINDOW_ACTION = 'furniture.window';
const OPERATIONS: readonly WindowOperation[] = ['open', 'close', 'latch', 'unlatch', 'openCurtain', 'closeCurtain'];

/**
 * What use (or, with `hold`, the held use) does to a window. On a curtained window, use opens a closed curtain and
 * then works the sash, while hold closes an open curtain and otherwise latches, so every operation stays reachable.
 */
export const windowOperation = (entities: BlockEntities, entity: BlockEntity, hold: boolean): WindowOperation => {
  const state = entity.window!;
  if (entities.boardingOf(entity)?.curtain) {
    const closed = entities.curtainClosed(entity);
    if (closed && !hold) {
      return 'openCurtain';
    }
    if (!closed && hold) {
      return 'closeCurtain';
    }
  }
  if (hold || state.latched) {
    return state.latched ? 'unlatch' : 'latch';
  }
  return state.open ? 'close' : 'open';
};

/** How long an operation takes: a curtain's own handling, or the window's. */
export const windowHandlingSimSeconds = (
  entities: BlockEntities,
  entity: BlockEntity,
  operation: WindowOperation,
): number => {
  const curtain = entities.boardingOf(entity)?.curtain;
  return curtain && (operation === 'openCurtain' || operation === 'closeCurtain')
    ? curtain.handlingSimSeconds
    : entities.defOf(entity).window!.handlingSimSeconds;
};

export const registerWindowAction = (
  queue: HandlingQueue,
  inventory: Inventory,
  bodies: () => Iterable<Body>,
): void => {
  queue.registerAction(WINDOW_ACTION, (params) => {
    const { operation } = params;
    if (!OPERATIONS.includes(operation as WindowOperation)) {
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
    return inventory.entities.operateWindow(entity, operation as WindowOperation, from, bodies());
  });
};
