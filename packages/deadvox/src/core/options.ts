// Item action availability. Views display these plans; commands revalidate at completion.
// The to-hands and quickbar commands also enqueue their handling jobs here, so a refusal reaches the caller as text.

import type { BlockEntity, DoorOperation } from './blockEntities.ts';
import { dominantSide, offSide } from './character.ts';
import type { ItemDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { HandlingQueue, MoveJob } from './handling.ts';
import { dropSpots, type HandSide, Inventory, type Plan, type Target, wornSlotOf } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { NO_LANDING_REFUSAL } from './itemThrow.ts';
import { chargeOf, fitsLight } from './lights.ts';
import type { ReachSnapshot } from './reach.ts';
import type { Readable } from './readable.ts';
import { fitsFuelledTool } from './torch.ts';

/** Keys stay ordinary Inventory-owned items; only held definitions authorize a door lock. */
export const heldKeyLocks = (inventory: Inventory): string[] =>
  Object.values(inventory.hands).flatMap((item) => {
    const lock = item && defOf(inventory.registry, item.type).key?.lock;
    return lock === undefined ? [] : [lock];
  });

/** A door bar the player holds; a bar is two-handed, so the other hand is empty. */
export const heldDoorBar = (inventory: Inventory): Item | undefined =>
  [inventory.hands.right, inventory.hands.left].find(
    (held) => held !== undefined && defOf(inventory.registry, held.type).doorBar !== undefined,
  );

/** Setting a bar takes it from both hands; lifting one needs both hands free. */
const barHandsRefusal = (inventory: Inventory, operation: DoorOperation): string | undefined => {
  if (operation === 'unbar') {
    return inventory.liftRefusal();
  }
  return operation !== 'bar' || heldDoorBar(inventory) ? undefined : 'Hold a door bar';
};

const doorSimSeconds = (inventory: Inventory, entity: BlockEntity, operation: DoorOperation): number => {
  switch (operation) {
    case 'bar':
      return defOf(inventory.registry, heldDoorBar(inventory)!.type).doorBar!.setSimSeconds;
    case 'unbar':
      return defOf(inventory.registry, entity.bar!.item).doorBar!.liftSimSeconds;
    default:
      return inventory.entities.defOf(entity).door!.handlingSimSeconds;
  }
};

export const doorPlan = (
  inventory: Inventory,
  entity: BlockEntity,
  operation: DoorOperation,
  keyLocks = heldKeyLocks(inventory),
): Plan => {
  const refusal = inventory.entities.doorRefusal(entity, operation, keyLocks, inventory.actorPosition());
  const handled = operation !== 'open' && operation !== 'close';
  const reason =
    refusal ??
    (handled && !inventory.canReachEntity(entity) ? 'Too far away' : undefined) ??
    barHandsRefusal(inventory, operation);
  return reason ? { ok: false, reason } : { ok: true, time: doorSimSeconds(inventory, entity, operation) };
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

/** How one of `def` is consumed: eaten, drunk or, for a painkiller, taken. Undefined for anything else. */
export const consumption = (
  def: ReturnType<typeof defOf>,
  registry: Registry,
): { label: string; simSeconds: number } | undefined => {
  const name = def.name.toLowerCase();
  if (def.serving) {
    const food = defOf(registry, def.serving.food).food!;
    return { label: `Eat from the ${name}`, simSeconds: food.consumeSimSeconds };
  }
  if (def.analgesic) {
    return { label: `Take one ${name}`, simSeconds: def.analgesic.takeSimSeconds };
  }
  if (!def.food) {
    return undefined;
  }
  const drink = def.category === 'drink';
  return { label: `${drink ? 'Drink' : 'Eat'} the ${name}`, simSeconds: def.food.consumeSimSeconds };
};

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
  operation?: 'consume' | 'switch' | 'battery' | 'canister' | 'read' | 'trap';
  light?: Item;
  battery?: Item;
  tool?: Item;
  canister?: Item;
  readable?: Readable;
}

export type Option = MoveOption | UseOption;
const SIDES: readonly HandSide[] = ['right', 'left'];
const otherHand = (side: HandSide): HandSide => (side === 'right' ? 'left' : 'right');
const OBVIOUS = new Set(["It can't go inside itself", "It's already in that hand", "You're already wearing it"]);

/** Every pocket of what the player holds and wears, retaining ordinary move ordering. */
export const playerPockets = (
  inv: Pick<Inventory, 'carried' | 'registry' | 'name'>,
): { owner: Item; pocket: number; label: string }[] =>
  inv.carried().flatMap((owner) =>
    (defOf(inv.registry, owner.type).container?.pockets ?? []).map((spec, pocket) => ({
      owner,
      pocket,
      label: `${inv.name(owner)}${spec.name ? ` · ${spec.name}` : ''}`,
    })),
  );

type DropInventory = Pick<Inventory, 'locate' | 'planAdd' | 'plan' | 'landing'>;

/** The first spot with room on the ground below it, else the first with ground; undefined with no ground at all. */
const landedDrop = (
  inv: DropInventory,
  item: Item,
  feet: Vec3,
  fresh: boolean,
): { target: Target; plan: Plan } | undefined => {
  let first: { target: Target; plan: Plan } | undefined;
  for (const spot of dropSpots(feet)) {
    const pos = inv.landing(spot);
    if (!pos) {
      continue;
    }
    const target: Target = { kind: 'pile', pos };
    const plan = fresh ? inv.planAdd(item, target) : inv.plan(item, target);
    first ??= { target, plan };
    if (plan.ok) {
      return { target, plan };
    }
  }
  return first;
};

/** Ordinary drop finds room for either a carried move or a fresh emission, on the ground below each spot. */
export const dropTarget = (inv: DropInventory, item: Item, feet: Vec3): { target: Target; plan: Plan } =>
  landedDrop(inv, item, feet, inv.locate(item) === undefined) ?? {
    target: { kind: 'pile', pos: feet },
    plan: { ok: false, reason: NO_LANDING_REFUSAL },
  };

/** Where a new item, or a part leaving its slot, is put down; undefined when nothing nearby has ground below. */
export const freshDropTarget = (inv: DropInventory, item: Item, feet: Vec3): Target | undefined =>
  landedDrop(inv, item, feet, true)?.target;

/** A sling-fitted long gun goes on a free shoulder before any pocket or the ground: the sling is for carrying it. */
const slingTarget = (inv: Inventory, item: Item): Target | undefined => {
  const target: Target = { kind: 'worn' };
  return wornSlotOf(inv.registry, item) === 'shoulder' && inv.plan(item, target).ok ? target : undefined;
};

/** Where an item leaving a held one goes: the first player pocket with room, else the ground at the feet. */
export const stowTarget = (inv: Inventory, item: Item, feet: Vec3): Target | undefined => {
  const inPocket = playerPockets(inv)
    .map(({ owner, pocket }): Target => ({ kind: 'pocket', owner, pocket }))
    .find((target) => inv.planAdd(item, target).ok);
  const ground = inPocket ? undefined : dropTarget(inv, item, feet);
  return inPocket ?? (ground?.plan.ok ? ground.target : undefined);
};

/** Ordinary E key still picks the quickest pocket, not quick-move's backpack priority. */
export const bestPocket = (
  inv: Pick<Inventory, 'carried' | 'registry' | 'name' | 'plan'>,
  item: Item,
): MoveOption | undefined =>
  playerPockets(inv)
    .map(({ owner, pocket, label }): MoveOption => {
      const target: Target = { kind: 'pocket', owner, pocket };
      return { kind: 'move', label, target, plan: inv.plan(item, target) };
    })
    .filter((o) => o.plan.ok)
    .sort((a, b) => (a.plan.ok && b.plan.ok ? a.plan.time - b.plan.time : 0))[0];

/** Queues an ordinary ground pickup into the quickest player pocket that can carry it. */
export const pocketGroundItem = (inv: Inventory, queue: HandlingQueue, item: Item): string | undefined => {
  if (inv.locate(item)?.kind !== 'pile') {
    return 'The item is no longer on the ground';
  }
  const target: Target | undefined =
    defOf(inv.registry, item.type).wearable?.slot === 'back' && inv.worn.back === undefined
      ? { kind: 'worn' }
      : (slingTarget(inv, item) ?? bestPocket(inv, item)?.target);
  if (!target) {
    return 'No room on you';
  }
  const move = queue.enqueue(item, target);
  return move.ok ? undefined : move.reason;
};

/** Quick move uses worn inventory only: back, other containers, then clothing pockets. */
const inventoryPocket = (inv: Inventory, item: Item): Target | undefined => {
  const priority = (owner: Item): number => {
    const def = defOf(inv.registry, owner.type);
    if (def.wearable?.slot === 'back') {
      return 0;
    }
    return def.category === 'bag' ? 1 : 2;
  };
  const targets = Object.values(inv.worn)
    .filter((i): i is Item => i !== undefined)
    .sort((a, b) => priority(a) - priority(b))
    .flatMap((owner) =>
      (defOf(inv.registry, owner.type).container?.pockets ?? []).map((_, pocket) => ({
        target: { kind: 'pocket', owner, pocket } satisfies Target,
        plan: inv.plan(item, { kind: 'pocket', owner, pocket }),
      })),
    );
  return targets.find(({ plan }) => plan.ok && plan.merge)?.target ?? targets.find(({ plan }) => plan.ok)?.target;
};

/** Dominant-hand items stow; other carried items drop as an ordinary drop does. */
export const quickMove = (item: Item, view: ReachSnapshot): MoveOption => {
  const inv = view.player.inventory;
  const at = inv.locate(item);
  if (!(at && ((at.kind === 'hand' && at.side === dominantSide(inv.character)) || inv.placeOf(at) !== undefined))) {
    return { kind: 'move', label: 'Quick move', ...dropTarget(inv, item, view.feet) };
  }
  const wear: Target = { kind: 'worn' };
  const target =
    slingTarget(inv, item) ??
    (at.kind === 'pile' && item.pockets && inv.plan(item, wear).ok ? wear : inventoryPocket(inv, item));
  return target
    ? { kind: 'move', label: 'Quick move', target, plan: inv.plan(item, target) }
    : {
        kind: 'move',
        label: 'Quick move',
        target: { kind: 'pile', pos: view.feet },
        plan: { ok: false, reason: "It doesn't fit in your inventory" },
      };
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
        plan: swapPlan(defOf(inv.registry, light.type).light!.power!.swapSimSeconds),
      }
    : refuseUse('Hold the light it goes in first');
};

