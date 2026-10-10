// What the player holds and wears, the piles on the ground, and what's in furniture.
// Moves are planned first (does it fit, how long does it take) and applied when the
// handling time is up (handling.ts). DESIGN.md, "Items and inventory" and "Hands".

import { BlockEntities, type BlockEntity } from './blockEntities.ts';
import {
  DEFAULT_HANDED_CHARACTER,
  dominantSide,
  type HandedCharacter,
  SKILL_LEVEL_LEGENDARY,
  SKILL_LEVEL_MIN,
  skillEffectLevel,
  skillSaturation,
} from './character.ts';
import type { ItemDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { WorkPlan } from './crafting.ts';
import {
  disassemblyOutputs,
  SALVAGE_DURATION,
  sameDisassemblyOutputs,
  validDisassemblyToolLevels,
} from './disassembly.ts';
import { firearmSlotIds, isLongGun, slingFitted } from './firearmFitting.ts';
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
import { magazineWellCalibre, slotsReason } from './magazine.ts';
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

const inventoryHandlingFactor = (registry: Registry, character: HandedCharacter): number => {
  const tuning = registry.skills.get('inventory_management')?.inventory;
  if (!tuning) {
    return 1;
  }
  const level = skillEffectLevel(character.skills?.inventory_management ?? SKILL_LEVEL_MIN);
  return skillSaturation(level, tuning.handlingFactorFloor, tuning.handlingFactorHalfLifeLevels);
};

/** The worn slot an item goes in: clothing's own slot, or the shoulder for a long gun (DESIGN.md, "Shoulder and sling"). */
export const wornSlotOf = (registry: Registry, item: Item): WearSlot | undefined => {
  const def = defOf(registry, item.type);
  return def.wearable?.slot ?? (isLongGun(def) ? 'shoulder' : undefined);
};

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
  quickbarOrigins: [number, TargetState][];
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
const validSpot = (spot: unknown): boolean =>
  spot !== null &&
  typeof spot === 'object' &&
  Number.isSafeInteger((spot as Spot).x) &&
  (spot as Spot).x >= 0 &&
  Number.isSafeInteger((spot as Spot).y) &&
  (spot as Spot).y >= 0 &&
  typeof (spot as Spot).rotated === 'boolean';
const validQuickbarOrigin = (target: TargetState): boolean => {
  const value = target as unknown as Record<string, unknown>;
  switch (value.kind) {
    case 'hand':
      return value.side === 'right' || value.side === 'left';
    case 'worn':
      return true;
    case 'pocket':
      return (
        Number.isSafeInteger(value.ownerUid) &&
        (value.ownerUid as number) > 0 &&
        Number.isSafeInteger(value.pocket) &&
        (value.pocket as number) >= 0 &&
        (value.at === undefined || validSpot(value.at))
      );
    case 'pile':
      return (
        Array.isArray(value.pos) &&
        value.pos.length === 3 &&
        value.pos.every((part) => typeof part === 'number' && Number.isFinite(part)) &&
        (value.at === undefined || validSpot(value.at))
      );
    case 'furniture':
      return (
        Number.isSafeInteger(value.entityUid) &&
        (value.entityUid as number) > 0 &&
        Number.isSafeInteger(value.pocket) &&
        (value.pocket as number) >= 0 &&
        (value.at === undefined || validSpot(value.at))
      );
    default:
      return false;
  }
};

export class Inventory {
  readonly registry: Registry;
  readonly character: HandedCharacter;
  readonly factory: ItemFactory;
  readonly hands: Partial<Record<HandSide, Item>> = {};
  readonly worn: Partial<Record<WearSlot, Item>> = {};
  readonly piles = new Map<string, Pile>();
  /** What's been taken out of furniture, by item type: the death screen's looting summary. */
  readonly looted = new Map<string, number>();
  private readonly quickbarOrigins = new Map<number, TargetState>();
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
      quickbarOrigins: [...this.quickbarOrigins.entries()].map(([uid, target]) => [uid, structuredClone(target)]),
      entities: this.entities.snapshotState(),
    });
  }

  private restoreQuickbarOrigins(origins: InventoryState['quickbarOrigins']): void {
    for (const [uid, target] of origins) {
      if (![this.hands.right, this.hands.left].some((item) => item?.uid === uid)) {
        throw new Error(`Missing held item for quickbar origin ${uid}`);
      }
      if (this.quickbarOrigins.has(uid) || !validQuickbarOrigin(target)) {
        throw new Error(`Invalid quickbar origin ${uid}`);
      }
      this.quickbarOrigins.set(uid, structuredClone(target));
    }
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
    inventory.restoreQuickbarOrigins(state.quickbarOrigins);
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
  furnish(
    spec: Parameters<BlockEntities['add']>[0],
    loot: readonly Rolled[] = [],
    surfaceLoot: readonly Rolled[] = [],
  ): BlockEntity | undefined {
    const entity = this.entities.add(spec);
    if (!entity) {
      return undefined;
    }
    for (const rolled of loot) {
      const item = this.createRolled(rolled);
      (entity.pockets ?? []).some((_, pocket) => this.add(item, { kind: 'furniture', entity, pocket }));
    }
    if (surfaceLoot.length > 0) {
      const pos: Vec3 = [
        entity.pos[0] + Math.floor(entity.size[0] / 2),
        entity.pos[1] + entity.size[1],
        entity.pos[2] + Math.floor(entity.size[2] / 2),
      ];
      for (const rolled of surfaceLoot) {
        if (!this.add(this.createRolled(rolled), { kind: 'pile', pos })) {
          throw new Error(`fixed surface item "${rolled.type}" does not fit on its furniture`);
        }
      }
    }
    return entity;
  }

  private createRolled({ type, count, condition, fitted }: Rolled): Item {
    const item = this.create(type, count, condition);
    for (const [slot, child] of Object.entries(fitted ?? {})) {
      this.fitSlot(item, slot, this.create(child));
    }
    return item;
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

  quickbarOrigin(item: Item): TargetState | undefined {
    const target = this.quickbarOrigins.get(item.uid);
    return target === undefined ? undefined : structuredClone(target);
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

  targetForLocation(location: Location): Target {
    switch (location.kind) {
      case 'hand':
        return { kind: 'hand', side: location.side };
      case 'worn':
        return { kind: 'worn' };
      case 'pocket':
        return {
          kind: 'pocket',
          owner: location.owner,
          pocket: location.pocket,
          at: { x: location.placed.x, y: location.placed.y, rotated: location.placed.rotated },
        };
      case 'pile':
        return {
          kind: 'pile',
          pos: [...location.pile.pos],
          at: { x: location.placed.x, y: location.placed.y, rotated: location.placed.rotated },
        };
      case 'furniture':
        return {
          kind: 'furniture',
          entity: location.entity,
          pocket: location.pocket,
          at: { x: location.placed.x, y: location.placed.y, rotated: location.placed.rotated },
        };
      case 'work':
        throw new Error('Work inputs have no independent target');
      case 'slot':
        throw new Error('A fitted item has no independent target');
      default:
        throw new Error(`Unknown location kind ${String((location as { kind: string }).kind)}`);
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

  /** Fills or empties an owner's slot with a loose, certified item; returns the item displaced. */
  fitSlot(owner: Item, slot: string, item: Item | undefined): Item | undefined {
    const { slots } = owner;
    const ownerDef = defOf(this.registry, owner.type);
    const knownSlot =
      (slot === 'magazine' && magazineWellCalibre(this.registry, owner.type) !== undefined) ||
      (slot === 'battery' && ownerDef.light?.power !== undefined) ||
      firearmSlotIds(this.registry, ownerDef).includes(slot);
    if (!(slots && knownSlot) || (item && this.locate(item))) {
      throw new Error('Only a loose item fits a known slot');
    }
    const previous = slots[slot];
    if (item) {
      slots[slot] = item;
    } else {
      delete slots[slot];
    }
    const reason = slotsReason(this.registry, owner.type, slots);
    if (reason) {
      if (previous) {
        slots[slot] = previous;
      } else {
        delete slots[slot];
      }
      throw new Error(reason);
    }
    this.version += 1;
    return previous;
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
    return defOf(this.registry, owner.type).container?.pockets[pocket]?.handlingSimSeconds ?? 0;
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
    if (from.kind === 'slot') {
      return refuse('It is fitted to the firearm');
    }
    if (!Number.isInteger(count) || count < 1 || count > item.count) {
      return refuse(`Can't move ${count} of ${item.count}`);
    }
    const { light } = defOf(this.registry, item.type);
    if (item.on && light?.burning?.stow === 'refuse' && target.kind !== 'hand' && target.kind !== 'pile') {
      return refuse('Put it out before stowing it');
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
    const origin =
      from.kind === 'hand' ? this.quickbarOrigins.get(item.uid) : this.targetState(this.targetForLocation(from));
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
      if (count === item.count) {
        this.quickbarOrigins.delete(item.uid);
      }
      return plan;
    }
    this.put(moving, target, plan.at);
    if (target.kind === 'hand' && origin) {
      this.quickbarOrigins.set(moving.uid, structuredClone(origin));
    } else if (target.kind !== 'hand' && count === item.count) {
      this.quickbarOrigins.delete(item.uid);
    }
    return plan;
  }

  /** Read-only placement for a newly created, unlocated item (not a move admission). */
  planAdd(item: Item, target: Target): Plan {
    switch (target.kind) {
      case 'hand':
        return this.hands[target.side] ? refuse('full') : { ok: true, time: 0 };
      case 'worn': {
        const slot = wornSlotOf(this.registry, item);
        return slot && !this.worn[slot] && !this.shoulderRefusal(slot, item) ? { ok: true, time: 0 } : refuse('full');
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

  private validCraftPlan(
    plan: Extract<WorkPlan, { kind: 'craft' }>,
    repair?: { targetUid: number; amount: number },
  ): boolean {
    const recipe = this.registry.recipes.get(plan.recipe);
    if (!recipe || (recipe.kind === 'repair') !== (repair !== undefined)) {
      return false;
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
        return false;
      }
    }
    const seen = new Set<number>();
    for (const { item, count } of plan.components) {
      if (!this.validCraftComponent(item, count) || seen.has(item.uid)) {
        return false;
      }
      seen.add(item.uid);
    }
    return !plan.tools.some((tool) => seen.has(tool.item.uid));
  }

  private validCraftComponent(item: Item, count: number): boolean {
    return (
      this.itemByUid(item.uid) === item &&
      Boolean(this.locate(item)) &&
      isEmpty(item) &&
      Number.isSafeInteger(count) &&
      count >= 1 &&
      count <= item.count
    );
  }

  private validDisassemblyPlan(plan: Extract<WorkPlan, { kind: 'disassembly' }>): boolean {
    const sourceDef = this.registry.items.get(plan.source.type);
    if (
      this.itemByUid(plan.source.uid) !== plan.source ||
      !this.locate(plan.source) ||
      !sourceDef ||
      !(sourceDef.disassembly || sourceDef.salvage) ||
      !validDisassemblyToolLevels(sourceDef, plan.toolLevels) ||
      plan.source.work ||
      !isEmpty(plan.source) ||
      !Number.isSafeInteger(plan.skillLevel) ||
      plan.skillLevel < SKILL_LEVEL_MIN ||
      plan.skillLevel > SKILL_LEVEL_LEGENDARY ||
      !Number.isFinite(plan.gather) ||
      plan.gather < 0 ||
      !Number.isFinite(plan.duration) ||
      plan.duration <= 0 ||
      plan.outputs.some(
        ({ item, count }) => !(this.registry.items.has(item) && Number.isSafeInteger(count)) || count < 1,
      )
    ) {
      return false;
    }
    const expected = disassemblyOutputs(sourceDef, plan.skillLevel, (quality) => plan.toolLevels[quality] ?? 0);
    return sameDisassemblyOutputs(expected, plan.outputs);
  }

  private escrowCraft(
    plan: Extract<WorkPlan, { kind: 'craft' }>,
    work: Item,
    repair?: { targetUid: number; amount: number },
  ): void {
    const components = plan.components.map(({ item, count }) => {
      const from = this.locate(item)!;
      if (from.kind === 'hand') {
        this.quickbarOrigins.delete(item.uid);
      }
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
      kind: 'craft',
      recipe: plan.recipe,
      elapsed: 0,
      duration: plan.gather + plan.work,
      components,
      ...(repair ? { repairTargetUid: repair.targetUid, repairAmount: repair.amount } : {}),
    };
  }

  private escrowDisassembly(plan: Extract<WorkPlan, { kind: 'disassembly' }>, work: Item): void {
    const from = this.locate(plan.source)!;
    if (from.kind === 'furniture') {
      this.looted.set(plan.source.type, (this.looted.get(plan.source.type) ?? 0) + 1);
    }
    const input = plan.source.count > 1 ? this.factory.split(plan.source, 1) : plan.source;
    if (input === plan.source) {
      this.remove(from);
    }
    work.work = {
      kind: 'disassembly',
      source: plan.source.type,
      skillLevel: plan.skillLevel,
      toolLevels: { ...plan.toolLevels },
      gather: plan.gather,
      outputs: plan.outputs.map((output) => ({ ...output })),
      elapsed: 0,
      duration: plan.duration,
      components: [input],
    };
  }

  /** Escrow through the mutation owner; no duplicate trees in the other hand or job. */
  beginWork(plan: WorkPlan, repair?: { targetUid: number; amount: number }): Item | undefined {
    if (this.hands.left || this.hands.right) {
      return undefined;
    }
    if (plan.kind === 'craft') {
      if (!this.validCraftPlan(plan, repair)) {
        return undefined;
      }
    } else if (repair || !this.validDisassemblyPlan(plan)) {
      return undefined;
    }
    const work = this.create(WORK_IN_PROGRESS);
    if (plan.kind === 'craft') {
      this.escrowCraft(plan, work, repair);
    } else {
      this.escrowDisassembly(plan, work);
    }
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

  private workOutputs(payload: NonNullable<Item['work']>, finish: boolean): Item[] {
    if (!finish) {
      return payload.components;
    }
    if (payload.kind === 'disassembly') {
      return payload.outputs.map(({ item, count }) => this.create(item, count));
    }
    if (payload.repairTargetUid !== undefined) {
      return [];
    }
    const { result } = this.registry.recipes.get(payload.recipe)!;
    return [this.create(result.item, result.count)];
  }

  private repairTargetForWork(payload: NonNullable<Item['work']>, finish: boolean): Item | undefined {
    if (payload.kind !== 'craft' || payload.repairTargetUid === undefined) {
      return undefined;
    }
    const target = this.itemByUid(payload.repairTargetUid);
    if (finish && (!target || payload.repairAmount === undefined)) {
      throw new Error('The repair target is missing');
    }
    return target;
  }

  /** Terminal ownership transfer. Exact input UIDs never merge on cancellation. */
  releaseWork(work: Item, finish: boolean, feet: Vec3): void {
    const payload = work.work;
    const at = this.locate(work);
    if (!(payload && at)) {
      return;
    }
    const repairing = payload.kind === 'craft' && payload.repairTargetUid !== undefined;
    const target = this.repairTargetForWork(payload, finish);
    const outputs = this.workOutputs(payload, finish);
    const resultInHand = finish && !repairing && payload.kind === 'craft' && at.kind === 'hand';
    if (!resultInHand && outputs.some((item) => !couldFit(this.registry, PILE_GRID, item))) {
      throw new Error('An input or result is too large to put down');
    }
    const drops = resultInHand ? [] : this.workDrops(work, outputs, feet);
    this.remove(at);
    work.work = undefined;
    if (finish && target && payload.kind === 'craft' && payload.repairAmount !== undefined) {
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
      case 'slot':
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
    return this.scaleHandlingTime(out + into);
  }

  /** Applies Inventory Management's timing effect to another inventory-handling action. */
  scaleHandlingTime(seconds: number): number {
    return seconds * inventoryHandlingFactor(this.registry, this.character);
  }

  furnitureHandling(entity: BlockEntity, pocket: number): number {
    return this.entities.defOf(entity).container?.pockets[pocket]?.handlingSimSeconds ?? 0;
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

  /** The shoulder carries a long gun only by its sling. */
  private shoulderRefusal(slot: WearSlot, item: Item): string | undefined {
    return slot === 'shoulder' && !slingFitted(item) ? 'It needs a sling to go on your shoulder' : undefined;
  }

  private placement(item: Item, target: Target, count: number, from: Location): Plan {
    switch (target.kind) {
      case 'hand':
        return this.handPlacement(item, target.side, from);
      case 'worn': {
        const slot = wornSlotOf(this.registry, item);
        if (!slot) {
          return refuse("You can't wear that");
        }
        const current = this.worn[slot];
        if (current === item) {
          return refuse("You're already wearing it");
        }
        const shoulder = this.shoulderRefusal(slot, item);
        if (shoulder) {
          return refuse(shoulder);
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
    const hasNestedContents = item.work !== undefined || (item.pockets ?? []).some((pocket) => pocket.length > 0);
    if (target.kind !== 'pile' && hasNestedContents) {
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
    if (!at || item.work || at.kind === 'work' || at.kind === 'slot' || count > item.count) {
      return false;
    }
    if (count < item.count) {
      item.count -= count;
    } else {
      this.remove(at);
      this.quickbarOrigins.delete(item.uid);
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
      case 'slot':
        throw new Error('A fitted item is owned by its firearm');
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
        this.worn[wornSlotOf(this.registry, item)!] = item;
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
    if (work.kind !== 'craft') {
      throw new Error('Disassembly cannot reference a repair target');
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

const validDisassemblyComponents = (work: Extract<NonNullable<ItemState['work']>, { kind: 'disassembly' }>): boolean =>
  work.components.length === 1 && work.components[0]!.type === work.source && work.components[0]!.count === 1;

const validDisassemblySnapshot = (
  registry: Registry,
  source: ItemDef,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'disassembly' }>,
): boolean => {
  const outputsAreValid = work.outputs.every(
    ({ item, count }) => registry.items.has(item) && Number.isSafeInteger(count) && count >= 1,
  );
  const expected = disassemblyOutputs(source, work.skillLevel, (quality) => work.toolLevels[quality] ?? 0);
  return outputsAreValid && sameDisassemblyOutputs(expected, work.outputs);
};

const validateCraftWorkItem = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'craft' }>,
): void => {
  const recipe = registry.recipes.get(work.recipe);
  if (
    !recipe ||
    work.duration < recipe.timeGameMinutes ||
    (recipe.kind === 'repair') !== (work.repairTargetUid !== undefined && work.repairAmount !== undefined) ||
    (work.repairTargetUid === undefined) !== (work.repairAmount === undefined) ||
    (work.repairTargetUid !== undefined && (!Number.isSafeInteger(work.repairTargetUid) || work.repairTargetUid < 1)) ||
    (work.repairAmount !== undefined &&
      (!Number.isFinite(work.repairAmount) || work.repairAmount <= 0 || work.repairAmount > 1))
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

const validateDisassemblyWorkItem = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'disassembly' }>,
): void => {
  const source = registry.items.get(work.source);
  if (!source) {
    throw new Error('Invalid disassembly work payload');
  }
  const duration = source.disassembly ? source.disassembly.timeGameMinutes : SALVAGE_DURATION;
  const hasDisassembly = Boolean(source.disassembly || source.salvage);
  if (!hasDisassembly) {
    throw new Error('Invalid disassembly work payload');
  }
  if (!validDisassemblyToolLevels(source, work.toolLevels)) {
    throw new Error('Invalid disassembly work payload');
  }
  if (
    !Number.isFinite(work.gather) ||
    work.gather < 0 ||
    work.duration !== work.gather + duration ||
    !Number.isSafeInteger(work.skillLevel) ||
    work.skillLevel < SKILL_LEVEL_MIN ||
    work.skillLevel > SKILL_LEVEL_LEGENDARY ||
    !validDisassemblyComponents(work) ||
    !validDisassemblySnapshot(registry, source, work)
  ) {
    throw new Error('Invalid disassembly work payload');
  }
};

export const validateWorkItem = (registry: Registry, item: ItemState): void => {
  const work = item.work!;
  const commonInvalid =
    item.type !== WORK_IN_PROGRESS ||
    item.count !== 1 ||
    !Number.isFinite(work.elapsed) ||
    !Number.isFinite(work.duration) ||
    work.elapsed < 0 ||
    work.duration <= 0 ||
    work.elapsed > work.duration ||
    work.components.some((component) => component.work || (component.pockets ?? []).some((grid) => grid.length));
  if (commonInvalid) {
    throw new Error(work.kind === 'disassembly' ? 'Invalid disassembly work payload' : 'Invalid craft work payload');
  }
  if (work.kind === 'craft') {
    validateCraftWorkItem(registry, work);
  } else {
    validateDisassemblyWorkItem(registry, work);
  }
};

/** Where an item lies in a grid, if it's in one. */
export const spotOf = (at: Location): Spot | undefined =>
  at.kind === 'hand' || at.kind === 'worn' || at.kind === 'work' || at.kind === 'slot'
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
