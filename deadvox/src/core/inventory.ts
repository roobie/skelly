// What the player holds and wears, the piles on the ground, and what's in furniture.
// Moves are planned first (does it fit, how long does it take) and applied when the
// handling time is up (handling.ts). DESIGN.md, "Items and inventory" and "Hands".

import { BlockEntities, type BlockEntity } from './blockEntities.ts';
import { DEFAULT_HANDED_CHARACTER, dominantSide, type HandedCharacter } from './character.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { CraftPlan } from './crafting.ts';
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
  type PlacedState,
  restoreItem,
  restorePlaced,
  snapshotItem,
  snapshotPlaced,
  stackRoom,
  weightOf,
} from './items.ts';
import { itemIds, itemRoots, savedItemTree, type TreeLocation, walkItemTree } from './itemTree.ts';
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
export const WORK_IN_PROGRESS = 'work_in_progress';

/** Ordinary dropping and craft retirement share the same bounded neighborhood. */
export const dropSpots = (feet: Vec3): Vec3[] => [
  feet,
  [feet[0] + 1, feet[1], feet[2]],
  [feet[0] - 1, feet[1], feet[2]],
  [feet[0], feet[1], feet[2] + 1],
  [feet[0], feet[1], feet[2] - 1],
];

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
export type Location = TreeLocation<Item, Pile, BlockEntity>;

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

export const SIDES: readonly HandSide[] = ['right', 'left'];
const other = (side: HandSide): HandSide => (side === 'right' ? 'left' : 'right');
const pileKey = (pos: Vec3) => pos.join(',');
const refuse = (reason: string): Plan => ({ ok: false, reason });

export class Inventory {
  readonly registry: Registry;
  readonly character: HandedCharacter;
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

  static restoreState(
    registry: Registry,
    state: InventoryState,
    entities?: BlockEntities,
    character: HandedCharacter = DEFAULT_HANDED_CHARACTER,
  ): Inventory {
    if (!Number.isSafeInteger(state.nextItemUid) || state.nextItemUid < 1) {
      throw new Error('Invalid next item id');
    }
    validateInventoryTree(registry, state);
    const restoredEntities = entities ?? BlockEntities.restoreState(registry, state.entities);
    if (entities) {
      entities.restoreState(state.entities);
    }
    const inventory = new Inventory(registry, new ItemFactory(state.nextItemUid), restoredEntities, character);
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
    return inventory;
  }

