// What the player holds and wears, the piles on the ground, and what's in furniture.
// Moves are planned first (does it fit, how long does it take) and applied when the
// handling time is up (handling.ts). `DESIGN.md`, "Items and inventory"; `DESIGN.md`, "Hands".

import { BlockEntities, type BlockEntity } from './blockEntities.ts';
import { cargoGrid, cargoSpaceItem } from './cargoSpace.ts';
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
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import { type CoreMessageKey, coreLabel, coreMessage, coreRefusal } from './coreText.ts';
import type { WorkPlan } from './crafting.ts';
import {
  disassemblyOutputs,
  disassemblyWorkTime,
  sameDisassemblyOutputs,
  validDisassemblyToolLevels,
} from './disassembly.ts';
import { firearmSlotIds, isLongGun, slingFitted } from './firearmFitting.ts';
import {
  equalFoodExposure,
  FOOD_EXPOSURE_DENOMINATOR,
  type FoodExposure,
  initialFoodExposure,
  projectFoodExposure,
  sameFoodExposure,
} from './food.ts';
import { furnitureSurfacePosition } from './furnitureSurface.ts';
import { PILE_GRID } from './inventoryScale.ts';
import {
  assertSavedLiquidContents,
  cellCount,
  couldFit,
  craftComponentEligible,
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
import { itemIds, itemRoots, savedItemTree, subtreeItems, type TreeLocation, walkItemTree } from './itemTree.ts';
import { type LiquidTransferPlan, planLiquidTransfer } from './liquids.ts';
import type { Rolled } from './loot.ts';
import { magazineWellCalibre, slotsReason } from './magazine.ts';
import { countText } from './numberText.ts';
import type { WearSlot } from './schema.ts';
import type { FurnitureSpawn } from './site.ts';
import { inventoryManagementTuning } from './skillTraining.ts';
import { freezeSnapshot } from './snapshotData.ts';
import {
  copyVehiclePlacement,
  type VehicleInstance,
  VehicleInstances,
  type VehicleInstancesState,
} from './vehicleInstances.ts';

/** Handling tunables in seconds, authored in content beside the skill that scales them. */
export const handlingWeights = (registry: Registry) => {
  const tuning = inventoryManagementTuning(registry);
  return {
    /** Added per cell of the item's size, taking it out and putting it in. */
    perCell: tuning.handlingPerCellSimSeconds,
    /** Taking from or putting on the ground. */
    ground: tuning.handlingGroundSimSeconds,
    /** Putting on or taking off a worn item. */
    wear: tuning.handlingWearSimSeconds,
  };
};

const inventoryHandlingFactor = (registry: Registry, character: HandedCharacter): number => {
  const tuning = inventoryManagementTuning(registry);
  const level = skillEffectLevel(character.skills?.inventory_management ?? SKILL_LEVEL_MIN);
  return skillSaturation(level, tuning.handlingFactorFloor, tuning.handlingFactorHalfLifeLevels);
};

/** The worn slot an item goes in: clothing's own slot, or the shoulder for a long gun (`DESIGN.md`, "Shoulder and sling"). */
export const wornSlotOf = (registry: Registry, item: Item): WearSlot | undefined => {
  const def = defOf(registry, item.type);
  return def.wearable?.slot ?? (isLongGun(def) ? 'shoulder' : undefined);
};

export const workInProgressItem = (registry: Registry): ItemDef => {
  const definitions = [...registry.items.values()].filter((item) => item.workInProgress);
  if (definitions.length !== 1) {
    throw new Error('Expected exactly one work-in-progress item definition');
  }
  return definitions[0]!;
};

/** Ordinary dropping and craft retirement share the same bounded neighborhood. */
export const dropSpots = (feet: Vec3): Vec3[] => [
  feet,
  [feet[0] + 1, feet[1], feet[2]],
  [feet[0] - 1, feet[1], feet[2]],
  [feet[0], feet[1], feet[2] + 1],
  [feet[0], feet[1], feet[2] - 1],
];

export type HandSide = 'right' | 'left';

/** Something outside the inventory that can hold a hand, so the hand does nothing else meanwhile. */
export interface HandHold {
  /** Why a move can't take `item` out of hand `from` or into hand `to`. */
  moveRefusal: (item: Item, from: HandSide | undefined, to: HandSide | undefined) => string | undefined;
  /** Why both hands can't take up a piece of furniture. */
  liftRefusal: () => string | undefined;
}

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

/**
 * Where to put an item. Without a spot, it joins a stack with room or takes the first free spot. A spot asks to swap
 * with its occupant unless it is `reserved`: a batch's reservation, which fails once something else has taken it.
 */
export type TargetState =
  | { kind: 'hand'; side: HandSide }
  | { kind: 'worn' }
  | { kind: 'pocket'; ownerUid: number; pocket: number; at?: Spot; reserved?: true }
  | { kind: 'pile'; pos: Vec3; at?: Spot; reserved?: true }
  | { kind: 'furniture'; entityUid: number; pocket: number; at?: Spot; reserved?: true };

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
  | { kind: 'pocket'; owner: Item; pocket: number; at?: Spot; reserved?: true }
  | { kind: 'pile'; pos: Vec3; at?: Spot; reserved?: true }
  | { kind: 'furniture'; entity: BlockEntity; pocket: number; at?: Spot; reserved?: true };

export interface VehicleTransfer {
  kind: 'install' | 'remove';
  vehicleId: number;
  fittingId: string;
  itemUid: number;
  output?: Target;
}

type Place =
  | { kind: 'pile'; pile: Pile }
  | { kind: 'furniture'; entity: BlockEntity }
  | { kind: 'vehicle'; origin: Vec3; vehicleId: number };

export type Plan =
  | { ok: true; time: number; merge?: Item; at?: Spot; swap?: Item }
  | { ok: false; reason: string; key?: CoreMessageKey };

export const SIDES: readonly HandSide[] = ['right', 'left'];
const other = (side: HandSide): HandSide => (side === 'right' ? 'left' : 'right');
const pileKey = (pos: Vec3) => pos.join(',');
const refuse = (reason: string): Plan => ({ ok: false, reason });
const spotPart = ({ at, reserved }: { at?: Spot; reserved?: true }) => ({
  ...(at ? { at: { ...at } } : {}),
  ...(reserved ? { reserved } : {}),
});

/** Why an item can't leave where it is, whatever the target. */
const chargingBattery = (from: Location): boolean =>
  from.kind === 'furniture' && from.entity.charging?.batteryUid === from.placed.item.uid;

const heldInPlace = (registry: Registry, item: Item, from: Location): string | undefined => {
  if (from.kind === 'work' || chargingBattery(from)) {
    return coreMessage(registry, 'inWork');
  }
  if (from.kind === 'slot') {
    return coreMessage(registry, 'fitted');
  }
  if (from.kind === 'vehicle') {
    return coreMessage(registry, 'fittedToVehicle');
  }
  if (item.trap) {
    return coreMessage(registry, item.trap.state === 'armed' ? 'trapSet' : 'trapShut');
  }
  return undefined;
};
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
  readonly vehicles = new VehicleInstances();
  /** Goes up on every change, so views know when to redraw. */
  version = 0;
  /** Whether a pile's block is within reach; the game sets it from the player's position. */
  canReach: (pos: Vec3) => boolean = () => true;
  /** Whether a vehicle is within reach; the game sets it from the player's position and the vehicle's parts. */
  canReachVehicle: (vehicleId: number) => boolean = () => true;
  /** Whether a piece of furniture is within reach. */
  canReachEntity: (entity: BlockEntity) => boolean = () => true;
  /** Where a pile put down in a block comes to rest, or undefined with nowhere to land; the game sets it. */
  landing: (pos: Vec3) => Vec3 | undefined = (pos) => pos;
  /** The block a drop is made from, at the player's feet; the game sets it. */
  dropFeet: () => Vec3 | undefined = () => undefined;
  /** Where the actor stands, in blocks; the game sets it. Undefined means no side is known. */
  actorPosition: () => Vec3 | undefined = () => undefined;
  /** What holds a hand from outside the inventory, such as a ladder; the game sets it. */
  handHold: HandHold = { moveRefusal: () => undefined, liftRefusal: () => undefined };
  /** The command's absolute food-calendar milliseconds; the game sets it. Undefined leaves aging to lazy projection. */
  foodClock: () => number | undefined = () => undefined;
  /**
   * Exposure rate, in parts of `FOOD_EXPOSURE_DENOMINATOR`, for food in the tree rooted at a location; the whole
   * denominator is ambient. Every descendant shares its root's rate, so a bag inside a cold pocket is not a second
   * environment.
   */
  foodRate: (root: Location, food: Item) => number = () => FOOD_EXPOSURE_DENOMINATOR;

  /** A deep plain-data copy of carried, worn, piled and furnished items and allocators. */
  snapshotState(foodAt?: number): Readonly<InventoryState> {
    return freezeSnapshot({
      nextItemUid: this.factory.next,
      hands: Object.fromEntries(Object.entries(this.hands).map(([side, item]) => [side, snapshotItem(item!, foodAt)])),
      worn: Object.fromEntries(Object.entries(this.worn).map(([slot, item]) => [slot, snapshotItem(item!, foodAt)])),
      piles: [...this.piles.values()].map((pile) => ({
        pos: [...pile.pos],
        items: pile.items.map((placed) => snapshotPlaced(placed, foodAt)),
      })),
      looted: [...this.looted.entries()].map(([type, count]) => [type, count]),
      quickbarOrigins: [...this.quickbarOrigins.entries()].map(([uid, target]) => [uid, structuredClone(target)]),
      entities: this.entities.snapshotState(foodAt),
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
    {
      character = DEFAULT_HANDED_CHARACTER,
      vehicles: vehiclesState = { nextId: 1, instances: [] },
    }: { character?: HandedCharacter; vehicles?: VehicleInstancesState } = {},
  ): Inventory {
    if (!Number.isSafeInteger(state.nextItemUid) || state.nextItemUid < 1) {
      throw new Error('Invalid next item id');
    }
    validateInventoryTree(registry, state, vehiclesState);
    const restoredEntities = BlockEntities.restoreState(registry, state.entities);
    const inventory = new Inventory(
      registry,
      new ItemFactory(state.nextItemUid),
      entities ?? restoredEntities,
      character,
    );
    inventory.vehicles.restoreState(registry, vehiclesState);
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
    if (entities) {
      entities.restoreState(state.entities);
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
   * Moves one exact UID between an ordinary owner and a serviceable vehicle site.  The destination
   * is completely admitted before either owner changes; see `vehicleTransfer`.
   */
  vehicleTransfer(request: VehicleTransfer): string | undefined {
    const { kind, vehicleId, fittingId, itemUid } = request;
    const vehicle = this.vehicles.get(vehicleId);
    const site = vehicle?.sites.find(({ id }) => id === fittingId);
    const item = this.itemByUid(itemUid);
    if (!(vehicle && site?.service && item)) {
      return coreMessage(this.registry, 'gone');
    }
    if (this.registry.items.get(item.type)?.vehicle?.mount !== site.service.mount || item.count !== 1) {
      return coreMessage(this.registry, 'partDoesNotFit');
    }
    return kind === 'install'
      ? this.installVehiclePart(vehicle, site, item, vehicleId)
      : this.removeVehiclePart(vehicle, item, request);
  }

  /** Engine validation text names internals, so a rejected build is refused with the operation's content line. */
  private replaceVehicle(
    vehicleId: number,
    build: VehicleInstance,
    refusal: 'partDoesNotFit' | 'partSupportsOthers',
  ): string | undefined {
    try {
      this.vehicles.replace(this.registry, vehicleId, build);
      return undefined;
    } catch {
      return coreMessage(this.registry, refusal);
    }
  }

  private vehicleBuild(vehicle: VehicleInstance, fittings: VehicleInstance['fittings']): VehicleInstance {
    return {
      ...vehicle,
      origin: [...vehicle.origin],
      sites: vehicle.sites.map(copyVehiclePlacement),
      fittings: fittings.map((entry) => ({ ...copyVehiclePlacement(entry), item: entry.item })),
    };
  }

  private installVehiclePart(
    vehicle: VehicleInstance,
    site: VehicleInstance['sites'][number],
    item: Item,
    vehicleId: number,
  ): string | undefined {
    const from = this.locate(item);
    if (!from || from.kind === 'vehicle' || vehicle.fittings.some(({ id }) => id === site.id)) {
      return coreMessage(this.registry, 'gone');
    }
    const refusal = this.replaceVehicle(
      vehicleId,
      this.vehicleBuild(vehicle, [...vehicle.fittings, { ...copyVehiclePlacement(site), item }]),
      'partDoesNotFit',
    );
    if (refusal) {
      return refusal;
    }
    this.remove(from);
    this.version += 1;
    return undefined;
  }

  private removeVehiclePart(vehicle: VehicleInstance, item: Item, request: VehicleTransfer): string | undefined {
    const { fittingId, output, vehicleId } = request;
    const fitted = vehicle.fittings.find(({ id }) => id === fittingId);
    if (!fitted || fitted.item !== item || !output) {
      return coreMessage(this.registry, 'gone');
    }
    if (vehicle.fittings.some((entry) => entry.supportedBy.includes(fittingId))) {
      return coreMessage(this.registry, 'partSupportsOthers');
    }
    const placement = this.planAdd(item, output);
    if (!placement.ok) {
      return placement.reason;
    }
    this.settleFood(item, this.locate(item));
    const refusal = this.replaceVehicle(
      vehicleId,
      this.vehicleBuild(
        vehicle,
        vehicle.fittings.filter((entry) => entry !== fitted),
      ),
      'partSupportsOthers',
    );
    if (refusal) {
      return refusal;
    }
    if (placement.merge) {
      this.mergeStack(placement.merge, item);
    } else {
      this.put(item, output, placement.at);
    }
    this.version += 1;
    return undefined;
  }

  vehicleService(
    vehicleId: number,
    fittingId: string,
    itemUid: number,
  ): Readonly<{ durationSimSeconds: number; qualities: Readonly<Record<string, number>> }> | undefined {
    const vehicle = this.vehicles.get(vehicleId);
    const site = vehicle?.sites.find(({ id }) => id === fittingId);
    const item = this.itemByUid(itemUid);
    return site?.service &&
      item &&
      site.supportedBy.every((support) => vehicle?.fittings.some(({ id }) => id === support)) &&
      this.registry.items.get(item.type)?.vehicle?.mount === site.service.mount
      ? site.service
      : undefined;
  }

  registerVehicle(
    spec: Pick<VehicleInstance, 'blueprint' | 'placementKey' | 'origin' | 'facing'>,
    absent: readonly string[] = [],
  ): number {
    const existing = this.vehicles.idForPlacementKey(spec.placementKey);
    if (existing !== undefined) {
      return existing;
    }
    const blueprint = this.registry.vehicleBlueprints.get(spec.blueprint);
    if (!blueprint || absent.some((id) => !blueprint.fittings.some((fitting) => fitting.id === id))) {
      throw new Error('Invalid vehicle factory build');
    }
    const vehicle: VehicleInstance = {
      ...spec,
      origin: [...spec.origin],
      sites: blueprint.fittings.map(copyVehiclePlacement),
      fittings: blueprint.fittings
        .filter(({ id }) => !absent.includes(id))
        .map((fitting) => ({
          ...copyVehiclePlacement(fitting),
          item: fitting.cargo
            ? cargoSpaceItem(this.factory, this.registry, fitting.part, fitting.cargo)
            : this.factory.create(this.registry, fitting.part),
        })),
    };
    const vehicleId = this.vehicles.add(this.registry, vehicle);
    this.version += 1;
    return vehicleId;
  }

  /**
   * Adds a piece of furniture with the items worldgen rolled for it, filling its
   * pockets in order; a rolled item that doesn't fit is left out, but the first
   * `fixedCount` items are required stock and throw instead. Returns undefined if
   * it's already there.
   */
  furnish(
    spec: Parameters<BlockEntities['add']>[0],
    loot: readonly Rolled[] = [],
    surfaceLoot: readonly Rolled[] = [],
    fixedCount = 0,
  ): BlockEntity | undefined {
    const entity = this.entities.add(spec);
    if (!entity) {
      return undefined;
    }
    for (const [index, rolled] of loot.entries()) {
      const item = this.createRolled(rolled);
      const placed = (entity.pockets ?? []).some((_, pocket) => this.add(item, { kind: 'furniture', entity, pocket }));
      if (!placed && index < fixedCount) {
        throw new Error(`fixed item "${rolled.type}" does not fit in its furniture "${spec.type}"`);
      }
    }
    if (surfaceLoot.length > 0) {
      const pos = furnitureSurfacePosition(entity);
      for (const rolled of surfaceLoot) {
        if (!this.add(this.createRolled(rolled), { kind: 'pile', pos })) {
          throw new Error(`fixed surface item "${rolled.type}" does not fit on its furniture`);
        }
      }
    }
    return entity;
  }

  /** Places a worldgen furniture spawn whole: its piece, its loot and its starting wear. */
  furnishSpawn({ spec, loot, surfaceLoot, fixedCount, wear }: FurnitureSpawn): BlockEntity | undefined {
    const entity = this.furnish(spec, loot, surfaceLoot, fixedCount);
    if (entity && wear !== undefined) {
      this.entities.wear(entity, wear);
    }
    return entity;
  }

  createRolled({ type, count, condition, paperMap, fitted, charge }: Rolled): Item {
    const item = this.factory.create(this.registry, type, count, {
      condition,
      ...(paperMap === undefined ? {} : { paperMap }),
    });
    for (const [slot, child] of Object.entries(fitted ?? {})) {
      this.fitSlot(item, slot, this.create(child));
    }
    if (charge !== undefined) {
      for (const battery of [item, ...Object.values(item.slots ?? {})]) {
        const capacity = defOf(this.registry, battery.type).battery?.capacity;
        if (capacity !== undefined) {
          battery.charges = charge * capacity;
        }
      }
    }
    return item;
  }

  /** The sole live item-tree projection; callers hold UIDs, not ownership caches. */
  items() {
    const inventory = this;
    function* roots() {
      yield* itemRoots<Item, Pile, BlockEntity>({
        hands: inventory.hands,
        worn: inventory.worn,
        get piles() {
          return inventory.piles.values();
        },
        get entities() {
          return inventory.entities.records;
        },
        vehicles: inventory.vehicles.records,
      });
    }
    return walkItemTree(roots());
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
        return { kind: 'pocket', ownerUid: target.owner.uid, pocket: target.pocket, ...spotPart(target) };
      case 'pile':
        return { kind: 'pile', pos: [...target.pos], ...spotPart(target) };
      case 'furniture':
        return { kind: 'furniture', entityUid: target.entity.uid, pocket: target.pocket, ...spotPart(target) };
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
      case 'vehicle':
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
        return owner ? { kind: 'pocket', owner, pocket: state.pocket, ...spotPart(state) } : undefined;
      }
      case 'pile':
        return { kind: 'pile', pos: [...state.pos], ...spotPart(state) };
      case 'furniture': {
        const entity = this.entities.byUid(state.entityUid);
        return entity ? { kind: 'furniture', entity, pocket: state.pocket, ...spotPart(state) } : undefined;
      }
      default:
        throw new Error(`Unknown target kind ${String((state as { kind: string }).kind)}`);
    }
  }

  create(type: string, count = 1, condition = 1, madeAt = 0): Item {
    return this.factory.create(this.registry, type, count, { condition, madeAt });
  }

  /** Fills or empties an owner's slot with a loose, certified item; returns the item displaced. */
  fitSlot(owner: Item, slot: string, item: Item | undefined): Item | undefined {
    const { slots } = owner;
    const ownerDef = defOf(this.registry, owner.type);
    const knownSlot =
      (slot === 'magazine' && magazineWellCalibre(this.registry, owner.type) !== undefined) ||
      (slot === 'battery' && ownerDef.light?.power !== undefined) ||
      (slot === 'canister' && ownerDef.tool?.fuel !== undefined) ||
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

  /** Moves piled items to other piles at the given spots, as when the furniture under them is moved. */
  shiftPiles(moves: readonly { placed: Placed; to: Vec3; at: Spot }[]): void {
    for (const { placed } of moves) {
      const pile = [...this.piles.values()].find((candidate) => candidate.items.includes(placed));
      if (!pile) {
        throw new Error(`Item ${placed.item.uid} is not piled`);
      }
      this.remove({ kind: 'pile', pile, placed });
    }
    for (const { placed, to, at } of moves) {
      this.put(placed.item, { kind: 'pile', pos: to }, at);
    }
    if (moves.length > 0) {
      this.version += 1;
    }
  }

  /** Lays items that are in no place, such as a destroyed piece's contents and debris, on piles at the given spots. */
  landLoose(drops: readonly { placed: Placed; to: Vec3; at: Spot }[]): void {
    for (const { placed, to, at } of drops) {
      this.put(placed.item, { kind: 'pile', pos: to }, at);
    }
    if (drops.length > 0) {
      this.version += 1;
    }
  }

  /** The grid of a pocket, from the owner's type. */
  pocketGrid(owner: Item, pocket: number): GridSize {
    const def = defOf(this.registry, owner.type);
    const container =
      owner.cargo && def.vehicle?.cargoSpace ? cargoGrid(owner.cargo, def.vehicle.cargoSpace) : def.container;
    const spec = container?.pockets[pocket];
    if (!spec) {
      throw new Error(`${owner.type} has no pocket ${pocket}`);
    }
    return { w: spec.grid[0], h: spec.grid[1] };
  }

  pocketHandling(owner: Item, pocket: number): number {
    const def = defOf(this.registry, owner.type);
    const container =
      owner.cargo && def.vehicle?.cargoSpace ? cargoGrid(owner.cargo, def.vehicle.cargoSpace) : def.container;
    return container?.pockets[pocket]?.handlingSimSeconds ?? 0;
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

  /** The top-level place a nested location belongs to; undefined when its owner is in no place. */
  private rootOf(location: Location): Location | undefined {
    let at: Location | undefined = location;
    while (at && (at.kind === 'pocket' || at.kind === 'slot' || at.kind === 'work')) {
      at = this.locate(at.owner);
    }
    return at;
  }

  /** Food in no place, as between leaving one owner and joining another, ages ambiently. */
  private foodRateAt(root: Location | undefined, food: Item): number {
    return root ? this.foodRate(root, food) : FOOD_EXPOSURE_DENOMINATOR;
  }

  /** Food's exposure at the command time where it now is, without settling it; a pure query. */
  currentFood(item: Item): FoodExposure | undefined {
    const at = this.foodClock();
    if (!item.foodExposure || at === undefined) {
      return item.foodExposure && { ...item.foodExposure };
    }
    const from = this.locate(item);
    return projectFoodExposure(item.foodExposure, at, this.foodRateAt(from && this.rootOf(from), item));
  }

  private readonly sameFood = (a: Item, b: Item): boolean =>
    this.foodClock() === undefined
      ? equalFoodExposure(a, b)
      : sameFoodExposure(this.currentFood(a), this.currentFood(b));

  /**
   * Delivers the old environment's aging to a subtree before its ownership changes, so the new environment affects
   * only later aging. `from` is where the subtree is, or undefined while it is in no place.
   */
  private settleFood(item: Item, from: Location | undefined): void {
    const at = this.foodClock();
    if (at === undefined) {
      return;
    }
    const food = [...subtreeItems(item)].filter((node) => node.foodExposure);
    if (food.length === 0) {
      return;
    }
    const root = from && this.rootOf(from);
    for (const node of food) {
      node.foodExposure = projectFoodExposure(node.foodExposure!, at, this.foodRateAt(root, node));
    }
  }

  /** Settles a piece's pockets before it is relocated or destroyed; see `furnitureMove.ts`, `beforeRelocating`. */
  settleFurnitureFood(entity: BlockEntity): void {
    for (const [pocket, grid] of (entity.pockets ?? []).entries()) {
      for (const placed of grid) {
        this.settleFood(placed.item, { kind: 'furniture', entity, pocket, placed });
      }
    }
  }

  /** Items held or worn, top level only. */
  carried(): Item[] {
    return [...SIDES.map((s) => this.hands[s]), ...Object.values(this.worn)].filter((i): i is Item => i !== undefined);
  }

  /** Items held or worn, with everything inside them. */
  carriedTree() {
    return walkItemTree(
      itemRoots<Item, Pile, BlockEntity>({ hands: this.hands, worn: this.worn, piles: [], entities: [] }),
    );
  }

  carriedByUid(uid: number): Item | undefined {
    for (const { item } of this.carriedTree()) {
      if (item.uid === uid) {
        return item;
      }
    }
    return undefined;
  }

  /** Grams held and worn, with everything inside. */
  carriedWeight(): number {
    return this.carried().reduce((sum, item) => sum + weightOf(this.registry, item), 0);
  }

  /** Transfers a released hand item into its landing pile before its visual arc begins. */
  throwToPile(
    item: Item,
    side: HandSide,
    target: Extract<Target, { kind: 'pile' }>,
  ): { ok: true; item: Item } | { ok: false; reason: string } {
    if (this.hands[side] !== item) {
      return { ok: false, reason: coreMessage(this.registry, 'leftHand') };
    }
    const placement = this.planAdd(item, target);
    if (!placement.ok) {
      return placement;
    }
    this.settleFood(item, { kind: 'hand', side });
    delete this.hands[side];
    this.quickbarOrigins.delete(item.uid);
    this.version += 1;
    if (placement.merge) {
      this.mergeStack(placement.merge, item);
      return { ok: true, item: placement.merge };
    }
    this.put(item, target, placement.at);
    return { ok: true, item };
  }

  planLiquidTransfer(
    sourceUid: number,
    receiverUid: number | undefined,
    limitMicrolitres?: number,
  ): LiquidTransferPlan {
    const source = this.itemByUid(sourceUid);
    const receiver = receiverUid === undefined ? undefined : this.itemByUid(receiverUid);
    const plan = planLiquidTransfer(this.registry, source, receiver, limitMicrolitres);
    if (!plan.ok) {
      return plan;
    }
    const from = this.locate(source!)!;
    const to = this.locate(receiver!)!;
    const sourcePlace = this.placeOf(from);
    const receiverPlace = this.placeOf(to);
    if (!(this.reachable(sourcePlace) && this.reachable(receiverPlace))) {
      return { ok: false, reason: 'unreachable' };
    }
    if (
      heldInPlace(this.registry, source!, from) ||
      heldInPlace(this.registry, receiver!, to) ||
      this.accessRefusal(sourcePlace, receiverPlace)
    ) {
      return { ok: false, reason: 'inaccessible' };
    }
    return plan;
  }

  transferLiquid(sourceUid: number, receiverUid: number | undefined, limitMicrolitres?: number): LiquidTransferPlan {
    // Delayed handling commits quantities, never a previously computed balance.
    const plan = this.planLiquidTransfer(sourceUid, receiverUid, limitMicrolitres);
    if (!plan.ok) {
      return plan;
    }
    this.itemByUid(sourceUid)!.liquidContents = { ...plan.sourceContents };
    this.itemByUid(receiverUid!)!.liquidContents = { ...plan.receiverContents };
    this.version += 1;
    return plan;
  }

  /** Checks a move and works out its handling time, without changing anything. */
  plan(item: Item, target: Target, count = item.count): Plan {
    const from = this.locate(item);
    if (!from) {
      return coreRefusal(this.registry, 'gone');
    }
    const held = heldInPlace(this.registry, item, from);
    if (held) {
      return refuse(held);
    }
    if (!Number.isInteger(count) || count < 1 || count > item.count) {
      return coreRefusal(this.registry, 'partCount', { count: countText(count), total: countText(item.count) });
    }
    const handHeld = this.handMoveRefusal(item, from, target);
    if (handHeld) {
      return refuse(handHeld);
    }
    const { light } = defOf(this.registry, item.type);
    if (item.on && light?.burning?.stow === 'refuse' && target.kind !== 'hand' && target.kind !== 'pile') {
      return coreRefusal(this.registry, 'stillLit');
    }
    if (
      target.kind === 'furniture' &&
      target.entity.charging &&
      this.registry.furniture.get(target.entity.type)?.charger?.pocket === target.pocket
    ) {
      return coreRefusal(this.registry, 'inWork');
    }
    const source = this.placeOf(from);
    const destination = this.targetPlace(target);
    if (!(this.reachable(source) && (this.reachable(destination) || this.dropLanding(target)))) {
      return coreRefusal(this.registry, 'tooFar');
    }
    const access = this.accessRefusal(source, destination);
    if (access) {
      return refuse(access);
    }
    const placement = this.placement(item, target, count, from);
    const successfulPlacement = placement.ok ? placement : this.planSwap(item, target, count, from);
    if (!successfulPlacement) {
      return placement;
    }
    return { ...successfulPlacement, ok: true, time: this.handlingTime(item, from, target) };
  }

  /** Makes a move now if it's possible. Returns the plan it followed, or why not. */
  move(item: Item, target: Target, count = item.count): Plan {
    const plan = this.plan(item, target, count);
    if (!plan.ok) {
      return plan;
    }
    const from = this.locate(item)!;
    if (plan.swap) {
      return this.moveSwap({ item, otherItem: plan.swap, from, target, plan });
    }
    const origin =
      from.kind === 'hand' ? this.quickbarOrigins.get(item.uid) : this.targetState(this.targetForLocation(from));
    let moving = item;
    if (count < item.count) {
      moving = this.split(item, count, from);
    } else {
      this.remove(from);
    }
    if (from.kind === 'furniture' && target.kind !== 'furniture') {
      this.countLooted(moving);
    }
    this.version += 1;
    if (plan.merge) {
      this.mergeStack(plan.merge, moving);
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
      this.mergeStack(placement.merge, item);
    } else {
      this.put(item, target, placement.at);
    }
    return true;
  }

  private countLooted(item: Item): void {
    const alreadyCounted = Math.min(item.lootedCount ?? 0, item.count);
    const newlyCounted = item.count - alreadyCounted;
    if (newlyCounted > 0) {
      this.looted.set(item.type, (this.looted.get(item.type) ?? 0) + newlyCounted);
    }
    item.lootedCount = item.count;
  }

  /** Settles before copying, so the parts share the history they had together. */
  private split(item: Item, count: number, from: Location): Item {
    this.settleFood(item, from);
    return this.factory.split(item, count);
  }

  private mergeStack(target: Item, source: Item): void {
    this.settleFood(target, this.locate(target));
    this.settleFood(source, this.locate(source));
    if (!this.sameFood(target, source)) {
      throw new Error('Only an equal food cohort can join a stack');
    }
    target.count += source.count;
    const lootedCount = (target.lootedCount ?? 0) + (source.lootedCount ?? 0);
    if (lootedCount > 0) {
      target.lootedCount = lootedCount;
    }
  }

  private validCraftPlan(
    plan: Extract<WorkPlan, { kind: 'craft' }>,
    repair?: import('./longAction.ts').CraftRepair,
  ): boolean {
    const recipe = this.registry.recipes.get(plan.recipe);
    if (!recipe) {
      return false;
    }
    if (repair && !this.validRepairPlan(plan, repair)) {
      return false;
    }
    const seen = new Set<number>();
    for (const { item, count } of plan.components) {
      if (!this.validCraftComponent(item, count, recipe.consumeFitted) || seen.has(item.uid)) {
        return false;
      }
      seen.add(item.uid);
    }
    return !plan.tools.some((tool) => seen.has(tool.item.uid));
  }

  private validRepairPlan(
    plan: Extract<WorkPlan, { kind: 'craft' }>,
    repair: import('./longAction.ts').CraftRepair,
  ): boolean {
    const recipe = this.registry.recipes.get(plan.recipe)!;
    if (repair.target.kind === 'entity') {
      const entity = this.entities.byUid(repair.target.uid);
      return Boolean(
        entity &&
          entity.type === recipe.repair?.entity &&
          !this.entities.useRefusal(entity) &&
          this.canReachEntity(entity) &&
          this.entities.canRepair(entity, repair.amount),
      );
    }
    const target = this.itemByUid(repair.target.uid);
    return Boolean(
      target &&
        !plan.components.some(({ item }) => item.uid === target.uid) &&
        target.type === recipe.result.item &&
        target.count === 1,
    );
  }

  private validCraftComponent(item: Item, count: number, consumeFitted = false): boolean {
    const location = this.locate(item);
    return (
      this.itemByUid(item.uid) === item &&
      location !== undefined &&
      location.kind !== 'vehicle' &&
      !chargingBattery(location) &&
      craftComponentEligible(item, consumeFitted) &&
      Number.isSafeInteger(count) &&
      count >= 1 &&
      count <= item.count
    );
  }

  private validDisassemblyPlan(plan: Extract<WorkPlan, { kind: 'disassembly' }>): boolean {
    const location = this.locate(plan.source);
    return (
      this.itemByUid(plan.source.uid) === plan.source &&
      location !== undefined &&
      location.kind !== 'vehicle' &&
      !chargingBattery(location) &&
      !plan.source.work &&
      isEmpty(plan.source)
    );
  }

  /** The payload `beginWork` stores; restore checks the same shape with `validateWorkItem`. */
  private workPayload(
    plan: WorkPlan,
    components: Item[],
    repair?: import('./longAction.ts').CraftRepair,
  ): NonNullable<Item['work']> {
    if (plan.kind === 'disassembly') {
      return {
        kind: 'disassembly',
        source: plan.source.type,
        skillLevel: plan.skillLevel,
        toolLevels: { ...plan.toolLevels },
        gather: plan.gather,
        outputs: plan.outputs.map((output) => ({ ...output })),
        elapsed: 0,
        duration: plan.duration,
        components,
      };
    }
    return {
      kind: 'craft',
      recipe: plan.recipe,
      elapsed: 0,
      duration: plan.gather + plan.work,
      components,
      ...(repair ? { repairTarget: { ...repair.target }, repairAmount: repair.amount } : {}),
    };
  }

  /** Whether restore would accept the work item this plan makes, judged before any input moves. */
  private restorableWork(plan: WorkPlan, repair?: import('./longAction.ts').CraftRepair): boolean {
    const components =
      plan.kind === 'craft'
        ? plan.components.map(({ item, count }) => ({ ...item, count }))
        : [{ ...plan.source, count: 1 }];
    const work = this.workPayload(plan, components, repair);
    try {
      validateWorkItem(this.registry, {
        uid: 0,
        type: workInProgressItem(this.registry).id,
        count: 1,
        condition: 1,
        work,
      });
      return true;
    } catch {
      return false;
    }
  }

  private escrowCraft(
    plan: Extract<WorkPlan, { kind: 'craft' }>,
    work: Item,
    repair?: import('./longAction.ts').CraftRepair,
  ): void {
    const components = plan.components.map(({ item, count }) => {
      const from = this.locate(item)!;
      if (from.kind === 'hand') {
        this.quickbarOrigins.delete(item.uid);
      }
      const component = count < item.count ? this.split(item, count, from) : item;
      if (component === item) {
        this.remove(from);
      }
      if (from.kind === 'furniture') {
        this.countLooted(component);
      }
      return component;
    });
    work.work = this.workPayload(plan, components, repair);
  }

  private escrowDisassembly(plan: Extract<WorkPlan, { kind: 'disassembly' }>, work: Item): void {
    const from = this.locate(plan.source)!;
    const input = plan.source.count > 1 ? this.split(plan.source, 1, from) : plan.source;
    if (input === plan.source) {
      this.remove(from);
    }
    if (from.kind === 'furniture') {
      this.countLooted(input);
    }
    work.work = this.workPayload(plan, [input]);
  }

  /** Escrow through the mutation owner; no duplicate trees in the other hand or job. */
  beginWork(plan: WorkPlan, repair?: import('./longAction.ts').CraftRepair): Item | undefined {
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
    if (!this.restorableWork(plan, repair)) {
      return undefined;
    }
    const work = this.create(workInProgressItem(this.registry).id);
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
    const landings = dropSpots(feet).flatMap((spot) => {
      const landed = this.landing(spot);
      return landed ? [landed] : [];
    });
    if (outputs.length > 0 && landings.length === 0) {
      throw new Error(coreMessage(this.registry, 'noLanding'));
    }
    for (const item of outputs) {
      let found = false;
      for (const pos of landings) {
        const placed = this.pilePlacements(pos).filter(({ item: existing }) => existing !== work);
        const spot = this.reserveSpot(grids, pileKey(pos), { size: PILE_GRID, placed }, item);
        if (spot) {
          drops.push({ item, pos, spot });
          found = true;
          break;
        }
      }
      if (!found) {
        throw new Error(coreMessage(this.registry, 'noGroundRoom'));
      }
    }
    return drops;
  }

  // Shadow occupancy reserves every placement of a batch before transferring any of them.
  private reserveSpot(shadow: Map<string, Placed[]>, key: string, grid: GridState, item: Item): Spot | undefined {
    const placed = shadow.get(key) ?? [...grid.placed];
    shadow.set(key, placed);
    const spot = findSpot(this.registry, { size: grid.size, placed }, item);
    if (spot) {
      placed.push({ item, ...spot });
    }
    return spot;
  }

  /**
   * Plans moving each item into the first of its targets that still has room once the earlier items are in.
   * Each planned target pins the spot it reserved, so queued moves land where the batch planned them; a pin is
   * `reserved`, so a spot taken meanwhile fails the move instead of swapping out what took it.
   */
  planBatch(moves: readonly { item: Item; targets: readonly Target[] }[]): { item: Item; target: Target }[] {
    const shadow = new Map<string, Placed[]>();
    const joined = new Map<Item, number>();
    return moves.flatMap(({ item, targets }) => {
      for (const target of targets) {
        const pinned = this.reserveBatchTarget(shadow, joined, item, target);
        if (pinned) {
          return [{ item, target: pinned }];
        }
      }
      return [];
    });
  }

  /** The target pinned to a stack with room left by the batch so far, else to a free spot it reserves. */
  private reserveBatchTarget(
    shadow: Map<string, Placed[]>,
    joined: Map<Item, number>,
    item: Item,
    target: Target,
  ): Target | undefined {
    if (target.kind === 'hand' || target.kind === 'worn' || !this.plan(item, target).ok) {
      return undefined;
    }
    const { at: _pinned, ...where } = target;
    const key = JSON.stringify(this.targetState(where));
    const grid = this.gridOf(target);
    const placed = shadow.get(key) ?? [...grid.placed];
    shadow.set(key, placed);
    const stack = placed.find(
      (p) => stackRoom(this.registry, p.item, item, this.sameFood) - (joined.get(p.item) ?? 0) >= item.count,
    );
    if (stack) {
      joined.set(stack.item, (joined.get(stack.item) ?? 0) + item.count);
    }
    const at = stack ? { x: stack.x, y: stack.y, rotated: stack.rotated } : this.reserveSpot(shadow, key, grid, item);
    return at ? { ...target, at, reserved: true } : undefined;
  }

  private workOutputs(payload: NonNullable<Item['work']>, finish: boolean, calendar: number): Item[] {
    if (!finish) {
      return payload.components;
    }
    if (payload.kind === 'disassembly') {
      return payload.outputs.map(({ item, count }) => this.create(item, count, 1, calendar));
    }
    if (payload.repairTarget !== undefined) {
      return [];
    }
    const { result } = this.registry.recipes.get(payload.recipe)!;
    return [this.create(result.item, result.count, 1, calendar)];
  }

  private repairTargetForWork(payload: NonNullable<Item['work']>, finish: boolean): Item | undefined {
    if (payload.kind !== 'craft' || payload.repairTarget?.kind !== 'item') {
      return undefined;
    }
    const target = this.itemByUid(payload.repairTarget.uid);
    if (finish && (!target || payload.repairAmount === undefined)) {
      throw new Error('The repair target is missing');
    }
    return target;
  }

  private completeEntityRepair(payload: NonNullable<Item['work']>): boolean {
    if (payload.kind !== 'craft' || payload.repairTarget?.kind !== 'entity') {
      return true;
    }
    const entity = this.entities.byUid(payload.repairTarget.uid);
    return Boolean(
      entity &&
        !this.entities.useRefusal(entity) &&
        this.canReachEntity(entity) &&
        this.entities.repair(entity, payload.repairAmount!),
    );
  }

  /** Terminal ownership transfer. Exact input UIDs never merge on cancellation. */
  releaseWork(work: Item, complete: boolean, feet: Vec3, calendar = 0): void {
    const payload = work.work;
    const at = this.locate(work);
    if (!(payload && at)) {
      return;
    }
    const finish = complete && this.completeEntityRepair(payload);
    const repairing = payload.kind === 'craft' && payload.repairTarget !== undefined;
    const target = this.repairTargetForWork(payload, finish);
    const outputs = this.workOutputs(payload, finish, calendar);
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

  placeOf(location: Location): Place | undefined {
    switch (location.kind) {
      case 'vehicle':
        return { kind: 'vehicle', origin: location.origin, vehicleId: location.vehicleId };
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
    const weights = handlingWeights(this.registry);
    const perCell = weights.perCell * cells;
    const out = (() => {
      switch (from.kind) {
        case 'hand':
          return 0;
        case 'worn':
          return weights.wear;
        case 'pocket':
          return this.pocketHandling(from.owner, from.pocket) + perCell;
        case 'furniture':
          return this.furnitureHandling(from.entity, from.pocket) + perCell;
        default:
          return weights.ground + perCell;
      }
    })();
    const into = (() => {
      switch (target.kind) {
        case 'hand':
          return 0;
        case 'worn':
          return weights.wear;
        case 'pocket':
          return this.pocketHandling(target.owner, target.pocket) + perCell;
        case 'furniture':
          return this.furnitureHandling(target.entity, target.pocket) + perCell;
        default:
          return weights.ground + perCell;
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
    if (place.kind === 'vehicle') {
      return this.canReach(place.origin);
    }
    return place.kind === 'pile' ? this.canReach(place.pile.pos) : this.canReachEntity(place.entity);
  }

  /** A drop falls to where it lands, even out of reach, so the drop and the throw behave the same. */
  private dropLanding(target: Target): boolean {
    const feet = this.dropFeet();
    if (!feet || target.kind !== 'pile') {
      return false;
    }
    const key = pileKey(target.pos);
    return dropSpots(feet).some((spot) => {
      const pos = this.landing(spot);
      return pos !== undefined && pileKey(pos) === key;
    });
  }

  private searched(place: Place | undefined): boolean {
    return place?.kind !== 'furniture' || place.entity.searched;
  }

  /** Why a move can't reach into the furniture at either end: it is unsearched, or reserved. */
  private accessRefusal(source: Place | undefined, destination: Place | undefined): string | undefined {
    if (!(this.searched(source) && this.searched(destination))) {
      return coreMessage(this.registry, 'notSearched');
    }
    const reserved = (place: Place | undefined) =>
      place?.kind === 'furniture' ? this.entities.useRefusal(place.entity) : undefined;
    return reserved(source) ?? reserved(destination);
  }

  /** The shoulder carries a long gun only by its sling. */
  private shoulderRefusal(slot: WearSlot, item: Item): string | undefined {
    return slot === 'shoulder' && !slingFitted(item) ? coreMessage(this.registry, 'needsSling') : undefined;
  }

  private placement(item: Item, target: Target, count: number, from: Location): Plan {
    switch (target.kind) {
      case 'hand':
        return this.handPlacement(item, target.side, from);
      case 'worn': {
        const slot = wornSlotOf(this.registry, item);
        if (!slot) {
          return coreRefusal(this.registry, 'cantWear');
        }
        const current = this.worn[slot];
        if (current === item) {
          return coreRefusal(this.registry, 'alreadyWearing');
        }
        const shoulder = this.shoulderRefusal(slot, item);
        if (shoulder) {
          return refuse(shoulder);
        }
        return current
          ? coreRefusal(this.registry, 'wearingOther', { item: this.name(current).toLowerCase() })
          : { ok: true, time: 0 };
      }
      case 'pocket': {
        if (target.owner === item) {
          return coreRefusal(this.registry, 'insideItself');
        }
        if (!this.locate(target.owner)) {
          return coreRefusal(this.registry, 'cantReach');
        }
        return this.gridPlacement(item, count, this.gridOf(target), target);
      }
      default:
        return this.gridPlacement(item, count, this.gridOf(target), target);
    }
  }

  private planSwap(item: Item, target: Target, count: number, from: Location): { swap: Item; at?: Spot } | undefined {
    // A batch's reserved spot taken meanwhile fails the move; only a spot the player chose asks for a swap.
    if (count !== item.count || ('reserved' in target && target.reserved)) {
      return undefined;
    }
    const otherItem = this.itemAtTarget(target, item);
    const otherFrom = otherItem && this.locate(otherItem);
    if (!otherItem || otherItem === item || !otherFrom || !this.canMoveDisplaced(otherItem, otherFrom, from)) {
      return undefined;
    }
    const sourceTarget = this.targetForLocation(from);
    const sourceSpot = spotOf(from);
    const targetSpot = this.swapTargetSpot(target, otherFrom);
    const sameGrid =
      this.isGridTarget(target) &&
      this.isGridTarget(sourceTarget) &&
      this.gridOf(target).placed === this.gridOf(sourceTarget).placed;
    const sourceProjection = sameGrid && sourceSpot ? { item: otherItem, spot: sourceSpot } : undefined;
    const targetProjection = sameGrid && targetSpot ? { item, spot: targetSpot } : undefined;
    if (
      !this.fitsSwapPlace({
        item,
        target,
        spot: targetSpot,
        from: otherFrom,
        projected: sourceProjection,
      })
    ) {
      return undefined;
    }
    if (
      !this.fitsSwapPlace({
        item: otherItem,
        target: sourceTarget,
        spot: sourceSpot,
        from,
        projected: targetProjection,
      })
    ) {
      return undefined;
    }
    if (!this.swapHandsFit({ item, otherItem, from, target, otherFrom })) {
      return undefined;
    }
    return { swap: otherItem, ...(targetSpot ? { at: targetSpot } : {}) };
  }

  /** Why both hands can't take up a piece of furniture: one holds an item, a piece or something outside. */
  liftRefusal(): string | undefined {
    if (this.entities.carrying() || this.hands.right || this.hands.left) {
      return this.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages.handsFull;
    }
    return this.handHold.liftRefusal();
  }

  private handMoveRefusal(item: Item, from: Location, target: Target): string | undefined {
    if (target.kind === 'hand' && this.entities.carrying()) {
      return this.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages.handsFull;
    }
    return this.handHold.moveRefusal(
      item,
      from.kind === 'hand' ? from.side : undefined,
      target.kind === 'hand' ? target.side : undefined,
    );
  }

  private canMoveDisplaced(item: Item, from: Location, source: Location): boolean {
    if (from.kind === 'work' || from.kind === 'slot' || from.kind === 'vehicle' || chargingBattery(from)) {
      return false;
    }
    const sourceTarget = this.targetForLocation(source);
    if (this.handMoveRefusal(item, from, sourceTarget)) {
      return false;
    }
    const sourcePlace = this.placeOf(from);
    const destinationPlace = this.targetPlace(sourceTarget);
    if (!(this.reachable(sourcePlace) && this.reachable(destinationPlace))) {
      return false;
    }
    if (this.accessRefusal(sourcePlace, destinationPlace)) {
      return false;
    }
    const { light } = defOf(this.registry, item.type);
    if (!item.on || light?.burning?.stow !== 'refuse') {
      return true;
    }
    return !(source.kind !== 'hand' && source.kind !== 'pile');
  }

  private swapTargetSpot(target: Target, otherFrom: Location): Spot | undefined {
    if (!(this.isGridTarget(target) && target.at && 'placed' in otherFrom)) {
      return undefined;
    }
    return { x: otherFrom.placed.x, y: otherFrom.placed.y, rotated: target.at.rotated };
  }

  private fitsSwapPlace({
    item,
    target,
    spot,
    from,
    projected,
  }: {
    item: Item;
    target: Target;
    spot: Spot | undefined;
    from: Location;
    projected?: { item: Item; spot: Spot } | undefined;
  }): boolean {
    if (this.isGridTarget(target)) {
      return spot ? this.fitsSwapGrid(item, target, spot, projected) : false;
    }
    if (target.kind === 'worn') {
      return (
        from.kind === 'worn' && wornSlotOf(this.registry, item) === from.slot && !this.shoulderRefusal(from.slot, item)
      );
    }
    return target.kind === 'hand';
  }

  private itemAtTarget(target: Target, item: Item): Item | undefined {
    switch (target.kind) {
      case 'hand':
        return this.hands[target.side];
      case 'worn': {
        const slot = wornSlotOf(this.registry, item);
        return slot ? this.worn[slot] : undefined;
      }
      default:
        return target.at
          ? itemAt(this.registry, this.gridOf(target).placed, target.at.x, target.at.y)?.item
          : undefined;
    }
  }

  private isGridTarget(target: Target): target is Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }> {
    return target.kind === 'pocket' || target.kind === 'pile' || target.kind === 'furniture';
  }

  private fitsSwapGrid(
    item: Item,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
    spot: Spot,
    projected?: { item: Item; spot: Spot },
  ): boolean {
    if ((target.kind === 'pocket' && target.owner === item) || this.nestingRefusal(item, target)) {
      return false;
    }
    const displaced = this.itemAtTarget(target, item);
    if (!displaced || displaced === item) {
      return false;
    }
    const grid = this.gridOf(target);
    const placed = grid.placed.filter(({ item: existing }) => existing !== item && existing !== displaced);
    if (projected) {
      placed.push({ item: projected.item, ...projected.spot });
    }
    return couldFit(this.registry, grid.size, item) && fitsAt(this.registry, { ...grid, placed }, item, spot);
  }

  private swapHandsFit(swap: {
    item: Item;
    otherItem: Item;
    from: Location;
    target: Target;
    otherFrom: Location;
  }): boolean {
    const { item, otherItem, from, target, otherFrom } = swap;
    const hands = { ...this.hands };
    if (from.kind === 'hand') {
      delete hands[from.side];
    }
    if (otherFrom.kind === 'hand') {
      delete hands[otherFrom.side];
    }
    if (target.kind === 'hand') {
      hands[target.side] = item;
    }
    if (from.kind === 'hand') {
      hands[from.side] = otherItem;
    }
    for (const side of SIDES) {
      const held = hands[side];
      const otherHeld = hands[other(side)];
      if (held?.work && side !== dominantSide(this.character)) {
        return false;
      }
      if (held && this.handPairRefusal(held, otherHeld)) {
        return false;
      }
    }
    return true;
  }

  private moveSwap(swap: {
    item: Item;
    otherItem: Item;
    from: Location;
    target: Target;
    plan: Extract<Plan, { ok: true }>;
  }): Plan {
    const { item, otherItem, from, target, plan } = swap;
    const otherFrom = this.locate(otherItem);
    if (!otherFrom) {
      return coreRefusal(this.registry, 'gone');
    }
    const sourceTarget = this.targetForLocation(from);
    const itemOrigin = this.quickbarOriginOf(item, from);
    const otherOrigin = this.quickbarOriginOf(otherItem, otherFrom);
    const itemTarget = this.isGridTarget(target) && plan.at ? { ...target, at: plan.at } : target;
    this.remove(from);
    this.remove(otherFrom);
    this.countSwapLoot(item, from, target);
    this.countSwapLoot(otherItem, otherFrom, sourceTarget);
    this.put(item, itemTarget, plan.at);
    this.put(
      otherItem,
      sourceTarget,
      'placed' in from ? { x: from.placed.x, y: from.placed.y, rotated: from.placed.rotated } : undefined,
    );
    this.restoreQuickbarOrigin(item, itemTarget, itemOrigin);
    this.restoreQuickbarOrigin(otherItem, sourceTarget, otherOrigin);
    this.version += 1;
    return plan;
  }

  private quickbarOriginOf(item: Item, from: Location): TargetState | undefined {
    if (from.kind === 'hand') {
      return this.quickbarOrigins.get(item.uid);
    }
    return this.targetState(this.targetForLocation(from));
  }

  private countSwapLoot(item: Item, from: Location, target: Target): void {
    if (from.kind === 'furniture' && target.kind !== 'furniture') {
      this.countLooted(item);
    }
  }

  private restoreQuickbarOrigin(item: Item, target: Target, origin: TargetState | undefined): void {
    if (target.kind === 'hand' && origin) {
      this.quickbarOrigins.set(item.uid, structuredClone(origin));
    } else {
      this.quickbarOrigins.delete(item.uid);
    }
  }

  private handPlacement(item: Item, side: HandSide, from: Location): Plan {
    if (item.work && side !== dominantSide(this.character)) {
      return coreRefusal(this.registry, 'workHand');
    }
    if (from.kind === 'hand' && from.side === side) {
      return coreRefusal(this.registry, 'alreadyInHand');
    }
    const held = this.hands[side];
    if (held && held !== item) {
      const key = side === 'right' ? 'rightHandHolding' : 'leftHandHolding';
      return coreRefusal(this.registry, key, { item: this.name(held).toLowerCase() });
    }
    const conflict = this.handPairRefusal(item, this.hands[other(side)]);
    return conflict ? refuse(conflict) : { ok: true, time: 0 };
  }

  private handPairRefusal(item: Item, otherHeld: Item | undefined): string | undefined {
    const busy = otherHeld && otherHeld !== item;
    if (busy && defOf(this.registry, otherHeld.type).twoHanded) {
      return coreMessage(this.registry, 'otherNeedsBothHands', { item: this.name(otherHeld).toLowerCase() });
    }
    if (busy && defOf(this.registry, item.type).twoHanded) {
      return coreMessage(this.registry, 'needsBothHands');
    }
    return undefined;
  }

  private pilePlacements(pos: Vec3): Placed[] {
    return this.pileAt(pos)?.items ?? [];
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
        return { size: PILE_GRID, placed: this.pilePlacements(target.pos) };
    }
  }

  private nestingRefusal(
    item: Item,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
  ): string | undefined {
    const hasNestedContents = item.work !== undefined || (item.pockets ?? []).some((pocket) => pocket.length > 0);
    if (target.kind !== 'pile' && hasNestedContents && !defOf(this.registry, item.type).container?.rigid) {
      return coreMessage(this.registry, 'softBagNested');
    }
    if (target.kind !== 'pocket') {
      return undefined;
    }
    if (hasNestedContents && defOf(this.registry, target.owner.type).container?.rigid) {
      return coreMessage(this.registry, 'loadedInHardCase');
    }
    return this.filledContainerRefusal(target.owner);
  }

  // Filling an already packed container must obey the same rule as packing it after filling.
  private filledContainerRefusal(container: Item): string | undefined {
    let owner = container;
    let location = this.locate(owner);
    while (location?.kind === 'pocket' || location?.kind === 'furniture') {
      if (!defOf(this.registry, owner.type).container?.rigid) {
        return coreMessage(this.registry, 'softBagNested');
      }
      if (location.kind === 'furniture') {
        break;
      }
      if (defOf(this.registry, location.owner.type).container?.rigid) {
        return coreMessage(this.registry, 'loadedInHardCase');
      }
      ({ owner } = location);
      location = this.locate(owner);
    }
    return undefined;
  }

  private gridPlacement(
    item: Item,
    count: number,
    grid: GridState,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
  ): Plan {
    const { at } = target;
    const nesting = this.nestingRefusal(item, target);
    if (nesting) {
      return refuse(nesting);
    }
    if (!couldFit(this.registry, grid.size, item)) {
      return coreRefusal(this.registry, 'tooBig');
    }
    const joins = (p: Placed | undefined) =>
      p !== undefined && stackRoom(this.registry, p.item, item, this.sameFood) >= count;
    // Moving a whole item within its grid frees its own cells; moving part of a stack doesn't.
    const ignore = count === item.count ? item : undefined;
    if (at) {
      const under = itemAt(this.registry, grid.placed, at.x, at.y);
      if (under && joins(under)) {
        return { ok: true, time: 0, merge: under.item };
      }
      return fitsAt(this.registry, grid, item, { ...at, ignore })
        ? { ok: true, time: 0, at }
        : coreRefusal(this.registry, 'noRoomThere');
    }
    const stack = grid.placed.find(joins);
    if (stack) {
      return { ok: true, time: 0, merge: stack.item };
    }
    const spot = findSpot(this.registry, grid, item, ignore);
    return spot ? { ok: true, time: 0, at: spot } : coreRefusal(this.registry, 'noRoom');
  }

  transform(item: Item, type: string, food: { kind: 'same' | 'remove' } | { kind: 'new'; calendar: number }): void {
    const exposure = initialFoodExposure(
      this.registry,
      defOf(this.registry, type),
      food.kind === 'new' ? food.calendar : 0,
    );
    if (food.kind === 'same' && Boolean(item.foodExposure) !== Boolean(exposure)) {
      throw new Error('Same-serving transform cannot change perishability');
    }
    if (food.kind === 'remove' && exposure) {
      throw new Error('Food removal cannot create a perishable serving');
    }
    if (food.kind !== 'same') {
      item.foodExposure = undefined;
      item.madeAtGameTimestamp = undefined;
      if (exposure && food.kind === 'new') {
        item.foodExposure = exposure;
        item.madeAtGameTimestamp = food.calendar;
      }
    }
    item.type = type;
    this.version += 1;
  }

  /** Uses up `count` of an item wherever it is: eaten, burnt, loaded into something. */
  consume(item: Item, count = 1): boolean {
    const at = this.locate(item);
    if (
      !at ||
      item.work ||
      at.kind === 'work' ||
      at.kind === 'slot' ||
      at.kind === 'vehicle' ||
      chargingBattery(at) ||
      count > item.count
    ) {
      return false;
    }
    if (count < item.count) {
      item.count -= count;
      if (item.lootedCount !== undefined) {
        item.lootedCount = Math.min(item.lootedCount, item.count);
      }
    } else {
      this.remove(at);
      this.quickbarOrigins.delete(item.uid);
    }
    this.version += 1;
    return true;
  }

  /** The item a place-level location holds; owned locations (work, slot, vehicle) never leave through `remove`. */
  private occupant(from: Location): Item | undefined {
    if ('placed' in from) {
      return from.placed.item;
    }
    if (from.kind === 'hand') {
      return this.hands[from.side];
    }
    return from.kind === 'worn' ? this.worn[from.slot] : undefined;
  }

  private remove(from: Location): void {
    const leaving = this.occupant(from);
    if (leaving) {
      this.settleFood(leaving, from);
    }
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
      case 'vehicle':
        throw new Error('A fitted part is owned by its vehicle');
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
    this.settleFood(item, undefined);
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
    const targetUid = work?.repairTarget?.kind === 'item' ? work.repairTarget.uid : undefined;
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

const validateInventoryTree = (registry: Registry, state: InventoryState, vehicles: VehicleInstancesState): void => {
  itemIds(savedItemTree(state, vehicles), state.nextItemUid);
  const tree = [...savedItemTree(state, vehicles)];
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
    assertSavedLiquidContents(registry, item);
    const def = defOf(registry, item.type);
    const container =
      item.cargo && def.vehicle?.cargoSpace ? cargoGrid(item.cargo, def.vehicle.cargoSpace) : def.container;
    pockets(item.type, item.pockets, container?.pockets);
    if (defOf(registry, item.type).workInProgress && !item.work) {
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
    (recipe.kind === 'repair') !== (work.repairTarget !== undefined && work.repairAmount !== undefined) ||
    (work.repairTarget === undefined) !== (work.repairAmount === undefined) ||
    (work.repairTarget !== undefined &&
      (!(['item', 'entity'].includes(work.repairTarget.kind) && Number.isSafeInteger(work.repairTarget.uid)) ||
        work.repairTarget.uid < 1 ||
        (work.repairTarget.kind === 'entity') !== (recipe.repair?.entity !== undefined))) ||
    (work.repairAmount !== undefined &&
      (!Number.isFinite(work.repairAmount) ||
        work.repairAmount <= 0 ||
        (work.repairTarget?.kind === 'item' && work.repairAmount > 1)))
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
  if (!(source.disassembly || source.salvage)) {
    throw new Error('Invalid disassembly work payload');
  }
  const duration = disassemblyWorkTime(source);
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
    !defOf(registry, item.type).workInProgress ||
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
  at.kind === 'hand' || at.kind === 'worn' || at.kind === 'work' || at.kind === 'slot' || at.kind === 'vehicle'
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
      return coreLabel(inventory.registry, target.side === 'right' ? 'toRightHand' : 'toLeftHand');
    case 'worn':
      return coreLabel(inventory.registry, 'toWorn');
    case 'pocket': {
      const pocket = defOf(inventory.registry, target.owner.type).container?.pockets[target.pocket];
      const name = inventory.name(target.owner);
      return pocket?.name ? coreLabel(inventory.registry, 'pocket', { container: name, pocket: pocket.name }) : name;
    }
    case 'furniture':
      return inventory.entities.defOf(target.entity).name.toLowerCase();
    default:
      return coreLabel(inventory.registry, 'toFloor');
  }
};
