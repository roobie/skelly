import type { EntityId } from '../core/entities.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { bodyDistance, INVENTORY_REACH, type ReachPlayer } from '../core/reach.ts';
import type { Zombie, ZombieSystem } from '../core/zombies.ts';

const DOWNED_BODY_ACTION = 'zombie.downed';
const DOWNED_BODY_WAYS = ['finish-off', 'dismember'] as const;
export type DownedBodyWay = (typeof DOWNED_BODY_WAYS)[number];

type DownedBodyPlan = { ok: true; simSeconds: number; label: string } | { ok: false; reason: string };

type DownedZombies = Pick<ZombieSystem, 'store' | 'finishDowned'>;

export const isDownedBodyWay = (value: unknown): value is DownedBodyWay =>
  DOWNED_BODY_WAYS.includes(value as DownedBodyWay);

/** The first carried tool, by name, with the quality at the level. */
const carriedTool = (inventory: Inventory, quality: string, level: number): Item | undefined =>
  [...inventory.items()]
    .filter(({ path }) => path.startsWith('inventory.hands.') || path.startsWith('inventory.worn.'))
    .map(({ item }) => item)
    .filter((item) => (defOf(inventory.registry, item.type).tool?.qualities[quality] ?? 0) >= level)
    .sort((a, b) => inventory.name(a).localeCompare(inventory.name(b)))[0];

/** Whether the player can clear this downed body that way now, how long it takes, and its label. */
export const downedBodyPlan = (player: ReachPlayer, zombie: Zombie | undefined, way: DownedBodyWay): DownedBodyPlan => {
  const downed = zombie?.incapacitated ? zombie.type.downed : undefined;
  if (!(zombie && downed)) {
    return { ok: false, reason: "It isn't lying there any more" };
  }
  if (bodyDistance(player, zombie.body) > INVENTORY_REACH) {
    return { ok: false, reason: 'Too far away' };
  }
  const name = zombie.type.name.toLowerCase();
  if (way === 'finish-off') {
    return { ok: true, simSeconds: downed.finishOff.simSeconds, label: `Finish off the ${name}` };
  }
  const { quality, level, simSeconds } = downed.dismember;
  const tool = carriedTool(player.inventory, quality, level);
  if (!tool) {
    return { ok: false, reason: `Need a tool with ${quality} quality ${level}` };
  }
  return {
    ok: true,
    simSeconds,
    label: `Dismember the ${name} with the ${player.inventory.name(tool).toLowerCase()}`,
  };
};

/** Queues clearing a downed body, unless it's queued already; returns why it can't be done now. */
export const queueDownedBody = (
  { queue, player, zombies }: { queue: HandlingQueue; player: ReachPlayer; zombies: DownedZombies },
  id: EntityId,
  way: DownedBodyWay,
): string | undefined => {
  if (
    queue.jobs.some((job) => job.kind === 'action' && job.jobType === DOWNED_BODY_ACTION && job.params.zombieId === id)
  ) {
    return undefined;
  }
  const plan = downedBodyPlan(player, zombies.store.get(id), way);
  if (!plan.ok) {
    return plan.reason;
  }
  queue.enqueueAction(DOWNED_BODY_ACTION, plan.label, plan.simSeconds, { zombieId: id, way });
  return undefined;
};

/** On completion the plan is checked again: a body gone, out of reach or without the tool stays as it lies. */
export const registerDownedBodyAction = ({
  queue,
  player,
  zombies,
}: {
  queue: HandlingQueue;
  player: ReachPlayer;
  zombies: DownedZombies;
}): void => {
  queue.registerAction(DOWNED_BODY_ACTION, ({ zombieId, way }) => {
    if (typeof zombieId !== 'number' || !Number.isSafeInteger(zombieId) || !isDownedBodyWay(way)) {
      throw new Error('Invalid downed body target');
    }
    const plan = downedBodyPlan(player, zombies.store.get(zombieId), way);
    return plan.ok ? zombies.finishDowned(zombieId, way === 'dismember') : plan.reason;
  });
};
