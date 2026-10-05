// Item action availability. Views display these plans; commands revalidate at completion.

import type { BlockEntity, DoorOperation } from './blockEntities.ts';
import { dominantSide, offSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import type { HandlingQueue } from './handling.ts';
import { dropSpots, type HandSide, type Inventory, type Plan, type Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { BATTERY_SWAP, chargeOf, fitsLight } from './lights.ts';
import type { ReachSnapshot } from './reach.ts';
import type { Readable } from './readable.ts';

/** Keys stay ordinary Inventory-owned items; only held definitions authorize a door lock. */
export const heldKeyLocks = (inventory: Inventory): string[] =>
  Object.values(inventory.hands).flatMap((item) => {
    const lock = item && defOf(inventory.registry, item.type).key?.lock;
    return lock === undefined ? [] : [lock];
  });

export const doorPlan = (
  inventory: Inventory,
  entity: BlockEntity,
  operation: DoorOperation,
  keyLocks = heldKeyLocks(inventory),
): Plan => {
  const refusal = inventory.entities.doorRefusal(entity, operation, keyLocks);
  const reason =
    refusal ??
    ((operation === 'lock' || operation === 'unlock') && !inventory.canReachEntity(entity)
      ? 'Too far away'
      : undefined);
  return reason ? { ok: false, reason } : { ok: true, time: inventory.entities.defOf(entity).door!.handling };
};

export const doorOptions = (
  inventory: Inventory,
  entity: BlockEntity,
): { operation: DoorOperation; label: string; plan: Plan }[] => {
  const operation = entity.open ? 'close' : 'open';
  const lock: DoorOperation = entity.lock?.locked ? 'unlock' : 'lock';
  return [
    { operation, label: entity.open ? 'Close' : 'Open', plan: doorPlan(inventory, entity, operation) },
    ...(entity.lock
      ? [
          {
            operation: lock,
            label: entity.lock.locked ? 'Unlock' : 'Lock',
            plan: doorPlan(inventory, entity, lock),
          },
        ]
      : []),
  ];
};

export const EAT_TIME = 3;
export const DRINK_TIME = 2;

export interface MoveOption {
  kind: 'move';
  label: string;
  target: Target;
  plan: Plan;
}

export interface UseOption {
  kind: 'use';
  label: string;
  plan: Plan;
  operation?: 'eat' | 'switch' | 'battery' | 'read';
  light?: Item;
  battery?: Item;
  readable?: Readable;
}

export type Option = MoveOption | UseOption;
const SIDES: readonly HandSide[] = ['right', 'left'];
const otherHand = (side: HandSide): HandSide => (side === 'right' ? 'left' : 'right');
const OBVIOUS = new Set(["It can't go inside itself", "It's already in that hand", "You're already wearing it"]);

/** Every pocket of what the player holds and wears, retaining ordinary move ordering. */
export const playerPockets = (inv: Inventory): { owner: Item; pocket: number; label: string }[] =>
  inv.carried().flatMap((owner) =>
    (defOf(inv.registry, owner.type).container?.pockets ?? []).map((spec, pocket) => ({
      owner,
      pocket,
      label: `${inv.name(owner)}${spec.name ? ` · ${spec.name}` : ''}`,
    })),
  );

/** Ordinary drop finds room for either a carried move or a fresh emission. */
export const dropTarget = (inv: Inventory, item: Item, feet: Vec3): { target: Target; plan: Plan } => {
  let first: { target: Target; plan: Plan } | undefined;
  const fresh = inv.locate(item) === undefined;
  for (const pos of dropSpots(feet)) {
    const target: Target = { kind: 'pile', pos };
    const plan = fresh ? inv.planAdd(item, target) : inv.plan(item, target);
    first ??= { target, plan };
    if (plan.ok) {
      return { target, plan };
    }
  }
  return first!;
};

/** Ordinary E key still picks the quickest pocket, not quick-move's backpack priority. */
export const bestPocket = (inv: Inventory, item: Item): MoveOption | undefined =>
  playerPockets(inv)
    .map(({ owner, pocket, label }): MoveOption => {
      const target: Target = { kind: 'pocket', owner, pocket };
      return { kind: 'move', label, target, plan: inv.plan(item, target) };
    })
    .filter((o) => o.plan.ok)
    .sort((a, b) => (a.plan.ok && b.plan.ok ? a.plan.time - b.plan.time : 0))[0];

/** Quick move uses worn inventory only: back, other containers, then clothing pockets. */
const inventoryPocket = (inv: Inventory, item: Item): Target | undefined => {
  const priority = (owner: Item): number => {
    const def = defOf(inv.registry, owner.type);
    if (def.wearable?.slot === 'back') {
      return 0;
    }
    return def.category === 'bag' ? 1 : 2;
  };
  for (const owner of Object.values(inv.worn)
    .filter((i): i is Item => i !== undefined)
    .sort((a, b) => priority(a) - priority(b))) {
    for (const [pocket] of (defOf(inv.registry, owner.type).container?.pockets ?? []).entries()) {
      const target: Target = { kind: 'pocket', owner, pocket };
      if (inv.plan(item, target).ok) {
        return target;
      }
    }
  }
  return undefined;
};

/** Dominant-hand items stow; other carried items drop exactly at the feet. */
export const quickMove = (item: Item, view: ReachSnapshot): MoveOption => {
  const inv = view.player.inventory;
  const at = inv.locate(item);
  let target: Target = { kind: 'pile', pos: view.feet };
  if (at && ((at.kind === 'hand' && at.side === dominantSide(inv.character)) || inv.placeOf(at) !== undefined)) {
    const wear: Target = { kind: 'worn' };
    if (at.kind === 'pile' && item.pockets && inv.plan(item, wear).ok) {
      target = wear;
    } else {
      const pocket = inventoryPocket(inv, item);
      if (!pocket) {
        return {
          kind: 'move',
          label: 'Quick move',
          target,
          plan: { ok: false, reason: "It doesn't fit in your inventory" },
        };
      }
      target = pocket;
    }
  }
  return { kind: 'move', label: 'Quick move', target, plan: inv.plan(item, target) };
};

const refuseUse = (reason: string): UseOption => ({ kind: 'use', label: 'Use', plan: { ok: false, reason } });

const batteryOption = (battery: Item, inv: Inventory, selectedLight?: Item): UseOption => {
  const light =
    selectedLight ??
    [inv.hands[dominantSide(inv.character)], inv.hands[offSide(inv.character)]].find(
      (held) => held && fitsLight(inv.registry, held, battery),
    );
  return light
    ? {
        kind: 'use',
        label: `Put a battery in the ${inv.name(light).toLowerCase()}`,
        operation: 'battery',
        light,
        battery,
        plan: { ok: true, time: BATTERY_SWAP },
      }
    : refuseUse('Hold the light it goes in first');
};

const lightOption = (item: Item, view: ReachSnapshot): UseOption => {
  const inv = view.player.inventory;
  if (!item.on && chargeOf(inv.registry, item) === 0) {
    const [battery] = view.entries
      .map((entry) => entry.item)
      .filter((candidate) => fitsLight(inv.registry, item, candidate) && (chargeOf(inv.registry, candidate) ?? 0) > 0)
      .sort((a, b) => (chargeOf(inv.registry, b) ?? 0) - (chargeOf(inv.registry, a) ?? 0));
    return battery ? batteryOption(battery, inv, item) : refuseUse('The battery is dead, and you have no spare');
  }
  return {
    kind: 'use',
    label: `Switch ${item.on ? 'off' : 'on'}`,
    operation: 'switch',
    light: item,
    plan: { ok: true, time: 0 },
  };
};

const foodOption = (name: string, drink: boolean): UseOption => ({
  kind: 'use',
  label: `${drink ? 'Drink' : 'Eat'} the ${name}`,
  operation: 'eat',
  plan: { ok: true, time: drink ? DRINK_TIME : EAT_TIME },
});

/** Eligibility only: effects remain in the domain command owner. */
export const useOption = (item: Item, view: ReachSnapshot): UseOption => {
  const inv = view.player.inventory;
  const def = defOf(inv.registry, item.type);
  const name = def.name.toLowerCase();
  const at = inv.locate(item);
  if (!at) {
    return refuseUse(def.battery ? "The battery isn't there any more" : `Take the ${name} in your hands first`);
  }
  if (!view.entries.some((entry) => entry.item === item)) {
    const place = inv.placeOf(at);
    return refuseUse(place?.kind === 'furniture' && !place.entity.searched ? 'Search it first' : 'Too far away');
  }
  if (def.battery) {
    return batteryOption(item, inv);
  }
  if (at.kind !== 'hand') {
    return refuseUse(`Take the ${name} in your hands first`);
  }
  if (def.readable) {
    return { kind: 'use', label: 'Read', operation: 'read', readable: def.readable, plan: { ok: true, time: 0 } };
  }
  if (def.food) {
    return foodOption(name, def.category === 'drink');
  }
  return def.light ? lightOption(item, view) : refuseUse(`Nothing to do with the ${name} yet`);
};

/** All move/use choices, including their refusal reasons and ordinary handling times. */
export const options = (item: Item, view: ReachSnapshot): Option[] => {
  const inv = view.player.inventory;
  const out: Option[] = SIDES.map((side): MoveOption => {
    const target: Target = { kind: 'hand', side };
    return { kind: 'move', label: `${side === 'right' ? 'Right' : 'Left'} hand`, target, plan: inv.plan(item, target) };
  });
  if (defOf(inv.registry, item.type).wearable) {
    out.push({ kind: 'move', label: 'Wear it', target: { kind: 'worn' }, plan: inv.plan(item, { kind: 'worn' }) });
  }
  for (const { owner, pocket, label } of playerPockets(inv)) {
    const target: Target = { kind: 'pocket', owner, pocket };
    out.push({ kind: 'move', label, target, plan: inv.plan(item, target) });
  }
  out.push(
    { kind: 'move', label: 'Drop it here', ...dropTarget(inv, item, view.feet) },
    quickMove(item, view),
    useOption(item, view),
  );
  return out.filter((o) => o.plan.ok || !OBVIOUS.has(o.plan.reason));
};

export const quickbarHand = (inv: Inventory, item: Item): HandSide => {
  const def = defOf(inv.registry, item.type);
  return def.light && !def.twoHanded ? offSide(inv.character) : dominantSide(inv.character);
};

/** Quickbar tap: clear only the hand(s) the item needs, then take it there. */
export const quickbarTake = (inv: Inventory, queue: HandlingQueue, item: Item, feet: Vec3): string | undefined => {
  const def = defOf(inv.registry, item.type);
  const side = quickbarHand(inv, item);
  const needs: HandSide[] = def.twoHanded ? [...SIDES] : [side];
  if (!def.twoHanded && inv.hands[otherHand(side)] && defOf(inv.registry, inv.hands[otherHand(side)]!.type).twoHanded) {
    needs.push(otherHand(side));
  }
  const displaced = new Set<Item>();
  for (const hand of needs) {
    const held = inv.hands[hand];
    if (held && held !== item) {
      displaced.add(held);
    }
  }
  for (const held of displaced) {
    const away = bestPocket(inv, held)?.target ?? dropTarget(inv, held, feet).target;
    const stow = queue.enqueue(held, away);
    if (!stow.ok) {
      return stow.reason;
    }
  }
  const take = queue.enqueue(item, { kind: 'hand', side }, item.count, displaced.size > 0);
  return take.ok ? undefined : take.reason;
};

/** Put a held quickbar item back at its captured location, or in the best pocket if that no longer fits. */
export const quickbarPutAway = (inv: Inventory, queue: HandlingQueue, item: Item): string | undefined => {
  const origin = inv.quickbarOrigin(item);
  const remembered = origin && inv.resolveTarget(origin);
  const target = remembered && inv.plan(item, remembered).ok ? remembered : bestPocket(inv, item)?.target;
  if (!target) {
    return 'Your pockets are full';
  }
  const result = queue.enqueue(item, target);
  return result.ok ? undefined : result.reason;
};

/** Ordinary to-hands behavior, including moving an occupied hand away first. */
export const toHands = (inv: Inventory, queue: HandlingQueue, item: Item, feet: Vec3): string | undefined => {
  const preferred = dominantSide(inv.character);
  const secondary = offSide(inv.character);
  for (const side of [preferred, secondary]) {
    const result = queue.enqueue(item, { kind: 'hand', side });
    if (result.ok) {
      return undefined;
    }
  }
  const held = inv.hands[preferred] ?? inv.hands[secondary];
  if (!held || held === item) {
    return inv.plan(item, { kind: 'hand', side: preferred }).ok ? undefined : 'Your hands are full';
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