const swapPlan = (simSeconds: number): UseOption['plan'] => ({ ok: true, time: simSeconds });

const canisterOption = (canister: Item, inv: Inventory): UseOption => {
  const tool = [inv.hands[dominantSide(inv.character)], inv.hands[offSide(inv.character)]].find(
    (held) => held && fitsFuelledTool(inv, held, canister),
  );
  return tool
    ? {
        kind: 'use',
        label: `Put a gas cartridge in the ${inv.name(tool).toLowerCase()}`,
        operation: 'canister',
        tool,
        canister,
        plan: swapPlan(defOf(inv.registry, tool.type).tool!.fuel!.swapSimSeconds),
      }
    : refuseUse('Hold the tool it goes in first');
};

const lightOption = (item: Item, view: ReachSnapshot): UseOption => {
  const inv = view.player.inventory;
  if (!item.on && chargeOf(inv.registry, item) === 0) {
    if (!defOf(inv.registry, item.type).light?.power) {
      return refuseUse("It's out of fuel");
    }
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

const useLocationRefusal = (
  item: Item,
  at: NonNullable<ReturnType<Inventory['locate']>>,
  inventory: Inventory,
): string | undefined => {
  if (at.kind === 'hand') {
    return undefined;
  }
  const { light } = defOf(inventory.registry, item.type);
  if (at.kind === 'worn' && at.slot === 'head' && light?.beam !== undefined) {
    return !item.on && chargeOf(inventory.registry, item) === 0
      ? 'Take the headlamp in your hands to replace its battery'
      : undefined;
  }
  return `Take the ${defOf(inventory.registry, item.type).name.toLowerCase()} in your hands first`;
};

const goneReason = (def: ItemDef, name: string): string => {
  if (def.battery) {
    return "The battery isn't there any more";
  }
  return def.canister ? "The cartridge isn't there any more" : `Take the ${name} in your hands first`;
};

/** A trap lying set is disarmed where it lies; an unset one is set from the hands. */
const trapOption = (
  item: Item,
  at: NonNullable<ReturnType<Inventory['locate']>>,
  inventory: Inventory,
  { disarmSimSeconds, setSimSeconds }: { disarmSimSeconds: number; setSimSeconds: number },
): UseOption => {
  if (item.trap) {
    return item.trap.state === 'armed'
      ? { kind: 'use', label: 'Disarm', operation: 'trap', plan: swapPlan(disarmSimSeconds) }
      : refuseUse("It's shut on a leg");
  }
  const refusal = useLocationRefusal(item, at, inventory);
  return refusal
    ? refuseUse(refusal)
    : { kind: 'use', label: 'Set it', operation: 'trap', plan: swapPlan(setSimSeconds) };
};

/** Eligibility only: effects remain in the domain command owner. */
export const useOption = (item: Item, view: ReachSnapshot): UseOption => {
  const inv = view.player.inventory;
  const def = defOf(inv.registry, item.type);
  const name = def.name.toLowerCase();
  const at = inv.locate(item);
  if (!at) {
    return refuseUse(goneReason(def, name));
  }
  if (!view.entries.some((entry) => entry.item === item)) {
    const place = inv.placeOf(at);
    return refuseUse(place?.kind === 'furniture' && !place.entity.searched ? 'Search it first' : 'Too far away');
  }
  if (def.battery) {
    return batteryOption(item, inv);
  }
  if (def.canister) {
    return canisterOption(item, inv);
  }
  if (def.trap) {
    return trapOption(item, at, inv, def.trap);
  }
  const locationRefusal = useLocationRefusal(item, at, inv);
  if (locationRefusal) {
    return refuseUse(locationRefusal);
  }
  if (def.book || def.readable) {
    return {
      kind: 'use',
      label: 'Read',
      operation: 'read',
      ...(def.readable ? { readable: def.readable } : {}),
      plan: { ok: true, time: 0 },
    };
  }
  const consumed = consumption(def, inv.registry);
  if (consumed) {
    return { kind: 'use', label: consumed.label, operation: 'consume', plan: { ok: true, time: consumed.simSeconds } };
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
  const wornSlot = wornSlotOf(inv.registry, item);
  if (wornSlot) {
    const label = wornSlot === 'shoulder' ? 'Sling it' : 'Wear it';
    out.push({ kind: 'move', label, target: { kind: 'worn' }, plan: inv.plan(item, { kind: 'worn' }) });
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

const quickbarHand = (inv: Inventory, item: Item): HandSide => {
  const def = defOf(inv.registry, item.type);
  return def.light && !def.twoHanded ? offSide(inv.character) : dominantSide(inv.character);
};

/** Where a displaced held item goes without being dropped: a free shoulder, else the best pocket's planned spot. */
const carryTarget = (inv: Inventory, item: Item): Target | undefined => {
  const sling = slingTarget(inv, item);
  if (sling) {
    return sling;
  }
  const pocket = bestPocket(inv, item);
  if (!(pocket?.plan.ok && pocket.target.kind === 'pocket')) {
    return undefined;
  }
  return pocket.plan.at ? { ...pocket.target, at: pocket.plan.at } : pocket.target;
};

const liveTargetFor = (inv: Inventory, target: Target): Target | undefined => {
  if (target.kind === 'furniture') {
    const entity = inv.entities.byUid(target.entity.uid);
    return entity ? { ...target, entity } : undefined;
  }
  if (target.kind !== 'pocket') {
    return target;
  }
  const owner = inv.itemByUid(target.owner.uid);
  return owner ? { ...target, owner } : undefined;
};

/** A copy to plan a sequence of moves on; it lands drops as the live inventory does. */
const planningCopy = (inv: Inventory): Inventory => {
  const copy = Inventory.restoreState(inv.registry, inv.snapshotState());
  copy.landing = inv.landing;
  return copy;
};

const queueQuickbarStows = (
  inventory: Inventory,
  queue: HandlingQueue,
  displaced: ReadonlySet<Item>,
): { queued: number; unable: Item[] } => {
  const plannedInventory = planningCopy(inventory);
  const unable: Item[] = [];
  let queued = 0;
  for (const held of displaced) {
    const plannedItem = plannedInventory.itemByUid(held.uid);
    const plannedTarget = plannedItem && carryTarget(plannedInventory, plannedItem);
    const target = plannedTarget && liveTargetFor(inventory, plannedTarget);
    if (!(plannedItem && plannedTarget && target)) {
      unable.push(held);
      continue;
    }
    const stow = queue.enqueue(held, target);
    if (!stow.ok) {
      unable.push(held);
      continue;
    }
    if (!plannedInventory.move(plannedItem, plannedTarget).ok) {
      queue.cancelJob(stow.job);
      unable.push(held);
      continue;
    }
    queued += 1;
  }
  return { queued, unable };
};

/** Quickbar tap: stow what fits without dropping anything, then take only with free hands. */
export const quickbarTake = (inv: Inventory, queue: HandlingQueue, item: Item): string | undefined => {
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
  const { queued, unable } = queueQuickbarStows(inv, queue, displaced);
  if (unable.length > 0) {
    const names = unable.map((held) => inv.name(held));
    return `Can't stow ${names.join(' or ')}; your hands stay occupied`;
  }
  const take = queue.enqueue(item, { kind: 'hand', side }, item.count, queued > 0);
  return take.ok ? undefined : take.reason;
};

/** Put a held quickbar item back at its captured location, or in the best pocket if that no longer fits. */
export const quickbarPutAway = (inv: Inventory, queue: HandlingQueue, item: Item): string | undefined => {
  const origin = inv.quickbarOrigin(item);
  const remembered = origin && inv.resolveTarget(origin);
  const target =
    remembered && inv.plan(item, remembered).ok
      ? remembered
      : (slingTarget(inv, item) ?? bestPocket(inv, item)?.target);
  if (!target) {
    return 'Your pockets are full';
  }
  const result = queue.enqueue(item, target);
  return result.ok ? undefined : result.reason;
};

const cancelStows = (queue: HandlingQueue, jobs: readonly MoveJob[]): void => {
  for (const job of jobs) {
    queue.cancelJob(job);
  }
};

const carriedStowTarget = (inv: Inventory, item: Item): Target | undefined =>
  slingTarget(inv, item) ?? bestPocket(inv, item)?.target;

/** The container grid a wielded item comes from, as a target that takes any free spot in it. */
const sourceGrid = (inv: Inventory, item: Item | undefined): Target | undefined => {
  const from = item && inv.locate(item);
  switch (from?.kind) {
    case 'furniture':
      return { kind: 'furniture', entity: from.entity, pocket: from.pocket };
    case 'pocket':
      return { kind: 'pocket', owner: from.owner, pocket: from.pocket };
    default:
      return undefined;
  }
};

/** Where a held item may make way besides the player: an empty off hand, and the wielded item's container. */
interface MakeWay {
  readonly offHand?: HandSide | undefined;
  readonly source?: Target | undefined;
}

const oneHandWay = (inv: Inventory, item: Item, offHand: HandSide): MakeWay => ({
  offHand: inv.hands[offHand] ? undefined : offHand,
  source: sourceGrid(inv, item),
});

const ifPlans = (inv: Inventory, held: Item, target: Target | undefined): Target | undefined =>
  target && inv.plan(held, target).ok ? target : undefined;

/**
 * A wielded item is one the player wants to keep, and so is the held item it displaces:
 * on the player first, then the empty off hand, then the wielded item's container, and only then at the feet.
 */
const stowRoom = (inv: Inventory, held: Item, way: MakeWay): Target | undefined =>
  carriedStowTarget(inv, held) ??
  // A two-handed item plans into the empty off hand but then bars the wielded item from the main hand.
  ifPlans(
    inv,
    held,
    way.offHand && !defOf(inv.registry, held.type).twoHanded ? { kind: 'hand', side: way.offHand } : undefined,
  ) ??
  ifPlans(inv, held, way.source);

const stowsHeldFirst = (inv: Inventory, displaced: readonly Item[], way: MakeWay): boolean =>
  displaced.length > 0 && displaced.every((held) => stowRoom(inv, held, way));

const plannedStowTarget = (inv: Inventory, item: Item, feet: Vec3, way: MakeWay = {}): Target | undefined => {
  const room = stowRoom(inv, item, way);
  if (room) {
    return room;
  }
  const drop = dropTarget(inv, item, feet);
  return drop.plan.ok ? drop.target : undefined;
};

const stowTwoHandDisplacements = (args: {
  readonly inv: Inventory;
  readonly queue: HandlingQueue;
  readonly item: Item;
  readonly feet: Vec3;
  readonly displaced: readonly Item[];
  readonly target: Target;
}): string | undefined => {
  const { inv, queue, item, feet, displaced, target } = args;
  const planned = planningCopy(inv);
  const plannedSource = sourceGrid(planned, planned.itemByUid(item.uid));
  const stows: MoveJob[] = [];
  for (const held of displaced) {
    const plannedHeld = planned.itemByUid(held.uid);
    const plannedTarget = plannedHeld && plannedStowTarget(planned, plannedHeld, feet, { source: plannedSource });
    const liveTarget = plannedTarget && liveTargetFor(inv, plannedTarget);
    if (!(plannedHeld && plannedTarget && liveTarget)) {
      cancelStows(queue, stows);
      return 'Could not make room in your hands';
    }
    const stow = queue.enqueue(held, liveTarget, held.count, stows.length > 0);
    if (!stow.ok) {
      cancelStows(queue, stows);
      return stow.reason;
    }
    stows.push(stow.job);
    if (!planned.move(plannedHeld, plannedTarget).ok) {
      cancelStows(queue, stows);
      return 'Could not make room in your hands';
    }
  }
  const plannedItem = planned.itemByUid(item.uid);
  const plan = plannedItem && planned.plan(plannedItem, target);
  if (!plan?.ok) {
    cancelStows(queue, stows);
    return plan?.reason ?? 'The item is no longer available';
  }
  const take = queue.enqueue(item, target, item.count, true);
  if (!take.ok) {
    cancelStows(queue, stows);
    return take.reason;
  }
  return undefined;
};

const wieldTwoHanded = (inv: Inventory, queue: HandlingQueue, item: Item, feet: Vec3): string | undefined => {
  const preferred = dominantSide(inv.character);
  const secondary = offSide(inv.character);
  const target: Target = { kind: 'hand', side: preferred };
  const displaced = [...new Set([inv.hands[preferred], inv.hands[secondary]])].filter(
    (held): held is Item => held !== undefined && held !== item,
  );
  if (!stowsHeldFirst(inv, displaced, { source: sourceGrid(inv, item) })) {
    const direct = queue.enqueue(item, target);
    if (direct.ok || direct.reason === 'Already queued') {
      return direct.ok ? undefined : direct.reason;
    }
    if (inv.hands[preferred] === item && inv.hands[secondary] === item) {
      return undefined;
    }
    if (displaced.length === 0) {
      return direct.reason;
    }
  }
  return stowTwoHandDisplacements({ inv, queue, item, feet, displaced, target });
};

/** Ordinary to-hands behavior, including moving an occupied hand away first. */
export const toHands = (inv: Inventory, queue: HandlingQueue, item: Item, feet: Vec3): string | undefined => {
  if (defOf(inv.registry, item.type).twoHanded) {
    return wieldTwoHanded(inv, queue, item, feet);
  }
  const preferred = dominantSide(inv.character);
  const secondary = offSide(inv.character);
  const occupant = inv.hands[preferred];
  const displaced = occupant && occupant !== item ? [occupant] : [];
  const way = oneHandWay(inv, item, secondary);
  // A direct move into the occupied hand swaps the held item into the wielded item's own spot,
  // the last room in its container; a free off hand takes the held item, never the wielded one.
  const sides = displaced.length > 0 ? [preferred] : [preferred, secondary];
  if (
    !stowsHeldFirst(inv, displaced, way) &&
    sides.some((hand) => queue.enqueue(item, { kind: 'hand', side: hand }).ok)
  ) {
    return undefined;
  }
  const held = inv.hands[preferred] ?? inv.hands[secondary];
  if (!held || held === item) {
    return inv.plan(item, { kind: 'hand', side: preferred }).ok ? undefined : 'Your hands are full';
  }
  const away = plannedStowTarget(inv, held, feet, way);
  const stow = away ? queue.enqueue(held, away) : dropTarget(inv, held, feet).plan;
  if (!stow.ok) {
    return stow.reason;
  }
  const side: HandSide = inv.hands.right === held ? 'right' : 'left';
  const take = queue.enqueue(item, { kind: 'hand', side }, item.count, true);
  return take.ok ? undefined : take.reason;
};
