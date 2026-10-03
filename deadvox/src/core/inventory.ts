// What the player holds and wears, the piles on the ground, and what's in furniture.
// Moves are planned first (does it fit, how long does it take) and applied when the
// handling time is up (handling.ts). DESIGN.md, "Items and inventory" and "Hands".

import { BlockEntities, type BlockEntity } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import {
  cellCount,
  couldFit,
  defOf,
  findSpot,
  fitsAt,
  type GridSize,
  type GridState,
  type Item,
  ItemFactory,
  type ItemState,
  isEmpty,
  itemAt,
  type Placed,
  restoreItem,
  restorePlaced,
  snapshotItem,
  snapshotPlaced,
  stackRoom,
  weightOf,
} from './items.ts';
import type { Rolled } from './loot.ts';
import type { WearSlot } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';

/** Handling tunables in seconds (DESIGN.md, "Handling time"). */
export const HANDLING = {
  /** Added per cell of the item's size, taking it out and putting it in. */
  perCell: 0.05,
  /** Taking from or putting on the ground. */
  ground: 1.0,
  /** Putting on or taking off a worn item. */
  wear: 2.0,
} as const;

/** What one block of floor holds. */
export const PILE_GRID: GridSize = { w: 8, h: 6 };

export type HandSide = 'right' | 'left';

export interface Pile {
  /** Block position of the floor it lies on. */
  readonly pos: Vec3;
  items: Placed[];
}

export interface Spot {
  x: number;
  y: number;
  rotated: boolean;
}

/** Where an item is now. */
export type Location =
  | { kind: 'hand'; side: HandSide }
  | { kind: 'worn'; slot: WearSlot }
  | { kind: 'pocket'; owner: Item; pocket: number; placed: Placed }
  | { kind: 'pile'; pile: Pile; placed: Placed }
  | { kind: 'furniture'; entity: BlockEntity; pocket: number; placed: Placed };

/** Where to put an item. Without a spot, it joins a stack with room or takes the first free spot. */
export type TargetState =
  | { kind: 'hand'; side: HandSide }
  | { kind: 'worn' }
  | { kind: 'pocket'; ownerUid: number; pocket: number; at?: Spot }
  | { kind: 'pile'; pos: Vec3; at?: Spot }
  | { kind: 'furniture'; entityUid: number; pocket: number; at?: Spot };

export interface InventoryState {
  nextItemUid: number;
  hands: Partial<Record<HandSide, ItemState>>;
  worn: Partial<Record<WearSlot, ItemState>>;
  piles: { pos: Vec3; items: ReturnType<typeof snapshotPlaced>[] }[];
  looted: [string, number][];
  entities: ReturnType<BlockEntities['snapshotState']>;
}

export type Target =
  | { kind: 'hand'; side: HandSide }
  | { kind: 'worn' }
  | { kind: 'pocket'; owner: Item; pocket: number; at?: Spot }
  | { kind: 'pile'; pos: Vec3; at?: Spot }
  | { kind: 'furniture'; entity: BlockEntity; pocket: number; at?: Spot };

/** Where in the world an item lies, if it isn't on the player: a pile, or furniture. */
type Place = { kind: 'pile'; pile: Pile } | { kind: 'furniture'; entity: BlockEntity };

export type Plan = { ok: true; time: number; merge?: Item; at?: Spot } | { ok: false; reason: string };

const SIDES: readonly HandSide[] = ['right', 'left'];
const other = (side: HandSide): HandSide => (side === 'right' ? 'left' : 'right');
const pileKey = (pos: Vec3) => pos.join(',');
const refuse = (reason: string): Plan => ({ ok: false, reason });

export class Inventory {
  readonly registry: Registry;
  readonly factory: ItemFactory;
  readonly hands: Partial<Record<HandSide, Item>> = {};
  readonly worn: Partial<Record<WearSlot, Item>> = {};
  readonly piles = new Map<string, Pile>();
  /** What's been taken out of furniture, by item type: the death screen's looting summary. */
  readonly looted = new Map<string, number>();
  readonly entities: BlockEntities;
  /** Goes up on every change, so views know when to redraw. */
  version = 0;
  /** Whether a pile's block is within reach; the game sets it from the player's position. */
  canReach: (pos: Vec3) => boolean = () => true;
  /** Whether a piece of furniture is within reach. */
  canReachEntity: (entity: BlockEntity) => boolean = () => true;

