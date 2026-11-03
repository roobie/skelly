import { actionText, fillText } from '../core/actionText.ts';
import type { Actor, ActorSystem } from '../core/actorSystem.ts';
import type { EntityId } from '../core/entities.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { bodyInReach, type ReachPlayer } from '../core/reach.ts';

const DOWNED_BODY_ACTION = 'actor.downed';
const DOWNED_BODY_WAYS = ['finish-off', 'dismember'] as const;
export type DownedBodyWay = (typeof DOWNED_BODY_WAYS)[number];

type DownedBodyPlan = { ok: true; simSeconds: number; label: string } | { ok: false; reason: string };

type DownedActors = Pick<ActorSystem, 'store' | 'finishDowned'>;

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
export const downedBodyPlan = (player: ReachPlayer, actor: Actor | undefined, way: DownedBodyWay): DownedBodyPlan => {
  const text = actionText(player.inventory.registry);
  const downed = actor?.incapacitated ? actor.type.downed : undefined;
  if (!(actor && downed)) {
    return { ok: false, reason: text.downedBody.gone };
  }
  if (!bodyInReach(player, actor.body)) {
    return { ok: false, reason: text.common.tooFar };
  }
  const name = actor.type.name.toLowerCase();
  if (way === 'finish-off') {
    return {
      ok: true,
      simSeconds: downed.finishOff.simSeconds,
      label: fillText(text.downedBody.finishOff, { actor: name }),
    };
  }
  const { quality, level, simSeconds } = downed.dismember;
  const tool = carriedTool(player.inventory, quality, level);
  if (!tool) {
    return { ok: false, reason: fillText(text.downedBody.noTool, { quality }) };
  }
  return {
    ok: true,
    simSeconds,
    label: fillText(text.downedBody.dismember, { actor: name, tool: player.inventory.name(tool).toLowerCase() }),
  };
};

/** Queues clearing a downed body, unless it's queued already; returns why it can't be done now. */
export const queueDownedBody = (
  { queue, player, actors }: { queue: HandlingQueue; player: ReachPlayer; actors: DownedActors },
  id: EntityId,
  way: DownedBodyWay,
): string | undefined => {
  if (
    queue.jobs.some((job) => job.kind === 'action' && job.jobType === DOWNED_BODY_ACTION && job.params.actorId === id)
  ) {
    return undefined;
  }
  const plan = downedBodyPlan(player, actors.store.get(id), way);
  if (!plan.ok) {
    return plan.reason;
  }
  queue.enqueueAction(DOWNED_BODY_ACTION, plan.label, plan.simSeconds, { actorId: id, way });
  return undefined;
};

/** On completion the plan is checked again: a body gone, out of reach or without the tool stays as it lies. */
export const registerDownedBodyAction = ({
  queue,
  player,
  actors,
}: {
  queue: HandlingQueue;
  player: ReachPlayer;
  actors: DownedActors;
}): void => {
  queue.registerAction(DOWNED_BODY_ACTION, ({ actorId, way }) => {
    if (typeof actorId !== 'number' || !Number.isSafeInteger(actorId) || !isDownedBodyWay(way)) {
      throw new Error('Invalid downed body target');
    }
    const plan = downedBodyPlan(player, actors.store.get(actorId), way);
    return plan.ok ? actors.finishDowned(actorId, way === 'dismember') : plan.reason;
  });
};
