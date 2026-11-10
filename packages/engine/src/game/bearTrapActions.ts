import { actionText } from '../core/actionText.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue, Job } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { ReachSnapshot } from '../core/reach.ts';

const SET_ACTION = 'trap.set';
const DISARM_ACTION = 'trap.disarm';

export interface TrapActionHooks {
  queue: HandlingQueue;
  inventory: Inventory;
  reach: () => ReachSnapshot;
  /** The landed cell ahead of the player where a trap is set; undefined with no ground there. */
  setCell: () => Vec3 | undefined;
}

const itemParam = (inventory: Inventory, uid: unknown): Item | undefined => {
  if (typeof uid !== 'number' || !Number.isSafeInteger(uid)) {
    throw new Error('Invalid trap action target');
  }
  return inventory.itemByUid(uid);
};

const disarmJobs = (queue: HandlingQueue): Job[] =>
  queue.jobs.filter((job) => job.kind === 'action' && job.jobType === DISARM_ACTION);

/** Queues setting a held trap, or disarming a set one in reach; returns why it can't be done now. */
export const queueTrapAction = (queue: HandlingQueue, item: Item, label: string, simSeconds: number): void => {
  const disarm = item.trap?.state === 'armed';
  if (disarm && disarmJobs(queue).some((job) => job.kind === 'action' && job.params.itemUid === item.uid)) {
    return;
  }
  queue.enqueueAction(disarm ? DISARM_ACTION : SET_ACTION, label, simSeconds, { itemUid: item.uid });
};

/**
 * Disarming is one uninterrupted commitment (`SLICE-5.md`, "Settled bear-trap rules — issue #107"): an
 * interruption withdraws the attempt, so the next one starts its full duration.
 */
export const interruptDisarm = (queue: HandlingQueue): void => {
  for (const job of disarmJobs(queue)) {
    queue.cancelJob(job);
  }
};

/** On completion each action is checked again against the live trap; a valid disarm never springs it. */
export const registerTrapActions = ({ queue, inventory, reach, setCell }: TrapActionHooks): void => {
  const text = actionText(inventory.registry);
  queue.registerAction(SET_ACTION, ({ itemUid }): string | undefined => {
    const item = itemParam(inventory, itemUid);
    if (!(item && defOf(inventory.registry, item.type).trap && inventory.locate(item)?.kind === 'hand')) {
      return text.trap.notInHands;
    }
    const pos = setCell();
    if (!pos) {
      return text.trap.noGround;
    }
    const moved = inventory.move(item, { kind: 'pile', pos });
    if (!moved.ok) {
      return moved.reason;
    }
    item.trap = { state: 'armed' };
    return undefined;
  });
  queue.registerAction(DISARM_ACTION, ({ itemUid }): string | undefined => {
    const item = itemParam(inventory, itemUid);
    if (item?.trap?.state !== 'armed') {
      return text.trap.notSet;
    }
    if (!reach().entries.some((entry) => entry.item === item)) {
      return text.common.tooFar;
    }
    item.trap = undefined;
    return undefined;
  });
};
