// Where things can go, for the inventory screen, its keys and the quickbar.

import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { HandSide, Inventory, Plan, Target } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';

export interface Option {
  label: string;
  target: Target;
  plan: Plan;
}

const SIDES: readonly HandSide[] = ['right', 'left'];

/** Every pocket of what the player holds and wears. */
export const playerPockets = (inv: Inventory): { owner: Item; pocket: number; label: string }[] =>
  inv.carried().flatMap((owner) =>
    (defOf(inv.registry, owner.type).container?.pockets ?? []).map((spec, pocket) => ({
      owner,
      pocket,
      label: `${inv.name(owner)}${spec.name ? ` · ${spec.name}` : ''}`,
    })),
  );

/** Blocks to drop on: the one at the player's feet, then the four around it. */
export const dropSpots = (feet: Vec3): Vec3[] => [
  feet,
  [feet[0] + 1, feet[1], feet[2]],
  [feet[0] - 1, feet[1], feet[2]],
  [feet[0], feet[1], feet[2] + 1],
  [feet[0], feet[1], feet[2] - 1],
];

/** Everywhere the item could go from here, with the time or the reason it can't. */
export const options = (inv: Inventory, item: Item, feet: Vec3): Option[] => {
  const out: Option[] = [];
  for (const side of SIDES) {
    const target: Target = { kind: 'hand', side };
    out.push({ label: `${side === 'right' ? 'Right' : 'Left'} hand`, target, plan: inv.plan(item, target) });
  }
  if (defOf(inv.registry, item.type).wearable) {
    out.push({ label: 'Wear it', target: { kind: 'worn' }, plan: inv.plan(item, { kind: 'worn' }) });
  }
  for (const { owner, pocket, label } of playerPockets(inv)) {
    const target: Target = { kind: 'pocket', owner, pocket };
    out.push({ label, target, plan: inv.plan(item, target) });
  }
  const drop = dropTarget(inv, item, feet);
  out.push({ label: 'Drop it here', ...drop });
  // Leave out the places it already is: those aren't choices.
  return out.filter((o) => o.plan.ok || !OBVIOUS.has(o.plan.reason));
};

const OBVIOUS = new Set(["It can't go inside itself", "It's already in that hand", "You're already wearing it"]);

/** The first drop spot with room. */
export const dropTarget = (inv: Inventory, item: Item, feet: Vec3): { target: Target; plan: Plan } => {
  let first: { target: Target; plan: Plan } | undefined;
  for (const pos of dropSpots(feet)) {
    const target: Target = { kind: 'pile', pos };
    const plan = inv.plan(item, target);
    first ??= { target, plan };
    if (plan.ok) {
      return { target, plan };
    }
  }
  return first!;
};

/** The quickest pocket on the player with room for the item. */
export const bestPocket = (inv: Inventory, item: Item): Option | undefined =>
  playerPockets(inv)
    .map(({ owner, pocket, label }): Option => {
      const target: Target = { kind: 'pocket', owner, pocket };
      return { label, target, plan: inv.plan(item, target) };
    })
    .filter((o) => o.plan.ok)
    .sort((a, b) => (a.plan.ok && b.plan.ok ? a.plan.time - b.plan.time : 0))[0];

/**
 * Queues the item into a hand. If both hands are busy, what the right hand holds
 * goes into a pocket (or on the floor) first. Returns why not, or undefined.
 */
export const toHands = (inv: Inventory, queue: HandlingQueue, item: Item, feet: Vec3): string | undefined => {
  for (const side of SIDES) {
    const result = queue.enqueue(item, { kind: 'hand', side });
    if (result.ok) {
      return undefined;
    }
  }
  const held = inv.hands.right ?? inv.hands.left;
  if (!held || held === item) {
    return inv.plan(item, { kind: 'hand', side: 'right' }).ok ? undefined : 'Your hands are full';
  }
  const away = bestPocket(inv, held)?.target ?? dropTarget(inv, held, feet).target;
  const stow = queue.enqueue(held, away);
  if (!stow.ok) {
    return stow.reason;
  }
  const side: HandSide = inv.hands.right === held ? 'right' : 'left';
  const take = queue.enqueue(item, { kind: 'hand', side }, item.count, true);
  return take.ok ? undefined : take.reason;
};
