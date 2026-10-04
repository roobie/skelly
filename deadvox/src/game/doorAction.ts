import type { BlockEntity, DoorOperation } from '../core/blockEntities.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue, JobParams } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { doorPlan, heldKeyLocks } from '../core/options.ts';
import type { Body } from '../core/physics.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

export const DOOR_ACTION = 'furniture.door';
const DOOR_CLOSE_MESSAGES = { player: "You're in the way", other: "Something's in the way" } as const;

const doorCenter = (entity: BlockEntity): Vec3 => [
  entity.pos[0] + entity.size[0] / 2,
  entity.pos[1] + entity.size[1] / 2,
  entity.pos[2] + entity.size[2] / 2,
];
const doorOperation = (params: JobParams): DoorOperation => {
  if (typeof params.locked === 'boolean') {
    return params.locked ? 'lock' : 'unlock';
  }
  return params.closing === true ? 'close' : 'open';
};

export interface DoorActionOptions {
  queue: HandlingQueue;
  inventory: Inventory;
  player: () => Body;
  others: () => Iterable<Body>;
  playWorldSound: (event: SoundEventId, position: Vec3) => void;
}

export const registerDoorAction = ({ queue, inventory, player, others, playWorldSound }: DoorActionOptions): void => {
  const { entities } = inventory;
  const openClose = (entity: BlockEntity, opening: boolean): string | undefined => {
    const center = doorCenter(entity);
    if (opening) {
      const reason = entities.setOpen(entity, true);
      if (reason) {
        return reason;
      }
      playWorldSound('door_open', center);
      return undefined;
    }
    const blocker = entities.closeDoor(entity, player(), others());
    playWorldSound(blocker ? 'door_blocked_close' : 'door_close', center);
    return blocker ? DOOR_CLOSE_MESSAGES[blocker] : undefined;
  };
  queue.registerAction(DOOR_ACTION, (params) => {
    const uid = params.entityUid;
    if (typeof uid !== 'number' || !Number.isSafeInteger(uid)) {
      throw new Error('Invalid door target');
    }
    const entity = entities.byUid(uid);
    if (!entity) {
      return 'The door is no longer there';
    }
    const operation = doorOperation(params);
    const plan = doorPlan(inventory, entity, operation);
    if (!plan.ok) {
      return plan.reason;
    }
    if (operation === 'lock' || operation === 'unlock') {
      return entities.setLocked(entity, operation === 'lock', heldKeyLocks(inventory));
    }
    return openClose(entity, operation === 'open');
  });
};
