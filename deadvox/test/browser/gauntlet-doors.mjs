// biome-ignore-all lint/correctness/noUnresolvedImports: this helper runs inside the Vite-served browser page.
import { doorPlan } from '/src/core/options.ts';
import { DOOR_ACTION } from '/src/game/doorAction.ts';

export const routeDoorOpener = (engine, session) => {
  const queued = new Set();
  return () => {
    const eligible = [...engine.entities.all].filter((entity) => {
      const { door } = engine.entities.defOf(entity);
      return door && !door.hatch && !entity.open && session.inventory.canReachEntity(entity);
    });
    for (const entity of eligible) {
      const operation = entity.lock?.locked ? 'unlock' : 'open';
      const key = `${entity.uid}:${operation}`;
      const plan = doorPlan(session.inventory, entity, operation);
      if (plan.ok && !queued.has(key)) {
        queued.add(key);
        session.queue.enqueueAction(DOOR_ACTION, 'Open route door', plan.time, {
          entityUid: entity.uid,
          ...(operation === 'unlock' ? { locked: false } : {}),
        });
      }
    }
  };
};
