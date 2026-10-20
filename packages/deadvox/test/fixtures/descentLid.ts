import type { BlockEntity } from '../../src/core/blockEntities.ts';
import { doorPlan } from '../../src/core/options.ts';
import { DOOR_ACTION } from '../../src/game/doorAction.ts';
import type { Session } from '../../src/game/session.ts';

export const descentLid = (session: Session, ladder: BlockEntity, upper: number): BlockEntity => {
  const lid = [...session.entities.all].find(
    (entity) =>
      session.entities.defOf(entity).door?.hatch &&
      entity.pos[1] === upper - 1 &&
      ladder.pos[0] >= entity.pos[0] &&
      ladder.pos[0] < entity.pos[0] + entity.size[0] &&
      ladder.pos[2] >= entity.pos[2] &&
      ladder.pos[2] < entity.pos[2] + entity.size[2],
  );
  if (!lid) {
    throw new Error('Descent lid absent');
  }
  return lid;
};

export const queueDescentLidOpening = (session: Session, lid: BlockEntity): number => {
  if (lid.open) {
    return 0;
  }
  const opening = doorPlan(session.inventory, lid, 'open');
  if (!opening.ok) {
    throw new Error(opening.reason);
  }
  session.queue.enqueueAction(DOOR_ACTION, 'open descent hatch', opening.time, { entityUid: lid.uid });
  return opening.time;
};