  constructor(
    registry: Registry,
    factory = new ItemFactory(),
    entities = new BlockEntities(registry),
    character: HandedCharacter = DEFAULT_HANDED_CHARACTER,
  ) {
    this.registry = registry;
    this.character = character;
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

  /** The sole live item-tree projection; callers hold UIDs, not ownership caches. */
  items() {
    const inventory = this;
    return walkItemTree(
      itemRoots<Item, Pile, BlockEntity>({
        hands: this.hands,
        worn: this.worn,
        get piles() {
          return inventory.piles.values();
        },
        get entities() {
          return inventory.entities.all;
        },
      }),
    );
  }

  itemByUid(uid: number): Item | undefined {
    for (const { item } of this.items()) {
      if (item.uid === uid) {
        return item;
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

  changeCondition(uid: number, delta: number): boolean {
    const item = this.itemByUid(uid);
    if (!(item && Number.isFinite(delta))) {
      return false;
    }
    const condition = Math.max(0, Math.min(1, item.condition + delta));
    if (condition !== item.condition) {
      item.condition = condition;
      this.version += 1;
    }
    return true;
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
    for (const entry of this.items()) {
      if (entry.item === item) {
        return entry.location;
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
    if (from.kind === 'work') {
      return refuse('Inputs are held by the work item');
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

  /** Read-only placement for a newly created, unlocated item (not a move admission). */
  planAdd(item: Item, target: Target): Plan {
    switch (target.kind) {
      case 'hand':
        return this.hands[target.side] ? refuse('full') : { ok: true, time: 0 };
      case 'worn': {
        const slot = defOf(this.registry, item.type).wearable?.slot;
        return slot && !this.worn[slot] ? { ok: true, time: 0 } : refuse('full');
      }
      default:
        return this.gridPlacement(item, item.count, this.gridOf(target), target);
    }
  }

  /** Places a new item that isn't anywhere yet (spawning, loot). Returns false when it doesn't fit. */
  add(item: Item, target: Target): boolean {
    const placement = this.planAdd(item, target);
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

  /** Escrow through the mutation owner; no duplicate trees in the other hand or job. */
  beginWork(plan: CraftPlan, repair?: { targetUid: number; amount: number }): Item | undefined {
    const recipe = this.registry.recipes.get(plan.recipe);
    if (this.hands.left || this.hands.right || !recipe || (recipe.kind === 'repair') !== (repair !== undefined)) {
      return undefined;
    }
    if (repair) {
      const target = this.itemByUid(repair.targetUid);
      if (
        !target ||
        plan.components.some(({ item }) => item.uid === target.uid) ||
        target.type !== recipe.result.item ||
        target.count !== 1 ||
        !Number.isFinite(repair.amount) ||
        repair.amount <= 0 ||
        repair.amount > 1
      ) {
        return undefined;
      }
    }
    const seen = new Set<number>();
    for (const { item, count } of plan.components) {
      if (
        seen.has(item.uid) ||
        this.itemByUid(item.uid) !== item ||
        !this.locate(item) ||
        !isEmpty(item) ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > item.count
      ) {
        return undefined;
      }
      seen.add(item.uid);
    }
    if (plan.tools.some((tool) => seen.has(tool.item.uid))) {
      return undefined;
    }
    const work = this.create(WORK_IN_PROGRESS);
    const components = plan.components.map(({ item, count }) => {
      const from = this.locate(item)!;
      if (from.kind === 'furniture') {
        this.looted.set(item.type, (this.looted.get(item.type) ?? 0) + count);
      }
      if (count < item.count) {
        return this.factory.split(item, count);
      }
      this.remove(from);
      return item;
    });
    work.work = {
      recipe: plan.recipe,
      elapsed: 0,
      duration: plan.gather + plan.work,
      components,
      ...(repair ? { repairTargetUid: repair.targetUid, repairAmount: repair.amount } : {}),
    };
    this.hands[dominantSide(this.character)] = work;
    this.version += 1;
    return work;
  }

  private workDrops(work: Item, outputs: readonly Item[], feet: Vec3): { item: Item; pos: Vec3; spot: Spot }[] {
    const drops: { item: Item; pos: Vec3; spot: Spot }[] = [];
    const grids = new Map<string, Placed[]>();
    for (const item of outputs) {
      let found = false;
      for (const pos of dropSpots(feet)) {
        const key = pileKey(pos);
        const placed =
          grids.get(key) ?? (this.pileAt(pos)?.items ?? []).filter(({ item: existing }) => existing !== work);
        grids.set(key, placed);
        const spot = findSpot(this.registry, { size: PILE_GRID, placed }, item);
        if (spot) {
          // Shadow occupancy reserves every output before transferring any of them.
          placed.push({ item, ...spot });
          drops.push({ item, pos, spot });
          found = true;
          break;
        }
      }
      if (!found) {
        throw new Error('No room nearby to put the inputs or result down');
      }
    }
    return drops;
  }

  private workOutputs(
    payload: NonNullable<Item['work']>,
    finish: boolean,
    recipeResult: { item: string; count: number },
  ): Item[] {
    if (payload.repairTargetUid !== undefined) {
      return finish ? [] : payload.components;
    }
    return finish ? [this.create(recipeResult.item, recipeResult.count)] : payload.components;
  }

  /** Terminal ownership transfer. Exact input UIDs never merge on cancellation. */
  releaseWork(work: Item, finish: boolean, feet: Vec3): void {
    const payload = work.work;
    const at = this.locate(work);
    if (!(payload && at)) {
      return;
    }
    const recipe = this.registry.recipes.get(payload.recipe)!;
    const repairing = payload.repairTargetUid !== undefined;
    const target = repairing ? this.itemByUid(payload.repairTargetUid!) : undefined;
    if (finish && repairing && (!target || payload.repairAmount === undefined)) {
      throw new Error('The repair target is missing');
    }
    const outputs = this.workOutputs(payload, finish, recipe.result);
    const resultInHand = finish && !repairing && at.kind === 'hand';
    if (!resultInHand && outputs.some((item) => !couldFit(this.registry, PILE_GRID, item))) {
      throw new Error('An input or result is too large to put down');
    }
    const drops = resultInHand ? [] : this.workDrops(work, outputs, feet);
    this.remove(at);
    work.work = undefined;
    if (finish && target && payload.repairAmount !== undefined) {
      target.condition = Math.min(1, target.condition + payload.repairAmount);
    }
    this.version += 1;
    if (resultInHand && at.kind === 'hand') {
      this.put(outputs[0]!, { kind: 'hand', side: at.side });
      return;
    }
    for (const { item, pos, spot } of drops) {
      this.put(item, { kind: 'pile', pos }, spot);
    }
  }

  /** The pile or furniture an item is in, directly or inside a bag lying there; undefined if it's on you. */
  placeOf(location: Location): Place | undefined {
    switch (location.kind) {
      case 'pile':
        return { kind: 'pile', pile: location.pile };
      case 'furniture':
        return { kind: 'furniture', entity: location.entity };
      case 'work':
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
    if (item.work && side !== dominantSide(this.character)) {
      return refuse('Work stays in the dominant hand');
    }
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
    if (!at || item.work || at.kind === 'work' || count > item.count) {
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
      case 'work':
        throw new Error('Craft inputs are owned by the work item');
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

/** Reject registry-invalid topology before constructing or exposing a live inventory. */
const validateRepairTargets = (registry: Registry, tree: readonly { item: ItemState }[]): void => {
  const byUid = new Map(tree.map(({ item }) => [item.uid, item]));
  for (const { item } of tree) {
    const { work } = item;
    const targetUid = work?.repairTargetUid;
    if (!work || targetUid === undefined) {
      continue;
    }
    const recipe = registry.recipes.get(work.recipe);
    const target = byUid.get(targetUid);
    if (
      recipe?.kind !== 'repair' ||
      !target ||
      target.uid === item.uid ||
      target.type !== recipe.result.item ||
      target.count !== 1
    ) {
      throw new Error('Missing or invalid repair target');
    }
  }
};

const validateInventoryTree = (registry: Registry, state: InventoryState): void => {
  const tree = [...savedItemTree(state)];
  itemIds(tree, state.nextItemUid);
  validateRepairTargets(registry, tree);
  const grid = (placed: readonly PlacedState[], size: GridSize) => {
    const previous: Placed[] = [];
    for (const entry of placed) {
      if (!fitsAt(registry, { size, placed: previous }, entry.item, entry)) {
        throw new Error('Invalid item placement');
      }
      previous.push(entry);
    }
  };
  const pockets = (
    type: string,
    saved: PlacedState[][] | undefined,
    specs: { grid: [number, number] }[] | undefined,
  ) => {
    if (!specs) {
      if (saved !== undefined) {
        throw new Error(`${type} has no container`);
      }
      return;
    }
    if (saved?.length !== specs.length) {
      throw new Error(`${type} must have ${specs.length} pocket grids`);
    }
    for (const [index, spec] of specs.entries()) {
      grid(saved[index]!, { w: spec.grid[0], h: spec.grid[1] });
    }
  };
  for (const { item } of tree) {
    pockets(item.type, item.pockets, defOf(registry, item.type).container?.pockets);
    if (item.type === WORK_IN_PROGRESS && !item.work) {
      throw new Error('Missing craft work payload');
    }
    if (item.work) {
      validateWorkItem(registry, item);
    }
  }
  for (const pile of state.piles) {
    grid(pile.items, PILE_GRID);
  }
  for (const entity of state.entities.entities) {
    const def = registry.furniture.get(entity.type);
    if (!def) {
      throw new Error(`Unknown furniture ${entity.type}`);
    }
    pockets(entity.type, entity.pockets, def.container?.pockets);
  }
};

export const validateWorkItem = (registry: Registry, item: ItemState): void => {
  const work = item.work!;
  const recipe = registry.recipes.get(work.recipe);
  if (
    item.type !== WORK_IN_PROGRESS ||
    item.count !== 1 ||
    !recipe ||
    !Number.isFinite(work.elapsed) ||
    !Number.isFinite(work.duration) ||
    work.elapsed < 0 ||
    work.duration < recipe.time * 60 ||
    work.elapsed > work.duration ||
    (recipe.kind === 'repair') !== (work.repairTargetUid !== undefined && work.repairAmount !== undefined) ||
    (work.repairTargetUid !== undefined && (!Number.isSafeInteger(work.repairTargetUid) || work.repairTargetUid < 1)) ||
    (work.repairAmount !== undefined &&
      (!Number.isFinite(work.repairAmount) || work.repairAmount <= 0 || work.repairAmount > 1)) ||
    work.components.some((component) => component.work || (component.pockets ?? []).some((grid) => grid.length))
  ) {
    throw new Error('Invalid craft work payload');
  }
  const actual = new Map<string, number>();
  for (const component of work.components) {
    actual.set(component.type, (actual.get(component.type) ?? 0) + component.count);
  }
  const matches = (group: number, remaining: Map<string, number>): boolean => {
    if (group === recipe.components.length) {
      return [...remaining.values()].every((count) => count === 0);
    }
    return recipe.components[group]!.some((alternative) => {
      const available = remaining.get(alternative.item) ?? 0;
      if (available < alternative.count) {
        return false;
      }
      const next = new Map(remaining);
      next.set(alternative.item, available - alternative.count);
      return matches(group + 1, next);
    });
  };
  if (!matches(0, actual)) {
    throw new Error('Craft inputs do not match recipe');
  }
};

/** Where an item lies in a grid, if it's in one. */
export const spotOf = (at: Location): Spot | undefined =>
  at.kind === 'hand' || at.kind === 'worn' || at.kind === 'work'
    ? undefined
    : { x: at.placed.x, y: at.placed.y, rotated: at.placed.rotated };

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