  /** A deep plain-data copy of carried, worn, piled and furnished items and allocators. */
  snapshotState(): Readonly<InventoryState> {
    return freezeSnapshot({
      nextItemUid: this.factory.next,
      hands: Object.fromEntries(Object.entries(this.hands).map(([side, item]) => [side, snapshotItem(item!)])),
      worn: Object.fromEntries(Object.entries(this.worn).map(([slot, item]) => [slot, snapshotItem(item!)])),
      piles: [...this.piles.values()].map((pile) => ({ pos: [...pile.pos], items: pile.items.map(snapshotPlaced) })),
      looted: [...this.looted.entries()].map(([type, count]) => [type, count]),
      entities: this.entities.snapshotState(),
    });
  }

  static restoreState(registry: Registry, state: InventoryState, entities?: BlockEntities): Inventory {
    if (!Number.isSafeInteger(state.nextItemUid) || state.nextItemUid < 1) {
      throw new Error('Invalid next item id');
    }
    const restoredEntities = entities ?? BlockEntities.restoreState(registry, state.entities);
    if (entities) {
      entities.restoreState(state.entities);
    }
    const inventory = new Inventory(registry, new ItemFactory(state.nextItemUid), restoredEntities);
    for (const [side, item] of Object.entries(state.hands)) {
      if (item) {
        inventory.hands[side as HandSide] = restoreItem(registry, item);
      }
    }
    for (const [slot, item] of Object.entries(state.worn)) {
      if (item) {
        inventory.worn[slot as WearSlot] = restoreItem(registry, item);
      }
    }
    for (const pile of state.piles) {
      inventory.piles.set(pile.pos.join(','), {
        pos: [...pile.pos],
        items: pile.items.map((placed) => restorePlaced(registry, placed)),
      });
    }
    for (const [type, count] of state.looted) {
      inventory.looted.set(type, count);
    }
    const seen = new Set<number>();
    let maxUid = 0;
    const visit = (item: Item) => {
      if (!Number.isSafeInteger(item.uid) || item.uid < 1 || seen.has(item.uid)) {
        throw new Error(`Invalid or duplicate item id ${item.uid}`);
      }
      seen.add(item.uid);
      maxUid = Math.max(maxUid, item.uid);
      for (const placed of (item.pockets ?? []).flat()) {
        visit(placed.item);
      }
    };
    for (const root of inventory.roots()) {
      visit(root);
    }
    if (state.nextItemUid <= maxUid) {
      throw new Error('Next item id does not exceed saved item ids');
    }
    return inventory;
  }

  constructor(registry: Registry, factory = new ItemFactory(), entities = new BlockEntities(registry)) {
    this.registry = registry;
    this.factory = factory;
    this.entities = entities;
  }

  /**
   * Adds a piece of furniture with the items worldgen rolled for it, filling its
   * pockets in order; what doesn't fit is left out. Returns undefined if it's
   * already there.
   */
  furnish(spec: Parameters<BlockEntities['add']>[0], loot: readonly Rolled[] = []): BlockEntity | undefined {
    const entity = this.entities.add(spec);
    if (!entity) {
      return undefined;
    }
    for (const { type, count, condition } of loot) {
      const item = this.create(type, count, condition);
      (entity.pockets ?? []).some((_, pocket) => this.add(item, { kind: 'furniture', entity, pocket }));
    }
    return entity;
  }

