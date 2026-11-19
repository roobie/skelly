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

/** What came of opening or closing something: the sound that is heard, and why it did not happen, if it did not. */
export interface SwingOutcome {
  readonly sound?: SoundEventId | undefined;
  readonly refusal?: string | undefined;
}

/**
 * Anything that swings open or shut is heard where it stands, for what came of the try, and says why it failed.
 * Doors and vehicle parts both end here, so they are heard and refused alike.
 */
export const heardSwing = (
  playWorldSound: DoorActionOptions['playWorldSound'],
  at: Vec3,
  { sound, refusal }: SwingOutcome,
): string | undefined => {
  if (sound !== undefined) {
    playWorldSound(sound, at);
  }
  return refusal;
};

export const registerDoorAction = ({
  queue,
  inventory,
  player,
  others,
  playWorldSound,
  closeBlockedMessages,
}: DoorActionOptions): void => {
  const { entities } = inventory;
  const swing = (entity: BlockEntity, opening: boolean): SwingOutcome => {
    const door = entities.defOf(entity).door!;
    if (opening) {
      const refusal = entities.setOpen(entity, true);
      return refusal ? { refusal } : { sound: door.openSound };
    }
    const blocker = entities.closeDoor(entity, player(), others());
    return blocker
      ? { sound: door.blockedCloseSound, refusal: closeBlockedMessages[blocker] }
      : { sound: door.closeSound };
  };
  const openClose = (entity: BlockEntity, opening: boolean): string | undefined =>
    heardSwing(playWorldSound, doorCenter(entity), swing(entity, opening));
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
