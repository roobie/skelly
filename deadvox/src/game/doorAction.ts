import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Body } from '../core/physics.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

export const DOOR_ACTION = 'furniture.door';
const DOOR_CLOSE_MESSAGES = { player: "You're in the way", other: "Something's in the way" } as const;

const doorCenter = (entity: BlockEntity): Vec3 => [
  entity.pos[0] + entity.size[0] / 2,
  entity.pos[1] + entity.size[1] / 2,
  entity.pos[2] + entity.size[2] / 2,
];

export const registerDoorAction = (
  queue: HandlingQueue,
  entities: BlockEntities,
  player: () => Body,
  others: () => Iterable<Body>,
  playWorldSound: (event: SoundEventId, position: Vec3) => void,
): void => {
  queue.registerAction(DOOR_ACTION, (params) => {
    const uid = params.entityUid;
    if (typeof uid !== 'number' || !Number.isSafeInteger(uid)) {
      throw new Error('Invalid door target');
    }
    const entity = entities.byUid(uid);
    if (!entity) {
      return 'The door is no longer there';
    }
    const center = doorCenter(entity);
    if (params.closing !== true) {
      entities.setOpen(entity, true);
      playWorldSound('door_open', center);
      return;
    }
    const blocker = entities.closeDoor(entity, player(), others());
    if (blocker) {
      playWorldSound('door_blocked_close', center);
      return DOOR_CLOSE_MESSAGES[blocker];
    }
    playWorldSound('door_close', center);
    return undefined;
  });
};
