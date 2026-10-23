import { actionText } from '../core/actionText.ts';
import type { BlockEntity, DoorOperation } from '../core/blockEntities.ts';
import { dominantSide } from '../core/character.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue, JobParams } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { doorPlan, heldDoorBar, heldKeyLocks } from '../core/options.ts';
import type { Body } from '../core/physics.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

export const DOOR_ACTION = 'furniture.door';

const doorCenter = (entity: BlockEntity): Vec3 => [
  entity.pos[0] + entity.size[0] / 2,
  entity.pos[1] + entity.size[1] / 2,
  entity.pos[2] + entity.size[2] / 2,
];
const doorOperation = (params: JobParams): DoorOperation => {
  if (typeof params.locked === 'boolean') {
    return params.locked ? 'lock' : 'unlock';
  }
  if (typeof params.barring === 'boolean') {
    return params.barring ? 'bar' : 'unbar';
  }
  return params.closing === true ? 'close' : 'open';
};

export interface DoorActionOptions {
  queue: HandlingQueue;
  inventory: Inventory;
  player: () => Body;
  others: () => Iterable<Body>;
  playWorldSound: (event: SoundEventId, position: Vec3) => void;
  /** What the refusal says, by who blocks the door; from the core ui content. */
  closeBlockedMessages: Readonly<Record<'player' | 'other', string>>;
}

export const registerDoorAction = ({
  queue,
  inventory,
  player,
  others,
  playWorldSound,
  closeBlockedMessages,
}: DoorActionOptions): void => {
  const { entities } = inventory;
  const openClose = (entity: BlockEntity, opening: boolean): string | undefined => {
    const center = doorCenter(entity);
    if (opening) {
      const reason = entities.setOpen(entity, true);
      if (reason) {
        return reason;
      }
      const openNoise = entities.defOf(entity).door?.openNoise;
      playWorldSound(openNoise?.sound ?? 'door_open', center);
      return undefined;
    }
    const blocker = entities.closeDoor(entity, player(), others());
    playWorldSound(blocker ? 'door_blocked_close' : 'door_close', center);
    return blocker ? closeBlockedMessages[blocker] : undefined;
  };
  queue.registerAction(DOOR_ACTION, (params) => {
    const uid = params.entityUid;
    if (typeof uid !== 'number' || !Number.isSafeInteger(uid)) {
      throw new Error('Invalid door target');
    }
    const entity = entities.byUid(uid);
    if (!entity) {
      return actionText(inventory.registry).common.gone;
    }
    const reserved = entities.useRefusal(entity);
    if (reserved) {
      return reserved;
    }
    const operation = doorOperation(params);
    const plan = doorPlan(inventory, entity, operation);
    if (!plan.ok) {
      return plan.reason;
    }
    switch (operation) {
      case 'lock':
      case 'unlock':
        return entities.setLocked(entity, operation === 'lock', heldKeyLocks(inventory));
      case 'bar':
        return setBar(inventory, entity);
      case 'unbar':
        return liftBar(inventory, entity);
      default:
        return openClose(entity, operation === 'open');
    }
  });
};

/** The held bar leaves the hands for the door; the door keeps only its item type (`BlockEntities`, `setBar`). */
const setBar = (inventory: Inventory, entity: BlockEntity): string | undefined => {
  const bar = heldDoorBar(inventory)!;
  const reason = inventory.entities.setBar(entity, inventory.actorPosition()!, bar.type);
  if (!reason) {
    inventory.consume(bar);
  }
  return reason;
};

const liftBar = (inventory: Inventory, entity: BlockEntity): string | undefined => {
  const lifted = inventory.entities.liftBar(entity, inventory.actorPosition()!);
  if ('reason' in lifted) {
    return lifted.reason;
  }
  inventory.add(inventory.create(lifted.item), { kind: 'hand', side: dominantSide(inventory.character) });
  return undefined;
};