  itemByUid(uid: number): Item | undefined {
    const visit = (item: Item): Item | undefined => {
      if (item.uid === uid) {
        return item;
      }
      for (const placed of (item.pockets ?? []).flat()) {
        const found = visit(placed.item);
        if (found) {
          return found;
        }
      }
      return undefined;
    };
    for (const root of this.roots()) {
      const found = visit(root);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  targetState(target: Target): TargetState {
    switch (target.kind) {
      case 'hand':
        return { ...target };
      case 'worn':
        return { kind: 'worn' };
      case 'pocket':
        return {
          kind: 'pocket',
          ownerUid: target.owner.uid,
          pocket: target.pocket,
          ...(target.at ? { at: { ...target.at } } : {}),
        };
      case 'pile':
        return { kind: 'pile', pos: [...target.pos], ...(target.at ? { at: { ...target.at } } : {}) };
      case 'furniture':
        return {
          kind: 'furniture',
          entityUid: target.entity.uid,
          pocket: target.pocket,
          ...(target.at ? { at: { ...target.at } } : {}),
        };
      default:
        throw new Error(`Unknown target kind ${String((target as { kind: string }).kind)}`);
    }
  }

  resolveTarget(state: TargetState): Target | undefined {
    switch (state.kind) {
      case 'hand':
        return { ...state };
      case 'worn':
        return { kind: 'worn' };
      case 'pocket': {
        const owner = this.itemByUid(state.ownerUid);
        return owner
          ? { kind: 'pocket', owner, pocket: state.pocket, ...(state.at ? { at: { ...state.at } } : {}) }
          : undefined;
      }
      case 'pile':
        return { kind: 'pile', pos: [...state.pos], ...(state.at ? { at: { ...state.at } } : {}) };
      case 'furniture': {
        const entity = this.entities.byUid(state.entityUid);
        return entity
          ? { kind: 'furniture', entity, pocket: state.pocket, ...(state.at ? { at: { ...state.at } } : {}) }
          : undefined;
      }
      default:
        throw new Error(`Unknown target kind ${String((state as { kind: string }).kind)}`);
    }
  }

  create(type: string, count = 1, condition = 1): Item {
    return this.factory.create(this.registry, type, count, condition);
  }

  name(item: Item): string {
    return defOf(this.registry, item.type).name;
  }

  pileAt(pos: Vec3): Pile | undefined {
    return this.piles.get(pileKey(pos));
  }

  /** The grid of a pocket, from the owner's type. */
  pocketGrid(owner: Item, pocket: number): GridSize {
    const spec = defOf(this.registry, owner.type).container?.pockets[pocket];
    if (!spec) {
      throw new Error(`${owner.type} has no pocket ${pocket}`);
    }
    return { w: spec.grid[0], h: spec.grid[1] };
  }

  pocketHandling(owner: Item, pocket: number): number {
    return defOf(this.registry, owner.type).container?.pockets[pocket]?.handling ?? 0;
  }

  /** Where an item is, searching hands, worn items, piles and every pocket inside them. */
  locate(item: Item): Location | undefined {
    for (const side of SIDES) {
      if (this.hands[side] === item) {
        return { kind: 'hand', side };
      }
    }
    for (const [slot, worn] of Object.entries(this.worn) as [WearSlot, Item][]) {
      if (worn === item) {
        return { kind: 'worn', slot };
      }
    }
    for (const pile of this.piles.values()) {
      const placed = pile.items.find((p) => p.item === item);
      if (placed) {
        return { kind: 'pile', pile, placed };
      }
    }
    const inFurniture = this.inFurniture(item);
    if (inFurniture) {
      return inFurniture;
    }
    for (const root of this.roots()) {
      const found = this.searchPockets(root, item);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  /** Items held or worn, top level only. */
  carried(): Item[] {
    return [...SIDES.map((s) => this.hands[s]), ...Object.values(this.worn)].filter((i): i is Item => i !== undefined);
  }

  /** Grams held and worn, with everything inside. */
  carriedWeight(): number {
    return this.carried().reduce((sum, item) => sum + weightOf(this.registry, item), 0);
  }

  /** Checks a move and works out its handling time, without changing anything. */
  plan(item: Item, target: Target, count = item.count): Plan {
    const from = this.locate(item);
    if (!from) {
      return refuse("It isn't there any more");
    }
    if (!Number.isInteger(count) || count < 1 || count > item.count) {
      return refuse(`Can't move ${count} of ${item.count}`);
    }
    const source = this.placeOf(from);
    const destination = this.targetPlace(target);
    if (!(this.reachable(source) && this.reachable(destination))) {
      return refuse('Too far away');
    }
    if (!(this.searched(source) && this.searched(destination))) {
      return refuse('Search it first');
    }
    const placement = this.placement(item, target, count, from);
    if (!placement.ok) {
      return placement;
    }
    return { ...placement, time: this.handlingTime(item, from, target) };
  }

  /** Makes a move now if it's possible. Returns the plan it followed, or why not. */
  move(item: Item, target: Target, count = item.count): Plan {
    const plan = this.plan(item, target, count);
    if (!plan.ok) {
      return plan;
    }
    const from = this.locate(item)!;
    if (from.kind === 'furniture' && target.kind !== 'furniture') {
      this.looted.set(item.type, (this.looted.get(item.type) ?? 0) + count);
    }
    let moving = item;
    if (count < item.count) {
      moving = this.factory.split(item, count);
    } else {
      this.remove(from);
    }
    this.version += 1;
    if (plan.merge) {
      plan.merge.count += moving.count;
      return plan;
    }
    this.put(moving, target, plan.at);
    return plan;
  }

  /** Places a new item that isn't anywhere yet (spawning, loot). Returns false when it doesn't fit. */
  add(item: Item, target: Target): boolean {
    const placement = (() => {
      switch (target.kind) {
        case 'hand':
          return this.hands[target.side] ? refuse('full') : { ok: true as const, time: 0 };
        case 'worn': {
          const slot = defOf(this.registry, item.type).wearable?.slot;
          return slot && !this.worn[slot] ? { ok: true as const, time: 0 } : refuse('full');
        }
        default:
          return this.gridPlacement(item, item.count, this.gridOf(target), target);
      }
    })();
    if (!placement.ok) {
      return false;
    }
    this.version += 1;
    if (placement.merge) {
      placement.merge.count += item.count;
    } else {
      this.put(item, target, placement.at);
    }
    return true;
  }

  /** The pile or furniture an item is in, directly or inside a bag lying there; undefined if it's on you. */
  placeOf(location: Location): Place | undefined {
    switch (location.kind) {
      case 'pile':
        return { kind: 'pile', pile: location.pile };
      case 'furniture':
        return { kind: 'furniture', entity: location.entity };
      case 'pocket': {
        const owner = this.locate(location.owner);
        return owner ? this.placeOf(owner) : undefined;
      }
      default:
        return undefined;
    }
  }

  /** Seconds to take an item out of where it is and put it where it's going. */
  handlingTime(item: Item, from: Location, target: Target): number {
    const cells = cellCount(defOf(this.registry, item.type));
    const perCell = HANDLING.perCell * cells;
    const out = (() => {
      switch (from.kind) {
        case 'hand':
          return 0;
        case 'worn':
          return HANDLING.wear;
        case 'pocket':
          return this.pocketHandling(from.owner, from.pocket) + perCell;
        case 'furniture':
          return this.furnitureHandling(from.entity, from.pocket) + perCell;
        default:
          return HANDLING.ground + perCell;
      }
    })();
    const into = (() => {
      switch (target.kind) {
        case 'hand':
          return 0;
        case 'worn':
          return HANDLING.wear;
        case 'pocket':
          return this.pocketHandling(target.owner, target.pocket) + perCell;
        case 'furniture':
          return this.furnitureHandling(target.entity, target.pocket) + perCell;
        default:
          return HANDLING.ground + perCell;
      }
    })();
    return out + into;
  }

  furnitureHandling(entity: BlockEntity, pocket: number): number {
    return this.entities.defOf(entity).container?.pockets[pocket]?.handling ?? 0;
  }

  // ---- internals ----

  /** An item lying directly in a piece of furniture. */
  private inFurniture(item: Item): Location | undefined {
    for (const entity of this.entities.all) {
      for (const [pocket, grid] of (entity.pockets ?? []).entries()) {
        const placed = grid.find((p) => p.item === item);
        if (placed) {
          return { kind: 'furniture', entity, pocket, placed };
        }
      }
    }
    return undefined;
  }

  /** Where a move would put the item, if not on the player. A pile that doesn't exist yet counts by its position. */
  private targetPlace(target: Target): Place | undefined {
    switch (target.kind) {
      case 'pile':
        return { kind: 'pile', pile: this.pileAt(target.pos) ?? { pos: target.pos, items: [] } };
      case 'furniture':
        return { kind: 'furniture', entity: target.entity };
      case 'pocket': {
        const owner = this.locate(target.owner);
        return owner ? this.placeOf(owner) : undefined;
      }
      default:
        return undefined;
    }
  }

  private reachable(place: Place | undefined): boolean {
    if (!place) {
      return true;
    }
    return place.kind === 'pile' ? this.canReach(place.pile.pos) : this.canReachEntity(place.entity);
  }

  private searched(place: Place | undefined): boolean {
    return place?.kind !== 'furniture' || place.entity.searched;
  }

  private *roots(): IterableIterator<Item> {
    // UID resolution is also used for held lights every frame; do not collect the whole world first.
    yield* this.carried();
    for (const pile of this.piles.values()) {
      for (const placed of pile.items) {
        yield placed.item;
      }
    }
    for (const entity of this.entities.all) {
      for (const pocket of entity.pockets ?? []) {
        for (const placed of pocket) {
          yield placed.item;
        }
      }
    }
  }

  private searchPockets(owner: Item, item: Item): Location | undefined {
    for (const [pocket, grid] of (owner.pockets ?? []).entries()) {
      for (const placed of grid) {
        if (placed.item === item) {
          return { kind: 'pocket', owner, pocket, placed };
        }
        const deeper = this.searchPockets(placed.item, item);
        if (deeper) {
          return deeper;
        }
      }
    }
    return undefined;
  }

  private placement(item: Item, target: Target, count: number, from: Location): Plan {
    const def = defOf(this.registry, item.type);
    switch (target.kind) {
      case 'hand':
        return this.handPlacement(item, target.side, from);
      case 'worn': {
        const slot = def.wearable?.slot;
        if (!slot) {
          return refuse("You can't wear that");
        }
        const current = this.worn[slot];
        if (current === item) {
          return refuse("You're already wearing it");
        }
        return current
          ? refuse(`You're already wearing the ${this.name(current).toLowerCase()} there`)
          : { ok: true, time: 0 };
      }
      case 'pocket': {
        if (target.owner === item) {
          return refuse("It can't go inside itself");
        }
        if (!this.locate(target.owner)) {
          return refuse("You can't reach that");
        }
        return this.gridPlacement(item, count, this.gridOf(target), target);
      }
      default:
        return this.gridPlacement(item, count, this.gridOf(target), target);
    }
  }

  private handPlacement(item: Item, side: HandSide, from: Location): Plan {
    if (from.kind === 'hand' && from.side === side) {
      return refuse("It's already in that hand");
    }
    const held = this.hands[side];
    if (held && held !== item) {
      return refuse(`Your ${side} hand is holding the ${this.name(held).toLowerCase()}`);
    }
    const otherHeld = this.hands[other(side)];
    const busy = otherHeld && otherHeld !== item;
    if (busy && defOf(this.registry, otherHeld.type).twoHanded) {
      return refuse(`The ${this.name(otherHeld).toLowerCase()} needs both hands`);
    }
    if (busy && defOf(this.registry, item.type).twoHanded) {
      return refuse('It needs both hands');
    }
    return { ok: true, time: 0 };
  }

  /** The grid a pocket, pile or furniture target points at. */
  private gridOf(target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>): GridState {
    switch (target.kind) {
      case 'pocket':
        return {
          size: this.pocketGrid(target.owner, target.pocket),
          placed: target.owner.pockets?.[target.pocket] ?? [],
        };
      case 'furniture': {
        const spec = this.entities.defOf(target.entity).container?.pockets[target.pocket];
        if (!spec) {
          throw new Error(`${target.entity.type} has no pocket ${target.pocket}`);
        }
        return { size: { w: spec.grid[0], h: spec.grid[1] }, placed: target.entity.pockets?.[target.pocket] ?? [] };
      }
      default:
        return { size: PILE_GRID, placed: this.pileAt(target.pos)?.items ?? [] };
    }
  }

  private gridPlacement(
    item: Item,
    count: number,
    grid: GridState,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
  ): Plan {
    const { at } = target;
    if (target.kind !== 'pile' && !isEmpty(item)) {
      return refuse('Only empty bags go inside other containers');
    }
    if (!couldFit(this.registry, grid.size, item)) {
      return refuse('Too big for it');
    }
    const joins = (p: Placed | undefined) => p !== undefined && stackRoom(this.registry, p.item, item) >= count;
    // Moving a whole item within its grid frees its own cells; moving part of a stack doesn't.
    const ignore = count === item.count ? item : undefined;
    if (at) {
      const under = itemAt(this.registry, grid.placed, at.x, at.y);
      if (under && joins(under)) {
        return { ok: true, time: 0, merge: under.item };
      }
      return fitsAt(this.registry, grid, item, { ...at, ignore }) ? { ok: true, time: 0, at } : refuse('No room there');
    }
    const stack = grid.placed.find(joins);
    if (stack) {
      return { ok: true, time: 0, merge: stack.item };
    }
    const spot = findSpot(this.registry, grid, item, ignore);
    return spot ? { ok: true, time: 0, at: spot } : refuse('No room');
  }

  /** Uses up `count` of an item wherever it is: eaten, burnt, loaded into something. */
  consume(item: Item, count = 1): boolean {
    const at = this.locate(item);
    if (!at || count > item.count) {
      return false;
    }
    if (count < item.count) {
      item.count -= count;
    } else {
      this.remove(at);
    }
    this.version += 1;
    return true;
  }

  private remove(from: Location): void {
    switch (from.kind) {
      case 'hand':
        delete this.hands[from.side];
        return;
      case 'worn':
        delete this.worn[from.slot];
        return;
      case 'pocket': {
        const grid = from.owner.pockets![from.pocket]!;
        grid.splice(grid.indexOf(from.placed), 1);
        return;
      }
      case 'furniture': {
        const grid = from.entity.pockets![from.pocket]!;
        grid.splice(grid.indexOf(from.placed), 1);
        return;
      }
      default:
        from.pile.items.splice(from.pile.items.indexOf(from.placed), 1);
        if (from.pile.items.length === 0) {
          this.piles.delete(pileKey(from.pile.pos));
        }
    }
  }

  private put(item: Item, target: Target, at?: Spot): void {
    const spot = at ?? { x: 0, y: 0, rotated: false };
    switch (target.kind) {
      case 'hand':
        this.hands[target.side] = item;
        return;
      case 'worn':
        this.worn[defOf(this.registry, item.type).wearable!.slot] = item;
        return;
      case 'pocket':
        target.owner.pockets![target.pocket]!.push({ item, ...spot });
        return;
      case 'furniture':
        target.entity.pockets![target.pocket]!.push({ item, ...spot });
        return;
      default: {
        const key = pileKey(target.pos);
        const pile = this.piles.get(key) ?? { pos: [...target.pos], items: [] };
        pile.items.push({ item, ...spot });
        this.piles.set(key, pile);
      }
    }
  }
}

/** Where an item lies in a grid, if it's in one. */
export const spotOf = (at: Location): Spot | undefined =>
  at.kind === 'hand' || at.kind === 'worn' ? undefined : { x: at.placed.x, y: at.placed.y, rotated: at.placed.rotated };

/** A target in the same grid as a location, at a spot: for turning an item where it lies. */
export const sameGrid = (at: Location, spot: Spot | undefined): Target | undefined => {
  if (!spot) {
    return undefined;
  }
  switch (at.kind) {
    case 'pocket':
      return { kind: 'pocket', owner: at.owner, pocket: at.pocket, at: spot };
    case 'pile':
      return { kind: 'pile', pos: at.pile.pos, at: spot };
    case 'furniture':
      return { kind: 'furniture', entity: at.entity, pocket: at.pocket, at: spot };
    default:
      return undefined;
  }
};

/** A short description of a target, for the action queue. */
export const describeTarget = (inventory: Inventory, target: Target): string => {
  switch (target.kind) {
    case 'hand':
      return `${target.side} hand`;
    case 'worn':
      return 'wear it';
    case 'pocket': {
      const pocket = defOf(inventory.registry, target.owner.type).container?.pockets[target.pocket];
      const name = inventory.name(target.owner);
      return pocket?.name ? `${name} · ${pocket.name}` : name;
    }
    case 'furniture':
      return inventory.entities.defOf(target.entity).name.toLowerCase();
    default:
      return 'the floor';
  }
};
