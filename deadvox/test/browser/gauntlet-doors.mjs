// biome-ignore-all lint/correctness/noUnresolvedImports: this helper runs inside the Vite-served browser page.
import { doorPlan } from '/src/core/options.ts';
import { DOOR_ACTION } from '/src/game/doorAction.ts';

export const routeDoorOpener = (engine, session) => {
  const queued = new Set();
  return () => {
    for (const entity of engine.entities.all) {
      const { door } = engine.entities.defOf(entity);
      if (
        !door ||
        door.hatch ||
        entity.open ||
        entity.lock?.locked ||
        queued.has(entity.uid) ||
        !session.inventory.canReachEntity(entity)
      ) {
        continue;
      }
      const opening = doorPlan(session.inventory, entity, 'open');
      if (opening.ok) {
        queued.add(entity.uid);
        session.queue.enqueueAction(DOOR_ACTION, 'Open route door', opening.time, { entityUid: entity.uid });
      }
    }
  };
};
