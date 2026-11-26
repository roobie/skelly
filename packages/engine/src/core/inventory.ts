// What the player holds and wears, the piles on the ground, and what's in furniture.
// Moves are planned first (does it fit, how long does it take) and applied when the
// handling time is up (handling.ts). `packages/deadvox/DESIGN.md`, "Items and inventory"; `packages/deadvox/DESIGN.md`, "Hands".

import type { CellRepair } from './blockDamage.ts';
import { BlockEntities, type BlockEntity } from './blockEntities.ts';
import { claimed } from './capabilities.ts';
import { cargoGrid, cargoSpaceItem, fitIssue } from './cargoSpace.ts';
import { DEFAULT_HANDED_CHARACTER, dominantSide, type HandedCharacter } from './character.ts';
import { compareCodeUnits } from './codeUnitOrder.ts';
import type { ItemDef, RecipeDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type CoreMessageKey, coreLabel, coreMessage, coreRefusal } from './coreText.ts';
import type { WorkPlan } from './crafting.ts';
import {
  disassemblyLiquidOutputs,
  disassemblyOutputs,
  disassemblyWorkTime,
  pieceDisassemblyOutputs,
  pieceRecoveryWork,
  sameDisassemblyOutputs,
  validDisassemblyToolLevels,
  validPieceToolLevels,
} from './disassembly.ts';
import { isLongGun, slingFitted } from './firearmFitting.ts';
import {
  equalFoodExposure,
  FOOD_EXPOSURE_DENOMINATOR,
  type FoodExposure,
  initialFoodExposure,
  projectFoodExposure,
  sameFoodExposure,
} from './food.ts';
import { furnitureSurfacePosition } from './furnitureSurface.ts';
import { type Holder, holderRefusal, instanceName, packed } from './holders.ts';
import { type HousingPart, type HousingSlotView, housingBlueprint, slotAccepts } from './housing.ts';
import { PILE_GRID } from './inventoryScale.ts';
import {
  assertSavedLiquidContents,
  cellCount,
  containerRoom,
  copyWorkTarget,
  couldFit,
  craftComponentEligible,
  defOf,
  findSpot,
  fitsAt,
  type GridSize,
  type Item,
  ItemFactory,
  type ItemState,
  isEmpty,
  itemAt,
  type Placed,
  type PlacedState,
  repairCeiling,
  repairedCondition,
  restoreItem,
  restorePlaced,
  type StorageLayout,
  sameRecoveryState,
  snapshotItem,
  snapshotPlaced,
  stackRoom,
  weightOf,
} from './items.ts';
import { itemIds, itemRoots, savedItemTree, subtreeItems, type TreeLocation, walkItemTree } from './itemTree.ts';
import {
  type LiquidAmount,
  type LiquidRecoveryChoices,
  type LiquidTransferPlan,
  type LiquidTransferRefusal,
  planLiquidDraw,
  planLiquidReceive,
  planLiquidTransfer,
  validLiquidRecoveryChoices,
} from './liquids.ts';
import type { Rolled } from './loot.ts';
import { knownItemSlot, slotsReason } from './magazine.ts';
import { type Modifier, modified } from './modifiers.ts';
import { countText, volumeText } from './numberText.ts';
import type { PartServicePlan } from './partService.ts';
import { type CellDisassemblyPlan, type RubbleClearing, rubbleClearWork } from './rubble.ts';
import type { WearSlot } from './schema.ts';
import type { FurnitureSpawn } from './site.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from './skillLevels.ts';
import { freezeSnapshot } from './snapshotData.ts';
import { slotRefusal } from './stowage.ts';
import { placeFitting } from './vehicleBlueprint.ts';
import {
  copyVehicleFitting,
  copyVehiclePlacement,
  copyVehicleWorkPlacement,
  sameVehiclePlacement,
  shutAway,
  type VehicleInstance,
  VehicleInstances,
  type VehicleInstancesState,
  type VehicleWorkPlacement,
  type VehicleWorkTarget,
  validVehicleWorkPlacement,
} from './vehicleInstances.ts';
import { copyWorldDestination, validWorldDestination } from './worldDestination.ts';
import type { WorldPlacement } from './worldPlacement.ts';

export const handlingWeights = (registry: Registry) => claimed(registry.inventory, 'player')!.handling;

export const wornSlotOf = (registry: Registry, item: Pick<Item, 'type'>): WearSlot | undefined => {
  const def = defOf(registry, item.type);
  return isLongGun(def) ? claimed(registry.wearSlots, 'slungLongGun')?.id : def.wearable?.slot;
};

// Persistence checks eligibility, not whether the character can perform an equip action now.
export const wornOccupancyIssue = (registry: Registry, slot: WearSlot, item: Item | ItemState): string | undefined => {
  const definition = registry.wearSlots.get(slot);
  if (!definition) {
    return 'unknown wear slot';
  }
  const def = registry.items.get(item.type);
  if (!def) {
    return 'unknown worn item';
  }
  if (definition.capability?.includes('slungLongGun')) {
    if (!isLongGun(def) || def.wearable) {
      return 'not a slung long gun';
    }
    return slingFitted(item) ? undefined : 'needsSling';
  }
  return !isLongGun(def) && def.wearable?.slot === slot ? undefined : 'wrong wear slot';
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

/** List drops pin a stack's UID so delayed handling rechecks the same record without inventing cell geometry. */
export type TargetState =
  | { kind: 'hand'; side: HandSide }
  | { kind: 'worn' }
  | { kind: 'pocket'; ownerUid: number; pocket: number; at?: Spot; ontoUid?: number; reserved?: true }
  | { kind: 'pile'; pos: Vec3; at?: Spot; ontoUid?: number; reserved?: true }
  | { kind: 'furniture'; entityUid: number; pocket: number; at?: Spot; ontoUid?: number; reserved?: true };

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
  | { kind: 'pocket'; owner: Item; pocket: number; at?: Spot; ontoUid?: number; reserved?: true }
  | { kind: 'pile'; pos: Vec3; at?: Spot; ontoUid?: number; reserved?: true }
  | { kind: 'furniture'; entity: BlockEntity; pocket: number; at?: Spot; ontoUid?: number; reserved?: true };

export interface VehicleTransfer {
  placement: VehicleWorkPlacement;
  kind: 'install' | 'remove';
  vehicleId: number;
  fittingId: string;
  itemUid: number;
  output?: Target;
}

/** One part between a housing slot (`BlockEntities.housingView`) and an ordinary owner. */
export type HousingTransfer =
  | { readonly kind: 'remove'; readonly entityUid: number; readonly slot: string; readonly output: Target }
  | { readonly kind: 'fit'; readonly entityUid: number; readonly slot: string; readonly itemUid: number };

/** Every work kind starts its progress the same way; `length` is the work payload's full duration. */
const unstarted = (length: number): Pick<NonNullable<Item['work']>, 'elapsed' | 'duration'> => ({
  elapsed: 0,
  duration: length,
});

/** Where a released job's things land; `retirePiece` is the world's remover for a finished take-apart's piece. */
export interface WorkRelease {
  feet: Vec3;
  calendar?: number;
  retirePiece?: (entity: BlockEntity) => string | undefined;
  /** Removes the named boarding while keeping its host in place. */
  removeBoarding?: (entity: BlockEntity, boarding: string) => string | undefined;
  /** Clears the rubble cell a finished take-apart names; a refusal keeps the job, paused, to finish once it clears. */
  clearRubble?: (cell: Readonly<Vec3>, epoch: number) => string | undefined;
}

type Place =
  | { kind: 'pile'; pile: Pile }
  | { kind: 'furniture'; entity: BlockEntity }
  | { kind: 'vehicle'; origin: Vec3; vehicleId: number; fittingId: string };

export type Plan =
  | { ok: true; durationSimSeconds: number; merge?: Item; at?: Spot; swap?: Item }
  | { ok: false; reason: string; key?: CoreMessageKey };

export const SIDES: readonly HandSide[] = ['right', 'left'];
const other = (side: HandSide): HandSide => (side === 'right' ? 'left' : 'right');
const pileKey = (pos: Readonly<Vec3>) => pos.join(',');
const refuse = (reason: string): Plan => ({ ok: false, reason });
const spotPart = ({ at, ontoUid, reserved }: { at?: Spot; ontoUid?: number; reserved?: true }) => ({
  ...(at ? { at: { ...at } } : {}),
  ...(ontoUid === undefined ? {} : { ontoUid }),
  ...(reserved ? { reserved } : {}),
});

/** Why an item can't leave where it is, whatever the target. */
const chargingBattery = (from: Location): boolean =>
  from.kind === 'furniture' && from.entity.charging?.batteryUid === from.placed.item.uid;

/** A part an assembly owns leaves it only through that assembly's transfer, never as a craft input. */
const assemblyPart = (from: Location): boolean => from.kind === 'vehicle' || from.kind === 'housing';

const heldInPlace = (registry: Registry, item: Item, from: Location): string | undefined => {
  if (from.kind === 'work' || from.kind === 'pieceWork' || chargingBattery(from)) {
    return coreMessage(registry, 'inWork');
  }
  if (from.kind === 'slot' || from.kind === 'housing') {
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
  if (value.ontoUid !== undefined && (!Number.isSafeInteger(value.ontoUid) || (value.ontoUid as number) < 1)) {
    return false;
  }
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
  readonly worn: Partial<Record<WearSlot, Item>> = Object.create(null);
  readonly piles = new Map<string, Pile>();
  /** What's been taken out of furniture, by item type: the death screen's looting summary. */
  readonly looted = new Map<string, number>();
  private readonly quickbarOrigins = new Map<number, TargetState>();
  readonly entities: BlockEntities;
  readonly vehicles = new VehicleInstances();
  /** Goes up on every change, so views know when to redraw. */
  version = 0;
  /** Whether a pile's block is within reach; the game sets it from the player's position. */
  canReach: (pos: Readonly<Vec3>) => boolean = () => true;
  /** Whether a vehicle is within reach; the game sets it from the player's position and the vehicle's parts. */
  canReachVehicle: (vehicleId: number) => boolean = () => true;
  /** Whether a piece of furniture is within reach. */
  canReachEntity: (entity: BlockEntity) => boolean = () => true;
  /** Whether a terrain cell is within reach; the game sets it from the player's position. */
  canReachCell: (cell: Readonly<Vec3>) => boolean = () => true;
  /** The world's say over repairing a damaged terrain cell; the game binds it to its world, so cell work refuses without it. */
  cellRepair: CellRepair | undefined;
  buried: () => boolean = () => false;
  worldPlacement: WorldPlacement | undefined;
  /** The world's say over clearing a rubble cell; the game binds it to its world, so cell work refuses without it. */
  rubble: RubbleClearing | undefined;
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

  /** Planning gets independent owners and allocators, including vehicle-owned item trees. */
  project(): Inventory {
    const projected = Inventory.restoreState(this.registry, this.snapshotState(), undefined, {
      character: this.character,
      vehicles: this.vehicles.snapshotState(),
    });
    const foodAt = this.foodClock();
    projected.foodClock = () => foodAt;
    projected.foodRate = this.foodRate;
    return projected;
  }

  /**
   * Planning owners for only the furniture origins and piles at these blocks, with the live allocators: all that
   * furnishing there can meet, at a cost that does not grow with the world. Whole-tree validation is skipped because
   * a slice of valid owners may hold one end of a cross-owner reference.
   */
  projectAt(blocks: readonly Readonly<Vec3>[]): Inventory {
    const projected = new Inventory(
      this.registry,
      new ItemFactory(this.factory.next),
      BlockEntities.restoreState(this.registry, this.entities.snapshotAt(blocks)),
      this.character,
    );
    for (const pos of blocks) {
      const pile = this.piles.get(pileKey(pos));
      if (pile) {
        projected.piles.set(pileKey(pos), {
          pos: [...pile.pos],
          items: pile.items.map((placed) => restorePlaced(this.registry, snapshotPlaced(placed))),
        });
      }
    }
    const foodAt = this.foodClock();
    projected.foodClock = () => foodAt;
    projected.foodRate = this.foodRate;
    return projected;
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
      vehicles: vehiclesState = { nextId: 1, instances: [], ended: [] },
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
    const { kind, vehicleId, fittingId, itemUid, placement } = request;
    const refusal = this.vehiclePlacementRefusal(vehicleId, { id: fittingId, ...placement }, itemUid);
    if (refusal) {
      return refusal;
    }
    const vehicle = this.vehicles.get(vehicleId)!;
    const item = this.itemByUid(itemUid)!;
    return kind === 'install'
      ? this.installVehiclePart(vehicle, { id: fittingId, ...copyVehicleWorkPlacement(placement) }, item, vehicleId)
      : this.removeVehiclePart(vehicle, item, request);
  }

  /**
   * Moves one part between a standing housing's slot and an ordinary owner. The destination is admitted before either
   * owner changes, so a refusal changes neither and allocates nothing.
   */
  housingTransfer(request: HousingTransfer): string | undefined {
    const entity = this.entities.byUid(request.entityUid);
    const view =
      entity && this.entities.stands(entity)
        ? this.entities.housingView(entity).find(({ slot }) => slot === request.slot)
        : undefined;
    if (!(entity && view)) {
      return coreMessage(this.registry, 'gone');
    }
    return request.kind === 'remove'
      ? this.takeHoused(entity, view, request.output)
      : this.fitHoused(entity, view, request.itemUid);
  }

  /** An untouched part is admitted as a scratch copy under the next item id, which materialising then gives it. */
  private housedCandidate(entity: BlockEntity, slot: string, part: HousingPart): Item {
    const stored = entity.housing?.find((entry) => entry.slot === slot)?.item;
    return (
      stored ?? new ItemFactory(this.factory.next).create(this.registry, part.type, 1, { condition: part.condition })
    );
  }

  /** Takes the admitted part out of its slot; a stored part settles its food clock as it leaves. */
  private takeAdmittedPart(entity: BlockEntity, slot: string): Item {
    const stored = entity.housing?.find((entry) => entry.slot === slot)?.item;
    if (stored) {
      this.settleFood(stored, this.locate(stored));
    }
    return this.entities.takeHousingPart(entity, slot, this.factory);
  }

  private takeHoused(entity: BlockEntity, { slot, part }: HousingSlotView, output: Target): string | undefined {
    if (!part) {
      return coreMessage(this.registry, 'gone');
    }
    const placement = this.planAdd(this.housedCandidate(entity, slot, part), output);
    if (!placement.ok) {
      return placement.reason;
    }
    const item = this.takeAdmittedPart(entity, slot);
    if (placement.merge) {
      this.mergeStack(placement.merge, item);
    } else {
      this.put(item, output, placement.at);
    }
    this.version += 1;
    return undefined;
  }

  private fitHoused(entity: BlockEntity, { slot, part }: HousingSlotView, itemUid: number): string | undefined {
    const item = this.itemByUid(itemUid);
    // An occupied slot is refused like an occupied vehicle site (`installVehiclePart`).
    if (!item || part) {
      return coreMessage(this.registry, 'gone');
    }
    const def = housingBlueprint(this.registry, entity.type)!.slots.find(({ id }) => id === slot)!;
    if (!slotAccepts(def, item)) {
      return coreMessage(this.registry, 'partDoesNotFit');
    }
    const held = this.fittingSourceRefusal(item);
    if (held) {
      return held;
    }
    this.remove(this.locate(item)!);
    this.quickbarOrigins.delete(item.uid);
    this.entities.fitHousingPart(entity, slot, item);
    this.version += 1;
    return undefined;
  }

  /**
   * Why an item can't leave where it is to be fitted into a vehicle site or a housing slot. Asked before the
   * receiving owner publishes it, since only an item its owner lets go of can then leave through `remove`.
   */
  fittingSourceRefusal(item: Item): string | undefined {
    const from = this.locate(item);
    return from ? heldInPlace(this.registry, item, from) : coreMessage(this.registry, 'gone');
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

  private endVehicle(vehicleId: number): string | undefined {
    try {
      this.vehicles.end(vehicleId);
      return undefined;
    } catch {
      return coreMessage(this.registry, 'gone');
    }
  }

  private vehicleBuild(vehicle: VehicleInstance, fittings: VehicleInstance['fittings']): VehicleInstance {
    return {
      ...vehicle,
      origin: [...vehicle.origin],
      sites: vehicle.sites.map(copyVehiclePlacement),
      fittings: fittings.map((entry) => copyVehicleFitting(entry, entry.item)),
    };
  }

  private installVehiclePart(
    vehicle: VehicleInstance,
    placement: VehicleInstance['sites'][number],
    item: Item,
    vehicleId: number,
  ): string | undefined {
    const from = this.locate(item);
    if (!from || from.kind === 'vehicle' || vehicle.fittings.some(({ id }) => id === placement.id)) {
      return coreMessage(this.registry, 'gone');
    }
    const held = this.fittingSourceRefusal(item);
    if (held) {
      return held;
    }
    const refusal = this.replaceVehicle(
      vehicleId,
      this.vehicleBuild(vehicle, [...vehicle.fittings, { ...copyVehiclePlacement(placement), item }]),
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
    const kept = vehicle.fittings.filter((entry) => entry !== fitted);
    // The last part out ends the build: an assembly is its parts, so none left means no vehicle left.
    const refusal =
      kept.length === 0
        ? this.endVehicle(vehicleId)
        : this.replaceVehicle(vehicleId, this.vehicleBuild(vehicle, kept), 'partSupportsOthers');
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
    const target =
      vehicle?.fittings.find(({ id }) => id === fittingId) ?? vehicle?.sites.find(({ id }) => id === fittingId);
    return target ? this.vehiclePlacementService(vehicleId, target, itemUid) : undefined;
  }

  vehiclePlacementService(
    vehicleId: number,
    target: VehicleWorkTarget,
    itemUid: number,
  ): ReturnType<Inventory['vehicleService']> {
    if (this.vehiclePlacementRefusal(vehicleId, target, itemUid)) {
      return undefined;
    }
    const site = this.vehicles.get(vehicleId)!.sites.find(({ id }) => id === target.id);
    const part = this.registry.items.get(this.itemByUid(itemUid)!.type)!.vehicle!;
    return site?.service ?? part.service;
  }

  private supportsVehiclePlacement(
    vehicle: VehicleInstance,
    target: VehicleWorkPlacement,
    part: NonNullable<ItemDef['vehicle']>,
  ): boolean {
    return (
      (!part.addon || target.supportedBy.length > 0) &&
      target.supportedBy.every((support) =>
        vehicle.fittings.some(
          ({ id, item }) =>
            id === support &&
            (!part.addon || this.registry.items.get(item.type)?.vehicle?.capabilities.includes(part.addon.requires)),
        ),
      )
    );
  }

  vehiclePlacementRefusal(vehicleId: number, target: VehicleWorkTarget, itemUid: number): string | undefined {
    const vehicle = this.vehicles.get(vehicleId);
    const item = this.itemByUid(itemUid);
    const part = item && this.registry.items.get(item.type)?.vehicle;
    const site = vehicle?.sites.find(({ id }) => id === target.id);
    const service = site?.service ?? part?.service;
    if (!(vehicle && item && service)) {
      return coreMessage(this.registry, 'gone');
    }
    if (
      !validVehicleWorkPlacement(target) ||
      item.count !== 1 ||
      part?.mount !== service.mount ||
      vehicle.fittings.some(({ id, item: owned }) => id === target.id && owned.uid !== itemUid) ||
      (site?.service && !sameVehiclePlacement(site, target))
    ) {
      return coreMessage(this.registry, 'partDoesNotFit');
    }
    if (!this.supportsVehiclePlacement(vehicle, target, part)) {
      return coreMessage(this.registry, 'partNeedsSupport');
    }
    const fitted = vehicle.fittings.find(({ item: owned }) => owned.uid === itemUid);
    if (fitted && (fitted.id !== target.id || !sameVehiclePlacement(fitted, target))) {
      return coreMessage(this.registry, 'partDoesNotFit');
    }
    if (!(site?.service || part.addon)) {
      return coreMessage(this.registry, 'partDoesNotFit');
    }
    const present = vehicle.fittings
      .filter(({ item: owned }) => owned.uid !== itemUid)
      .map((entry) =>
        placeFitting(this.registry, {
          id: entry.id,
          ...copyVehicleWorkPlacement(entry),
          part: entry.item.type,
          ...(entry.item.cargo ? { cargo: [...entry.item.cargo] } : {}),
        }),
      );
    const candidate = placeFitting(this.registry, {
      ...target,
      part: item.type,
      ...(item.cargo ? { cargo: [...item.cargo] } : {}),
    });
    return fitIssue(present, candidate, claimed(this.registry.inventory, 'player')!.cellMetres)
      ? coreMessage(this.registry, 'partDoesNotFit')
      : undefined;
  }

  registerVehicle(
    spec: Pick<VehicleInstance, 'placementKey' | 'origin' | 'facing'> & { readonly blueprint: string },
    absent: readonly string[] = [],
    wear: Readonly<Record<string, number>> = {},
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
        .map((fitting) => {
          const item = fitting.cargo
            ? cargoSpaceItem(this.factory, this.registry, fitting.part, fitting.cargo)
            : this.factory.create(this.registry, fitting.part);
          if (fitting.finish !== undefined) {
            item.finish = fitting.finish;
          }
          const worn = wear[fitting.id];
          if (worn !== undefined) {
            item.condition = 1 - worn;
          }
          this.stowLoadOut(item, fitting.stowed ?? {});
          return { ...copyVehiclePlacement(fitting), item };
        }),
    };
    const vehicleId = this.vehicles.add(this.registry, vehicle);
    this.version += 1;
    return vehicleId;
  }

  /** A factory load-out is required stock, so a slot that will not seat its item throws. */
  private stowLoadOut(owner: Item, stowed: Readonly<Record<string, string>>): void {
    const pockets = defOf(this.registry, owner.type).container?.pockets ?? [];
    for (const [slot, type] of Object.entries(stowed)) {
      const pocket = pockets.findIndex((spec) => spec.slot === slot);
      if (pocket < 0 || !this.add(this.factory.create(this.registry, type), { kind: 'pocket', owner, pocket })) {
        throw new Error(`"${owner.type}" slot "${slot}" does not seat its load-out "${type}"`);
      }
    }
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
      if (wear === 1) {
        // A fixture starts at a retained ruin, not at a new destruction event that releases its internals. The ruin is
        // a crush, the kind a collapse under its own weight deals.
        this.entities.bash(entity, { strength: this.entities.defOf(entity).breach.durability, kind: 'crush' });
      } else {
        this.entities.wear(entity, wear);
      }
    }
    return entity;
  }

  /** The rolled item, filled into its holder when it comes packaged. */
  createRolled({ holder, ...rolled }: Rolled): Item {
    const item = this.rolledItem(rolled);
    return holder === undefined ? item : packed(this.factory, this.registry, holder, item);
  }

  private rolledItem({
    type,
    count,
    condition,
    paperMap,
    fitted,
    charge,
    craftedLiquids,
    liquidContents,
    cartridges,
    fittedCartridges,
  }: Omit<Rolled, 'holder'>): Item {
    const item = this.factory.create(this.registry, type, count, {
      condition,
      ...(paperMap === undefined ? {} : { paperMap }),
    });
    if (cartridges !== undefined) {
      item.cartridges = [...cartridges];
    }
    if (craftedLiquids !== undefined) {
      item.craftedLiquids = craftedLiquids.map((amount) => ({ ...amount }));
    }
    if (liquidContents !== undefined) {
      item.liquidContents = { ...liquidContents };
    }
    for (const [slot, child] of Object.entries(fitted ?? {})) {
      this.fitSlot(item, slot, this.create(child));
    }
    for (const [slot, rounds] of Object.entries(fittedCartridges ?? {})) {
      item.slots![slot]!.cartridges = [...rounds];
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
          ...(spotOf(location) ? { at: spotOf(location)! } : {}),
        };
      case 'pile':
        return {
          kind: 'pile',
          pos: [...location.pile.pos],
          ...(spotOf(location) ? { at: spotOf(location)! } : {}),
        };
      case 'furniture':
        return {
          kind: 'furniture',
          entity: location.entity,
          pocket: location.pocket,
          ...(spotOf(location) ? { at: spotOf(location)! } : {}),
        };
      case 'work':
        throw new Error('Work inputs have no independent target');
      case 'pieceWork':
        throw new Error('A world job has no independent target');
      case 'slot':
      case 'vehicle':
      case 'housing':
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
    const knownSlot = knownItemSlot(this.registry, owner.type, slot);
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
    return instanceName(this.registry, item);
  }

  pileAt(pos: Readonly<Vec3>): Pile | undefined {
    return this.piles.get(pileKey(pos));
  }

  buryPile(pos: Readonly<Vec3>): ReturnType<typeof snapshotPlaced>[] {
    const pile = this.pileAt(pos);
    if (!pile) {
      return [];
    }
    const buried = pile.items.map((placed) => snapshotPlaced(placed, this.foodClock()));
    for (const placed of [...pile.items]) {
      this.remove({ kind: 'pile', pile, placed });
    }
    this.version += 1;
    return buried;
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
    if (!spec.grid) {
      throw new Error(`${owner.type} pocket ${pocket} is a pile`);
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

  private liquidEndpointRefusal(item: Item): LiquidTransferRefusal | undefined {
    const at = this.locate(item);
    if (!at) {
      return 'missing-endpoint';
    }
    const place = this.placeOf(at);
    if (!this.reachable(place)) {
      return 'unreachable';
    }
    if (heldInPlace(this.registry, item, at) || this.accessRefusal(place, undefined)) {
      return 'inaccessible';
    }
    return undefined;
  }

  planLiquidDraws(
    draws: readonly { uid: number; liquid: string; volumeMicrolitres: number }[],
  ):
    | { ok: false; reason: LiquidTransferRefusal; uid: number; liquid: string }
    | { ok: true; balances: { item: Item; contents: NonNullable<Item['liquidContents']> }[] } {
    const totals = new Map<number, { liquid: string; volumeMicrolitres: number }>();
    for (const draw of draws) {
      const previous = totals.get(draw.uid);
      if (
        !Number.isSafeInteger(draw.volumeMicrolitres) ||
        draw.volumeMicrolitres <= 0 ||
        (previous && previous.liquid !== draw.liquid)
      ) {
        return { ok: false, reason: 'invalid-limit', uid: draw.uid, liquid: draw.liquid };
      }
      totals.set(draw.uid, {
        liquid: draw.liquid,
        volumeMicrolitres: (previous?.volumeMicrolitres ?? 0) + draw.volumeMicrolitres,
      });
    }
    const balances: { item: Item; contents: NonNullable<Item['liquidContents']> }[] = [];
    for (const [uid, draw] of totals) {
      const item = this.itemByUid(uid);
      const plan = planLiquidDraw(this.registry, item, draw.liquid, draw.volumeMicrolitres);
      if (!plan.ok) {
        return { ...plan, uid, liquid: draw.liquid };
      }
      const reason = this.liquidEndpointRefusal(item!);
      if (reason) {
        return { ok: false, reason, uid, liquid: draw.liquid };
      }
      balances.push({ item: item!, contents: plan.sourceContents });
    }
    return { ok: true, balances };
  }

  drawLiquids(
    draws: readonly { uid: number; liquid: string; volumeMicrolitres: number }[],
  ): ReturnType<Inventory['planLiquidDraws']> {
    const plan = this.planLiquidDraws(draws);
    if (!plan.ok) {
      return plan;
    }
    for (const { item, contents } of plan.balances) {
      item.liquidContents = { ...contents };
    }
    this.version += 1;
    return plan;
  }

  planLiquidReceipts(
    liquids: readonly LiquidAmount[],
    choices: LiquidRecoveryChoices = {},
  ):
    | { ok: false; reason: LiquidTransferRefusal; liquid?: string }
    | { ok: false; reason: 'spill-approval'; spills: LiquidAmount[] }
    | { ok: true; spills: LiquidAmount[]; balances: { item: Item; contents: NonNullable<Item['liquidContents']> }[] } {
    if (
      !validLiquidRecoveryChoices(liquids, choices) ||
      liquids.some(({ liquid }) => !this.registry.liquids.has(liquid))
    ) {
      return { ok: false, reason: 'invalid-limit' };
    }
    const spills: LiquidAmount[] = [];
    const balances: { item: Item; contents: NonNullable<Item['liquidContents']> }[] = [];
    for (const amount of liquids) {
      const uid = choices.receivers?.find(({ liquid }) => liquid === amount.liquid)?.uid;
      let accepted = 0;
      if (uid !== undefined) {
        const item = this.itemByUid(uid);
        const plan = planLiquidReceive(this.registry, item, amount.liquid, amount.volumeMicrolitres);
        if (!plan.ok) {
          return { ...plan, liquid: amount.liquid };
        }
        const reason = this.liquidEndpointRefusal(item!);
        if (reason) {
          return { ok: false, reason, liquid: amount.liquid };
        }
        ({ accepted } = plan);
        balances.push({ item: item!, contents: plan.receiverContents });
      }
      spills.push({ liquid: amount.liquid, volumeMicrolitres: amount.volumeMicrolitres - accepted });
    }
    if (
      spills.some(
        ({ liquid, volumeMicrolitres }) =>
          volumeMicrolitres >
          (choices.spillApproval?.find((approval) => approval.liquid === liquid)?.volumeMicrolitres ?? 0),
      )
    ) {
      return { ok: false, reason: 'spill-approval', spills };
    }
    return { ok: true, spills, balances };
  }

  liquidReceiptRefusal(plan: ReturnType<Inventory['planLiquidReceipts']>): string | undefined {
    if (plan.ok) {
      return undefined;
    }
    if (plan.reason === 'spill-approval') {
      return plan.spills
        .filter(({ volumeMicrolitres }) => volumeMicrolitres > 0)
        .map(({ liquid, volumeMicrolitres }) =>
          coreMessage(this.registry, 'recoverySpill', {
            liquid: this.registry.liquids.get(liquid)!.name,
            volume: volumeText(volumeMicrolitres / 1000),
          }),
        )
        .join('; ');
    }
    return plan.liquid
      ? coreMessage(this.registry, 'recoveryReceiverUnavailable', {
          liquid: this.registry.liquids.get(plan.liquid)!.name,
        })
      : coreMessage(this.registry, 'liquidTransferRefused');
  }

  updateRecovery(uid: number, choices: LiquidRecoveryChoices): string | undefined {
    const work = this.itemByUid(uid)?.work;
    if (work?.kind !== 'disassembly') {
      return coreMessage(this.registry, 'gone');
    }
    const next = {
      receivers: choices.receivers ?? work.receivers,
      spillApproval: choices.spillApproval ?? work.spillApproval,
    };
    const reason = this.liquidReceiptRefusal(this.planLiquidReceipts(work.liquids, next));
    if (reason) {
      return reason;
    }
    work.receivers = next.receivers.map((receiver) => ({ ...receiver }));
    work.spillApproval = next.spillApproval.map((approval) => ({ ...approval }));
    this.version += 1;
    return undefined;
  }

  receiveLiquids(
    liquids: readonly LiquidAmount[],
    choices: LiquidRecoveryChoices = {},
  ): ReturnType<Inventory['planLiquidReceipts']> {
    const plan = this.planLiquidReceipts(liquids, choices);
    if (plan.ok) {
      for (const { item, contents } of plan.balances) {
        item.liquidContents = { ...contents };
      }
      this.version += 1;
    }
    return plan;
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
    const reason = this.liquidEndpointRefusal(source!) ?? this.liquidEndpointRefusal(receiver!);
    if (reason) {
      return { ok: false, reason };
    }
    if (this.accessRefusal(this.placeOf(this.locate(source!)!), this.placeOf(this.locate(receiver!)!))) {
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
  plan(item: Item, target: Target, wanted = item.count): Plan {
    const count = this.fitCount(item, target, wanted);
    if (!this.leavesAsSingles(item, target, count)) {
      return this.planMove(item, target, count);
    }
    // Pulling N out costs what moving the loose items that land would; a hand or worn slot takes one.
    return this.planMove(item, target, 1, this.singlesLanding(item, target, count));
  }

  /** What one drop press moves: a stockpile stack gives up one carried stack of it, anything else drops whole. */
  dropCount(item: Item): number {
    const def = defOf(this.registry, item.type);
    return def.stockpileStack === undefined ? item.count : Math.min(item.count, def.stack ?? 1);
  }

  /** How many of the singles a stack leaves as actually land in the target, as `moveSingles` places them. */
  private singlesLanding(item: Item, target: Target, count: number): number {
    if (!this.isStorageTarget(target)) {
      return 1;
    }
    const inside = (this.pocketsOf(target) ?? [])
      .flat()
      .map((p) => p.item)
      .filter((held) => held !== item);
    const room = Math.min(count, containerRoom(this.registry, this.containerOf(target), inside, item));
    const grid = this.layoutOf(target);
    const { at: _pinned, ...where } = target;
    const key = JSON.stringify(this.targetState(where));
    const batch = { shadow: new Map([[key, [...grid.placed]]]), joined: new Map<Item, number>(), key, grid };
    let landed = 0;
    while (landed < room && this.reserveUnit(batch, item, 1, this.stockpiles(target))) {
      landed += 1;
    }
    return Math.max(1, landed);
  }

  private planMove(item: Item, target: Target, count: number, repeats = 1): Plan {
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
    const successfulPlacement = placement.ok ? placement : this.swapInstead(item, target, count, from);
    if (!successfulPlacement) {
      return placement;
    }
    return { ...successfulPlacement, ok: true, durationSimSeconds: this.handlingTime(item, from, target) * repeats };
  }

  /** Makes a move now if it's possible. Returns the plan it followed, or why not. */
  move(item: Item, target: Target, wanted = item.count): Plan {
    const count = this.fitCount(item, target, wanted);
    if (this.leavesAsSingles(item, target, count)) {
      return this.moveSingles(item, target, count);
    }
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
        return this.hands[target.side] ? refuse('full') : { ok: true, durationSimSeconds: 0 };
      case 'worn': {
        const slot = wornSlotOf(this.registry, item);
        return slot && !this.worn[slot] && !this.wearRefusal(slot, item)
          ? { ok: true, durationSimSeconds: 0 }
          : refuse('full');
      }
      default:
        return this.storagePlacement(item, item.count, this.layoutOf(target), target);
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
    if (from.kind === 'furniture') {
      this.entities.contentsChanged(from.entity);
    }
    return this.factory.split(item, count);
  }

  private mergeStack(target: Item, source: Item): void {
    this.settleFood(target, this.locate(target));
    this.settleFood(source, this.locate(source));
    if (!this.sameFood(target, source)) {
      throw new Error('Only an equal food cohort can join a stack');
    }
    if (!sameRecoveryState(target, source)) {
      throw new Error('Only equal unlit recovery states can join a stack');
    }
    target.count += source.count;
    const location = this.locate(target);
    if (location?.kind === 'furniture') {
      this.entities.contentsChanged(location.entity);
    }
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
    if (!(recipe && validWorldDestination(plan.destination, recipe))) {
      return false;
    }
    if (plan.destination && (!this.worldPlacement || this.worldPlacement.refusal(recipe, plan.destination))) {
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
    return (
      !plan.tools.some((tool) => seen.has(tool.item.uid)) &&
      this.planLiquidDraws(
        plan.liquids.flatMap((draw) =>
          draw.sources.map((source) => ({
            uid: source.item.uid,
            liquid: draw.liquid,
            volumeMicrolitres: source.volumeMicrolitres,
          })),
        ),
      ).ok
    );
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
          this.entities.canRepair(entity, repair.amount, repairCeiling(this.registry, recipe)),
      );
    }
    if (repair.target.kind === 'cell') {
      // A damaged cell holds no work item, so nothing reserves it: the world's say over the pinned damage episode and
      // reach gate the job directly.
      return Boolean(
        this.cellRepair?.refusal(repair.target.cell, repair.target.epoch, recipe.repair?.block, {
          amount: repair.amount,
          ceiling: repairCeiling(this.registry, recipe),
        }) === undefined && this.canReachCell(repair.target.cell),
      );
    }
    const target = this.itemByUid(repair.target.uid);
    return Boolean(
      target &&
        !plan.components.some(({ item }) => item.uid === target.uid) &&
        'item' in recipe.result &&
        target.type === recipe.result.item &&
        target.count === 1,
    );
  }

  private validCraftComponent(item: Item, count: number, consumeFitted = false): boolean {
    const location = this.locate(item);
    return (
      this.itemByUid(item.uid) === item &&
      location !== undefined &&
      !assemblyPart(location) &&
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
      !assemblyPart(location) &&
      !chargingBattery(location) &&
      !plan.source.work &&
      isEmpty(plan.source) &&
      !(plan.receivers ?? []).some(({ uid }) => uid === plan.source.uid) &&
      this.planLiquidReceipts(plan.liquids, plan).ok
    );
  }

  /** Ownership only: what may stand in the way of removing the piece is its mover's to refuse. */
  private validPieceDisassemblyPlan(plan: Extract<WorkPlan, { kind: 'pieceDisassembly' }>): boolean {
    const { entity } = plan;
    return (
      this.entities.byUid(entity.uid) === entity &&
      !entity.carried &&
      !this.entities.useRefusal(entity) &&
      this.canReachEntity(entity)
    );
  }

  /** Ownership only: the cell holds no work item, so the world's say over the pinned episode and reach gate the job. */
  private validCellDisassemblyPlan(plan: CellDisassemblyPlan): boolean {
    return Boolean(
      this.rubble &&
        this.rubble.standing(plan.cell) === plan.block &&
        this.rubble.refusal(plan.cell, plan.epoch) === undefined &&
        this.canReachCell(plan.cell),
    );
  }

  private validWorkPlan(plan: WorkPlan, repair?: import('./longAction.ts').CraftRepair): boolean {
    switch (plan.kind) {
      case 'craft':
        return this.validCraftPlan(plan, repair);
      case 'disassembly':
        return !repair && this.validDisassemblyPlan(plan);
      case 'pieceDisassembly':
        return !repair && this.validPieceDisassemblyPlan(plan);
      case 'cellDisassembly':
        return !repair && this.validCellDisassemblyPlan(plan);
      case 'partService':
        return !repair && this.validPartServicePlan(plan);
      default:
        return false;
    }
  }

  /** Ownership only: the piece is free and in reach, and a fit's spare can leave where it is. */
  private validPartServicePlan(plan: PartServicePlan): boolean {
    const { entity, spare } = plan;
    const spareFree = plan.operation === 'remove' || (spare !== undefined && !this.fittingSourceRefusal(spare));
    return (
      this.entities.stands(entity) && !this.entities.useRefusal(entity) && this.canReachEntity(entity) && spareFree
    );
  }

  /** The piece a world job lives on, running or paused (`packages/deadvox/DESIGN.md`, "World repair selection"). */
  private workHost(plan: WorkPlan, repair?: import('./longAction.ts').CraftRepair): BlockEntity | undefined {
    if (plan.kind === 'pieceDisassembly' || plan.kind === 'partService') {
      return plan.entity;
    }
    return repair?.target.kind === 'entity' ? this.entities.byUid(repair.target.uid) : undefined;
  }

  /** The payload `beginWork` stores; restore checks the same shape with `validateWorkItem`. */
  private workPayload(
    plan: WorkPlan,
    components: Item[],
    repair?: import('./longAction.ts').CraftRepair,
  ): NonNullable<Item['work']> {
    if (plan.kind === 'pieceDisassembly') {
      return {
        kind: 'pieceDisassembly',
        furniture: plan.entity.type,
        ...(plan.boarding ? { boarding: plan.boarding } : {}),
        skillLevel: plan.skillLevel,
        toolLevels: { ...plan.toolLevels },
        outputs: plan.outputs.map((output) => ({ ...output })),
        ...unstarted(plan.timeGameMinutes),
        components,
      };
    }
    if (plan.kind === 'cellDisassembly') {
      return {
        kind: 'cellDisassembly',
        cell: [...plan.cell] as Vec3,
        block: plan.block,
        epoch: plan.epoch,
        outputs: plan.outputs.map((output) => ({ ...output })),
        ...unstarted(plan.timeGameMinutes),
        components,
      };
    }
    if (plan.kind === 'partService') {
      return {
        kind: 'partService',
        furniture: plan.entity.type,
        slot: plan.slot,
        operation: plan.operation,
        part: plan.part,
        ...unstarted(plan.timeGameMinutes),
        components,
      };
    }
    if (plan.kind === 'disassembly') {
      return {
        kind: 'disassembly',
        source: plan.source.type,
        operation: plan.operation,
        liquids: plan.liquids.map((liquid) => ({ ...liquid })),
        receivers: (plan.receivers ?? []).map((receiver) => ({ ...receiver })),
        spillApproval: (plan.spillApproval ?? []).map((approval) => ({ ...approval })),
        skillLevel: plan.skillLevel,
        toolLevels: { ...plan.toolLevels },
        gather: plan.gather,
        outputs: plan.outputs.map((output) => ({ ...output })),
        ...unstarted(plan.duration),
        components,
      };
    }
    return {
      kind: 'craft',
      recipe: plan.recipe,
      ...(plan.destination ? { destination: copyWorldDestination(plan.destination) } : {}),
      liquids: plan.liquids.map((draw) => ({
        group: draw.group,
        liquid: draw.liquid,
        volumeMicrolitres: draw.volumeMicrolitres,
        sources: draw.sources.map((source) => ({ uid: source.item.uid, volumeMicrolitres: source.volumeMicrolitres })),
      })),
      ...unstarted(plan.gather + plan.work),
      components,
      ...(repair ? { repairTarget: copyWorkTarget(repair.target), repairAmount: repair.amount } : {}),
    };
  }

  /** Whether restore would accept the work item this plan makes, judged before any input moves. */
  private restorableWork(plan: WorkPlan, repair?: import('./longAction.ts').CraftRepair): boolean {
    const components = ((): Item[] => {
      switch (plan.kind) {
        case 'craft':
          return plan.components.map(({ item, count }) => ({ ...item, count }));
        case 'disassembly':
          return [{ ...plan.source, count: 1 }];
        case 'partService':
          return plan.spare ? [{ ...plan.spare, count: 1 }] : [];
        default:
          return [];
      }
    })();
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

  /** A fit holds its spare as the job's one component, so cancelling hands the same item back. */
  private escrowSpare(plan: PartServicePlan, spare: Item, work: Item): void {
    const from = this.locate(spare)!;
    this.remove(from);
    this.quickbarOrigins.delete(spare.uid);
    if (from.kind === 'furniture') {
      this.countLooted(spare);
    }
    work.work = this.workPayload(plan, [spare]);
  }

  /**
   * Whether the hands hold nothing but `taken`, the item Start escrows from them: a fit's own spare, since a player
   * picks the spare up to work on the piece (`packages/deadvox/docs/holdout.md`, "Supplies and progression").
   */
  handsFreeBut(taken?: Item): boolean {
    return [this.hands.left, this.hands.right].every((held) => !held || held === taken);
  }

  /**
   * Escrow through the mutation owner; no duplicate trees in the other hand or job. Work aimed at a piece lives on
   * that piece and so reserves it; other work lives in the dominant hand.
   */
  beginWork(plan: WorkPlan, repair?: import('./longAction.ts').CraftRepair): Item | undefined {
    if (!this.handsFreeBut(plan.kind === 'partService' ? plan.spare : undefined)) {
      return undefined;
    }
    if (!(this.validWorkPlan(plan, repair) && this.restorableWork(plan, repair))) {
      return undefined;
    }
    const host = this.workHost(plan, repair);
    const work = this.create(workInProgressItem(this.registry).id);
    if (plan.kind === 'craft') {
      this.escrowCraft(plan, work, repair);
    } else if (plan.kind === 'disassembly') {
      this.escrowDisassembly(plan, work);
    } else if (plan.kind === 'partService' && plan.spare) {
      this.escrowSpare(plan, plan.spare, work);
    } else {
      work.work = this.workPayload(plan, []);
    }
    if (host) {
      this.entities.hostWork(host, work);
    } else {
      this.hands[dominantSide(this.character)] = work;
    }
    this.version += 1;
    return work;
  }

  private workDrops(work: Item, outputs: readonly Item[], feet: Vec3): { item: Item; pos: Vec3; spot: Spot }[] {
    if (outputs.some((item) => !couldFit(this.registry, PILE_GRID, item))) {
      throw new Error('An input or result is too large to put down');
    }
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
  private reserveSpot(shadow: Map<string, Placed[]>, key: string, grid: StorageLayout, item: Item): Spot | undefined {
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
    const admitted = new Map<string, Item[]>();
    return moves.flatMap(({ item, targets }) => {
      for (const target of targets) {
        const pinned = this.reserveBatchTarget({ shadow, joined, admitted }, item, target);
        if (pinned) {
          return [{ item, target: pinned }];
        }
      }
      return [];
    });
  }

  /** The target pinned to a stack with room left by the batch so far, else to a free spot it reserves. */
  private reserveBatchTarget(
    batch: { shadow: Map<string, Placed[]>; joined: Map<Item, number>; admitted: Map<string, Item[]> },
    item: Item,
    target: Target,
  ): Target | undefined {
    const { shadow, joined, admitted } = batch;
    if (!(this.isStorageTarget(target) && this.plan(item, target).ok)) {
      return undefined;
    }
    const { at: _pinned, ...where } = target;
    const key = JSON.stringify(this.targetState(where));
    const grid = this.layoutOf(target);
    const containerKey = this.batchContainerKey(target);
    const pending = admitted.get(containerKey) ?? [];
    const inside = (this.pocketsOf(target) ?? [])
      .flat()
      .map((p) => p.item)
      .filter((held) => held !== item);
    const count = Math.min(
      this.fitCount(item, target, item.count),
      containerRoom(this.registry, this.containerOf(target), [...inside, ...pending], item),
    );
    if (count <= 0) {
      return undefined;
    }
    shadow.set(key, shadow.get(key) ?? [...grid.placed]);
    // A stack that leaves as singles takes one footprint per single, as `moveSingles` will, as many as fit.
    const singles = this.leavesAsSingles(item, target, count);
    const units = singles ? count : 1;
    const perUnit = singles ? 1 : count;
    let first: Spot | undefined;
    let reserved = 0;
    for (let unit = 0; unit < units; unit += 1) {
      const at = this.reserveUnit({ shadow, joined, key, grid }, item, perUnit, this.stockpiles(target));
      if (!at) {
        break;
      }
      first ??= at;
      reserved += perUnit;
    }
    if (!first) {
      return undefined;
    }
    admitted.set(containerKey, [...pending, { ...item, count: reserved }]);
    return grid.size === undefined ? { ...where, reserved: true } : { ...target, at: first, reserved: true };
  }

  private batchContainerKey(target: Extract<Target, { kind: 'furniture' | 'pocket' | 'pile' }>): string {
    switch (target.kind) {
      case 'furniture':
        return `furniture:${target.entity.uid}`;
      case 'pocket':
        return `pocket:${target.owner.uid}`;
      default:
        return `pile:${pileKey(target.pos)}`;
    }
  }

  private reserveUnit(
    batch: { shadow: Map<string, Placed[]>; joined: Map<Item, number>; key: string; grid: StorageLayout },
    item: Item,
    count: number,
    stockpile: boolean,
  ): Spot | undefined {
    const { shadow, joined, key, grid } = batch;
    const stack = shadow
      .get(key)!
      .find(
        (p) =>
          stackRoom(this.registry, p.item, item, { sameFood: this.sameFood, stockpile }) - (joined.get(p.item) ?? 0) >=
          count,
      );
    if (stack) {
      joined.set(stack.item, (joined.get(stack.item) ?? 0) + count);
      return { x: stack.x ?? 0, y: stack.y ?? 0, rotated: stack.rotated ?? false };
    }
    // A split reserves a stand-in single, so later singles can join its shadow stack as they will when executed.
    return this.reserveSpot(shadow, key, grid, count === item.count ? item : { ...item, count });
  }

  private workOutputs(payload: NonNullable<Item['work']>, finish: boolean, calendar: number): Item[] {
    if (!finish) {
      return payload.components;
    }
    if (payload.kind === 'partService') {
      throw new Error('A finished part service releases through its slot');
    }
    if (payload.kind !== 'craft') {
      const outputs = payload.outputs.map(({ item, count }) => this.create(item, count, 1, calendar));
      if (payload.kind === 'cellDisassembly') {
        outputs.push(
          ...(this.rubble?.contents(payload.cell) ?? []).map(({ item }) => restoreItem(this.registry, item)),
        );
      }
      return outputs;
    }
    if (payload.repairTarget !== undefined) {
      return [];
    }
    const { result } = this.registry.recipes.get(payload.recipe)!;
    if (!('item' in result)) {
      return [];
    }
    const output = this.create(result.item, result.count, 1, calendar);
    const totals = new Map<string, number>();
    for (const draw of payload.liquids ?? []) {
      totals.set(draw.liquid, (totals.get(draw.liquid) ?? 0) + draw.volumeMicrolitres / result.count);
    }
    if (totals.size > 0) {
      output.craftedLiquids = [...totals]
        .sort(([a], [b]) => compareCodeUnits(a, b))
        .map(([liquid, volumeMicrolitres]) => ({ liquid, volumeMicrolitres }));
    }
    return [output];
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

  private completeEntityRepair(work: Item, payload: NonNullable<Item['work']>): boolean {
    if (payload.kind !== 'craft' || payload.repairTarget?.kind !== 'entity') {
      return true;
    }
    const entity = this.entities.byUid(payload.repairTarget.uid);
    return Boolean(
      entity &&
        !this.entities.useRefusal(entity, work) &&
        this.canReachEntity(entity) &&
        this.entities.repair(
          entity,
          payload.repairAmount!,
          repairCeiling(this.registry, this.registry.recipes.get(payload.recipe)),
        ),
    );
  }

  private completeCellRepair(payload: NonNullable<Item['work']>): boolean {
    if (payload.kind !== 'craft' || payload.repairTarget?.kind !== 'cell') {
      return true;
    }
    return (
      this.cellRepair?.repair(
        payload.repairTarget.cell,
        payload.repairTarget.epoch,
        payload.repairAmount!,
        repairCeiling(this.registry, this.registry.recipes.get(payload.recipe)),
      ) === true
    );
  }

  private workLiquidAdmission(
    payload: NonNullable<Item['work']>,
    finish: boolean,
  ): { item: Item; contents: NonNullable<Item['liquidContents']> }[] {
    if (
      !finish ||
      payload.kind === 'pieceDisassembly' ||
      payload.kind === 'cellDisassembly' ||
      payload.kind === 'partService'
    ) {
      return [];
    }
    if (payload.kind === 'disassembly') {
      const receipts = this.planLiquidReceipts(payload.liquids, payload);
      if (!receipts.ok) {
        throw new Error(this.liquidReceiptRefusal(receipts));
      }
      return receipts.balances;
    }
    const plan = this.planLiquidDraws(
      (payload.liquids ?? []).flatMap((draw) => draw.sources.map((source) => ({ ...source, liquid: draw.liquid }))),
    );
    if (!plan.ok) {
      const source = this.itemByUid(plan.uid);
      const liquid = this.registry.liquids.get(plan.liquid)!.name;
      throw new Error(
        source
          ? coreMessage(this.registry, 'craftLiquidUnavailable', {
              vessel: this.registry.items.get(source.type)!.name,
              liquid,
            })
          : coreMessage(this.registry, 'craftLiquidSourceMissing', { liquid }),
      );
    }
    return plan.balances;
  }

  private applyWorkRepair(payload: NonNullable<Item['work']>, target: Item | undefined, finish: boolean): void {
    if (finish && target && payload.kind === 'craft' && payload.repairAmount !== undefined) {
      target.condition = repairedCondition(
        target.condition,
        payload.repairAmount,
        repairCeiling(this.registry, this.registry.recipes.get(payload.recipe)),
      );
    }
  }

  /** The world's refusal to remove a finished job's piece puts the job back on it, so nothing is lost. */
  private retireHost(entity: BlockEntity, work: Item, retirePiece: WorkRelease['retirePiece']): void {
    const refusal = retirePiece ? retirePiece(entity) : 'No remover for a piece taken apart';
    if (refusal) {
      this.entities.hostWork(entity, work);
      throw new Error(refusal);
    }
  }

  /** A blocker at the last moment keeps a finished job on its target, paused, to finish once it clears. */
  private rubbleReleaseRefusal(
    payload: NonNullable<Item['work']>,
    finish: boolean,
    clearRubble: WorkRelease['clearRubble'],
  ): string | undefined {
    if (!finish || payload.kind !== 'cellDisassembly') {
      return undefined;
    }
    return clearRubble ? clearRubble(payload.cell, payload.epoch) : 'No rubble owner for a cell taken apart';
  }

  private placementResult(work: Item, payload: NonNullable<Item['work']>, finish: boolean): void {
    if (!finish || payload.kind !== 'craft' || !payload.destination) {
      return;
    }
    const refusal = this.worldPlacement
      ? this.worldPlacement.place(this.registry.recipes.get(payload.recipe)!, payload.destination, work)
      : 'Missing world placement owner';
    if (refusal) {
      throw new Error(refusal);
    }
  }

  private resultInHand(payload: NonNullable<Item['work']>, finish: boolean, at: Location): boolean {
    return (
      finish &&
      payload.kind === 'craft' &&
      payload.repairTarget === undefined &&
      payload.destination === undefined &&
      at.kind === 'hand'
    );
  }

  /**
   * A fit puts its spare in the slot; a removed part goes to a pile at the feet, never to hand. The landing is admitted
   * before the slot or the job changes, so a blocked landing throws and keeps the job paused on its piece.
   */
  private finishPartService(
    work: Item,
    payload: Extract<NonNullable<Item['work']>, { kind: 'partService' }>,
    at: Location,
    feet: Vec3,
  ): void {
    if (at.kind !== 'pieceWork') {
      throw new Error('A part service lives on its piece');
    }
    const { entity } = at;
    const part = this.entities.housingView(entity).find(({ slot }) => slot === payload.slot)?.part;
    if ((payload.operation === 'remove') !== (part !== undefined)) {
      throw new Error(coreMessage(this.registry, 'gone'));
    }
    const drops = part ? this.workDrops(work, [this.housedCandidate(entity, payload.slot, part)], feet) : [];
    this.remove(at);
    work.work = undefined;
    if (payload.operation === 'fit') {
      this.entities.fitHousingPart(entity, payload.slot, payload.components[0]!);
    }
    for (const { pos, spot } of drops) {
      this.put(this.takeAdmittedPart(entity, payload.slot), { kind: 'pile', pos }, spot);
    }
    this.version += 1;
  }

  private completePieceDisassembly({
    payload,
    at,
    work,
    finish,
    retirePiece,
    removeBoarding,
  }: {
    payload: NonNullable<Item['work']>;
    at: Location;
    work: Item;
    finish: boolean;
    retirePiece: WorkRelease['retirePiece'] | undefined;
    removeBoarding: WorkRelease['removeBoarding'] | undefined;
  }): void {
    if (!(finish && payload.kind === 'pieceDisassembly' && at.kind === 'pieceWork')) {
      return;
    }
    if (payload.boarding) {
      const refusal = removeBoarding
        ? removeBoarding(at.entity, payload.boarding)
        : 'No boarding remover for a piece taken apart';
      if (refusal) {
        this.entities.hostWork(at.entity, work);
        throw new Error(refusal);
      }
      return;
    }
    this.retireHost(at.entity, work, retirePiece);
  }

  /** Terminal ownership transfer. Exact input UIDs never merge on cancellation. */
  releaseWork(
    work: Item,
    finish: boolean,
    { feet, calendar = 0, retirePiece, removeBoarding, clearRubble }: WorkRelease,
  ): void {
    const payload = work.work;
    const at = this.locate(work);
    if (!(payload && at)) {
      return;
    }
    if (finish && payload.kind === 'partService') {
      this.finishPartService(work, payload, at, feet);
      return;
    }
    const balances = this.workLiquidAdmission(payload, finish);
    const target = this.repairTargetForWork(payload, finish);
    const outputs = this.workOutputs(payload, finish, calendar);
    const resultInHand = this.resultInHand(payload, finish, at);
    const drops = resultInHand ? [] : this.workDrops(work, outputs, feet);
    const rubbleRefusal = this.rubbleReleaseRefusal(payload, finish, clearRubble);
    if (rubbleRefusal) {
      throw new Error(rubbleRefusal);
    }
    if (finish && !(this.completeEntityRepair(work, payload) && this.completeCellRepair(payload))) {
      this.releaseWork(work, false, { feet, calendar });
      return;
    }
    this.placementResult(work, payload, finish);
    if (finish) {
      // All admissions precede world repair and this non-refusing balance commit.
      commitBalances(balances);
    }
    this.remove(at);
    this.completePieceDisassembly({ payload, at, work, finish, retirePiece, removeBoarding });
    work.work = undefined;
    this.applyWorkRepair(payload, target, finish);
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
        return {
          kind: 'vehicle',
          origin: location.origin,
          vehicleId: location.vehicleId,
          fittingId: location.fittingId,
        };
      case 'pile':
        return { kind: 'pile', pile: location.pile };
      case 'furniture':
      case 'pieceWork':
      case 'housing':
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

  /**
   * Why an item the reach snapshot leaves out cannot be handled, worded as a move into or out of its place would
   * refuse it: furniture not searched, a vehicle part shut away while its vehicle is in reach, or too far.
   */
  unreachedReason(location: Location): string {
    const place = this.placeOf(location);
    if (!this.searched(place)) {
      return coreMessage(this.registry, 'notSearched');
    }
    return coreMessage(this.registry, this.reachable(place) && this.shutAway(place) ? 'shutAway' : 'tooFar');
  }

  /** Seconds to take an item out of where it is and put it where it's going. */
  handlingTime(item: Item, from: Location, target: Target): number {
    const cells = cellCount(defOf(this.registry, item.type));
    const weights = handlingWeights(this.registry);
    const perCell = weights.perCellSimSeconds * cells;
    const out = (() => {
      switch (from.kind) {
        case 'hand':
          return 0;
        case 'worn':
          return weights.wearSimSeconds;
        case 'pocket':
          return this.pocketHandling(from.owner, from.pocket) + perCell;
        case 'furniture':
          return this.furnitureHandling(from.entity, from.pocket) + perCell;
        default:
          return weights.groundSimSeconds + perCell;
      }
    })();
    const into = (() => {
      switch (target.kind) {
        case 'hand':
          return 0;
        case 'worn':
          return weights.wearSimSeconds;
        case 'pocket':
          return this.pocketHandling(target.owner, target.pocket) + perCell;
        case 'furniture':
          return this.furnitureHandling(target.entity, target.pocket) + perCell;
        default:
          return weights.groundSimSeconds + perCell;
      }
    })();
    return this.scaleHandlingTime(out + into);
  }

  /** Resolves an inventory-handling time through the attributes and skills that shorten it. */
  scaleHandlingTime(seconds: number): number {
    const { attributes, skills } = handlingWeights(this.registry);
    return modified('inventory.handlingSimSeconds', seconds, this.character, { attributes, skills });
  }

  /**
   * What worn and wielded items change, each named by its item, so taking one off or out of the hands takes its
   * change away (`packages/deadvox/docs/magic-mod.md`, "How attributes are set").
   */
  itemModifiers(): Modifier[] {
    const held = new Set(Object.values(this.hands));
    const out: Modifier[] = [];
    const collect = (item: Item, state: 'worn' | 'wielded'): void => {
      const definition = defOf(this.registry, item.type);
      for (const { while: when, attribute, effect, multiply, add } of definition.modifiers ?? []) {
        if (when !== state) {
          continue;
        }
        const change = { source: definition.name, multiply, add };
        out.push(attribute === undefined ? { ...change, effect: effect! } : { ...change, attribute });
      }
    };
    for (const item of held) {
      collect(item, 'wielded');
    }
    for (const item of Object.values(this.worn)) {
      if (item) {
        collect(item, 'worn');
      }
    }
    return out;
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
      return this.canReachVehicle(place.vehicleId);
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

  private shutAway(place: Place | undefined): boolean {
    if (place?.kind !== 'vehicle') {
      return false;
    }
    const vehicle = this.vehicles.get(place.vehicleId);
    return vehicle !== undefined && shutAway(vehicle, place.fittingId);
  }

  /** Why a move can't reach into either end: furniture unsearched or reserved, or a vehicle part closed away. */
  private accessRefusal(source: Place | undefined, destination: Place | undefined): string | undefined {
    if (!(this.searched(source) && this.searched(destination))) {
      return coreMessage(this.registry, 'notSearched');
    }
    if (this.shutAway(source) || this.shutAway(destination)) {
      return coreMessage(this.registry, 'shutAway');
    }
    const reserved = (place: Place | undefined) =>
      place?.kind === 'furniture' ? this.entities.useRefusal(place.entity) : undefined;
    return reserved(source) ?? reserved(destination);
  }

  private wearRefusal(slot: WearSlot, item: Item): string | undefined {
    const issue = wornOccupancyIssue(this.registry, slot, item);
    return issue === undefined
      ? undefined
      : coreMessage(this.registry, issue === 'needsSling' ? 'needsSling' : 'cantWear');
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
        const refusal = this.wearRefusal(slot, item);
        if (refusal) {
          return refuse(refusal);
        }
        return current
          ? coreRefusal(this.registry, 'wearingOther', { item: this.name(current).toLowerCase() })
          : { ok: true, durationSimSeconds: 0 };
      }
      case 'pocket': {
        if (target.owner === item) {
          return coreRefusal(this.registry, 'insideItself');
        }
        if (!this.locate(target.owner)) {
          return coreRefusal(this.registry, 'cantReach');
        }
        return this.storagePlacement(item, count, this.layoutOf(target), target);
      }
      default:
        return this.storagePlacement(item, count, this.layoutOf(target), target);
    }
  }

  /** A drop onto a stockpile stack joins or refuses; it never swaps the stack out. Other drops may swap. */
  private swapInstead(item: Item, target: Target, count: number, from: Location): ReturnType<Inventory['planSwap']> {
    return this.dropsOnStockpileStack(target) ? undefined : this.planSwap(item, target, count, from);
  }

  private dropsOnStockpileStack(target: Target): boolean {
    return this.stockpiles(target) && this.isStorageTarget(target) && this.pointedEntry(target) !== undefined;
  }

  private pointedEntry(target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>): Placed | undefined {
    const grid = this.layoutOf(target);
    if (target.ontoUid !== undefined) {
      return grid.placed.find(({ item }) => item.uid === target.ontoUid);
    }
    return target.at && grid.size !== undefined
      ? itemAt(this.registry, grid.placed, target.at.x, target.at.y)
      : undefined;
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
      this.isStorageTarget(target) &&
      this.isStorageTarget(sourceTarget) &&
      this.layoutOf(target).placed === this.layoutOf(sourceTarget).placed;
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
      return claimed(this.registry.ui, 'interface')!.furnitureMoveMessages.handsFull;
    }
    return this.handHold.liftRefusal();
  }

  private handMoveRefusal(item: Item, from: Location, target: Target): string | undefined {
    if (target.kind === 'hand' && this.entities.carrying()) {
      return claimed(this.registry.ui, 'interface')!.furnitureMoveMessages.handsFull;
    }
    return this.handHold.moveRefusal(
      item,
      from.kind === 'hand' ? from.side : undefined,
      target.kind === 'hand' ? target.side : undefined,
    );
  }

  private canMoveDisplaced(item: Item, from: Location, source: Location): boolean {
    if (
      from.kind === 'work' ||
      from.kind === 'pieceWork' ||
      from.kind === 'slot' ||
      from.kind === 'vehicle' ||
      from.kind === 'housing' ||
      chargingBattery(from)
    ) {
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
    if (!(this.isStorageTarget(target) && target.at && 'placed' in otherFrom)) {
      return undefined;
    }
    const spot = spotOf(otherFrom);
    return spot && { ...spot, rotated: target.at.rotated };
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
    if (this.isStorageTarget(target)) {
      return spot ? this.fitsSwapGrid(item, target, spot, projected) : false;
    }
    if (target.kind === 'worn') {
      return (
        from.kind === 'worn' && wornSlotOf(this.registry, item) === from.slot && !this.wearRefusal(from.slot, item)
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
        return this.pointedEntry(target)?.item;
    }
  }

  private isStorageTarget(target: Target): target is Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }> {
    return target.kind === 'pocket' || target.kind === 'pile' || target.kind === 'furniture';
  }

  private fitsSwapGrid(
    item: Item,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
    spot: Spot,
    projected?: { item: Item; spot: Spot },
  ): boolean {
    if (target.kind === 'pocket' && target.owner === item) {
      return false;
    }
    const displaced = this.itemAtTarget(target, item);
    if (!displaced || displaced === item || this.nestingRefusal(item, target, item.count, [item, displaced])) {
      return false;
    }
    const grid = this.layoutOf(target);
    const placed = grid.placed.filter(({ item: existing }) => existing !== item && existing !== displaced);
    if (projected) {
      placed.push({ item: projected.item, ...projected.spot });
    }
    return (
      (grid.size === undefined || couldFit(this.registry, grid.size, item)) &&
      fitsAt(this.registry, { ...grid, placed }, item, spot)
    );
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
    const itemTarget = this.isStorageTarget(target) && plan.at ? { ...target, at: plan.at } : target;
    this.remove(from);
    this.remove(otherFrom);
    this.countSwapLoot(item, from, target);
    this.countSwapLoot(otherItem, otherFrom, sourceTarget);
    this.put(item, itemTarget, plan.at);
    this.put(otherItem, sourceTarget, spotOf(from));
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
    return conflict ? refuse(conflict) : { ok: true, durationSimSeconds: 0 };
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

  private pilePlacements(pos: Readonly<Vec3>): Placed[] {
    return this.pileAt(pos)?.items ?? [];
  }

  /** Cell geometry is absent for pile pockets so content capacity alone governs admission. */
  private layoutOf(target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>): StorageLayout {
    switch (target.kind) {
      case 'pocket':
        return {
          size:
            this.containerOf(target)?.pockets[target.pocket]?.layout === 'pile'
              ? undefined
              : this.pocketGrid(target.owner, target.pocket),
          placed: target.owner.pockets?.[target.pocket] ?? [],
        };
      case 'furniture': {
        const spec = this.entities.defOf(target.entity).container?.pockets[target.pocket];
        if (!spec) {
          throw new Error(`${target.entity.type} has no pocket ${target.pocket}`);
        }
        return {
          size: spec.grid && { w: spec.grid[0], h: spec.grid[1] },
          placed: target.entity.pockets?.[target.pocket] ?? [],
        };
      }
      default:
        return { size: PILE_GRID, placed: this.pilePlacements(target.pos) };
    }
  }

  /** What the container's content declares it admits: some types or forms, and at most so much in all pockets. */
  private admissionRefusal(
    item: Item,
    container: ItemDef['container'],
    coming: { held: readonly (readonly Placed[])[]; count: number; leaving: readonly Item[] },
  ): string | undefined {
    if (container?.accepts && !container.accepts.includes(item.type)) {
      return coreMessage(this.registry, 'containerAcceptsOnly', {
        items: container.accepts.map((type) => defOf(this.registry, type).name.toLowerCase()).join(', '),
      });
    }
    const held = coming.held.flat().map(({ item: placed }) => placed);
    const inside = held.filter((placed) => !coming.leaving.includes(placed));
    const holds = container?.holds;
    const holder = holds && this.holderAdmissionRefusal(holds, item, { inside, refilling: !held.includes(item) });
    if (holder) {
      return holder;
    }
    return coming.count > containerRoom(this.registry, container, inside, item)
      ? coreMessage(this.registry, 'containerFull')
      : undefined;
  }

  private holderAdmissionRefusal(
    holds: Holder,
    item: Item,
    { inside, refilling }: { inside: readonly Item[]; refilling: boolean },
  ): string | undefined {
    const refusal = holderRefusal(this.registry, holds, item, inside);
    if (refusal?.kind === 'form') {
      return coreMessage(this.registry, 'containerAcceptsOnly', {
        items: holds.forms.map((form) => this.registry.forms.get(form)!.name.toLowerCase()).join(', '),
      });
    }
    if (refusal?.kind === 'otherKind') {
      return coreMessage(this.registry, 'holderHoldsOther', {
        item: defOf(this.registry, refusal.holding).name.toLowerCase(),
      });
    }
    return holds.refill === false && refilling ? coreMessage(this.registry, 'holderNoRefill') : undefined;
  }

  /** A stowage slot pocket's own rule, beside what its container admits. */
  private slotAdmissionRefusal(
    item: Item,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
    count: number,
    leaving: readonly Item[],
  ): string | undefined {
    if (target.kind !== 'pocket') {
      return undefined;
    }
    const slot = defOf(this.registry, target.owner.type).container?.pockets[target.pocket]?.slot;
    if (slot === undefined) {
      return undefined;
    }
    const inside = (target.owner.pockets?.[target.pocket] ?? [])
      .map(({ item: placed }) => placed)
      .filter((placed) => !leaving.includes(placed));
    const refusal = slotRefusal(
      this.registry,
      { owner: target.owner.type, id: slot },
      { type: item.type, count },
      inside,
    );
    return refusal && coreMessage(this.registry, refusal);
  }

  /** `leaving` are items the placement takes out of this container, so their count no longer holds a place. */
  private nestingRefusal(
    item: Item,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
    count: number,
    leaving: readonly Item[],
  ): string | undefined {
    let container: ItemDef['container'];
    let held: readonly (readonly Placed[])[] = [];
    if (target.kind === 'furniture') {
      ({ container } = this.entities.defOf(target.entity));
      held = target.entity.pockets ?? [];
    } else if (target.kind === 'pocket') {
      ({ container } = defOf(this.registry, target.owner.type));
      held = target.owner.pockets ?? [];
    }
    const admission =
      this.admissionRefusal(item, container, { held, count, leaving }) ??
      this.slotAdmissionRefusal(item, target, count, leaving);
    if (admission) {
      return admission;
    }
    const own = defOf(this.registry, item.type).container;
    // A holder takes only contents, never another container, so loaded it gains no space by nesting.
    const hasNestedContents =
      item.work !== undefined || (!own?.holds && (item.pockets ?? []).some((pocket) => pocket.length > 0));
    if (target.kind !== 'pile' && hasNestedContents && !own?.rigid) {
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
    if (defOf(this.registry, container.type).container?.holds) {
      return undefined;
    }
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

  private containerOf(target: Target): ItemDef['container'] {
    if (target.kind === 'furniture') {
      return this.entities.defOf(target.entity).container;
    }
    return target.kind === 'pocket' ? defOf(this.registry, target.owner.type).container : undefined;
  }

  /** Whether the target is a stockpile container, where materials stack; carried, they stay single. */
  private stockpiles(target: Target): boolean {
    return this.containerOf(target)?.stockpile === true;
  }

  private pocketsOf(target: Target): Placed[][] | undefined {
    if (target.kind === 'furniture') {
      return target.entity.pockets;
    }
    return target.kind === 'pocket' ? target.owner.pockets : undefined;
  }

  /** A stockpile with only some room takes what fits of a bigger move; the rest stays at the source. */
  private fitCount(item: Item, target: Target, count: number): number {
    if (!(this.stockpiles(target) && Number.isInteger(count)) || count > item.count) {
      return count;
    }
    const inside = (this.pocketsOf(target) ?? []).flat();
    if (inside.some((placed) => placed.item === item)) {
      return count;
    }
    const room = Math.min(
      containerRoom(
        this.registry,
        this.containerOf(target),
        inside.map((p) => p.item),
        item,
      ),
      this.mergeRoom(item, target),
    );
    return room > 0 && room < count ? room : count;
  }

  /** What the stack a drop points at can still take of the item; unlimited when the drop names no stack. */
  private mergeRoom(item: Item, target: Target): number {
    if (!(this.isStorageTarget(target) && (target.at || target.ontoUid !== undefined))) {
      return Number.POSITIVE_INFINITY;
    }
    const under = this.pointedEntry(target);
    return under
      ? stackRoom(this.registry, under.item, item, { sameFood: this.sameFood, stockpile: true })
      : Number.POSITIVE_INFINITY;
  }

  /** Materials stacked past their carried stack leave a stockpile as single items. */
  private leavesAsSingles(item: Item, target: Target, count: number): boolean {
    const def = defOf(this.registry, item.type);
    return (
      def.stockpileStack !== undefined &&
      count > (def.stack ?? 1) &&
      count <= item.count &&
      Number.isInteger(count) &&
      !this.stockpiles(target)
    );
  }

  /** Moves them one by one, as many as fit; the rest stays in the stack. */
  private moveSingles(item: Item, target: Target, count: number): Plan {
    let first: Plan | undefined;
    let refusal: Plan | undefined;
    for (let moved = 0; moved < count && !refusal; moved += 1) {
      const result = this.move(item, moved === 0 ? target : this.anywhereIn(target), 1);
      if (result.ok) {
        first ??= result;
      } else {
        refusal = result;
      }
    }
    return first ?? refusal!;
  }

  private anywhereIn(target: Target): Target {
    if (target.kind === 'hand' || target.kind === 'worn') {
      return target;
    }
    const { at: _spot, ontoUid: _onto, reserved: _reserved, ...where } = target;
    return where;
  }

  private joinPinned(
    item: Item,
    count: number,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
  ): Plan {
    const merge = this.pointedEntry(target)?.item;
    return merge &&
      stackRoom(this.registry, merge, item, { sameFood: this.sameFood, stockpile: this.stockpiles(target) }) >= count
      ? { ok: true, durationSimSeconds: 0, merge }
      : coreRefusal(this.registry, 'noRoomThere');
  }

  private storagePlacement(
    item: Item,
    count: number,
    grid: StorageLayout,
    target: Extract<Target, { kind: 'pocket' | 'pile' | 'furniture' }>,
  ): Plan {
    const { at } = target;
    const nesting = this.nestingRefusal(item, target, count, count === item.count ? [item] : []);
    if (nesting) {
      return refuse(nesting);
    }
    if (grid.size !== undefined && !couldFit(this.registry, grid.size, item)) {
      return coreRefusal(this.registry, 'tooBig');
    }
    const stockpile = this.stockpiles(target);
    const joins = (p: Placed) =>
      stackRoom(this.registry, p.item, item, { sameFood: this.sameFood, stockpile }) >= count;
    // Moving a whole item within its grid frees its own cells; moving part of a stack doesn't.
    const ignore = count === item.count ? item : undefined;
    if (target.ontoUid !== undefined) {
      return this.joinPinned(item, count, target);
    }
    if (at && grid.size !== undefined) {
      const under = itemAt(this.registry, grid.placed, at.x, at.y);
      if (under && joins(under)) {
        return { ok: true, durationSimSeconds: 0, merge: under.item };
      }
      return fitsAt(this.registry, grid, item, { ...at, ignore })
        ? { ok: true, durationSimSeconds: 0, at }
        : coreRefusal(this.registry, 'noRoomThere');
    }
    const stack = grid.placed.find(joins);
    if (stack) {
      return { ok: true, durationSimSeconds: 0, merge: stack.item };
    }
    return this.freePlacement(item, grid, ignore);
  }

  private freePlacement(item: Item, layout: StorageLayout, ignore: Item | undefined): Plan {
    if (layout.size === undefined) {
      return { ok: true, durationSimSeconds: 0 };
    }
    const at = findSpot(this.registry, layout, item, ignore);
    return at ? { ok: true, durationSimSeconds: 0, at } : coreRefusal(this.registry, 'noRoom');
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
      at.kind === 'housing' ||
      chargingBattery(at) ||
      count > item.count
    ) {
      return false;
    }
    if (count < item.count) {
      item.count -= count;
      if (at.kind === 'furniture') {
        this.entities.contentsChanged(at.entity);
      }
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
    if (from.kind === 'pieceWork') {
      return from.entity.work;
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
        this.entities.contentsChanged(from.entity);
        return;
      }
      case 'pieceWork':
        this.entities.hostWork(from.entity, undefined);
        return;
      case 'work':
        throw new Error('Craft inputs are owned by the work item');
      case 'vehicle':
        throw new Error('A fitted part is owned by its vehicle');
      case 'housing':
        throw new Error('A housed part is owned by its housing');
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
    const spot =
      this.containerOf(target)?.pockets['pocket' in target ? target.pocket : 0]?.layout === 'pile'
        ? {}
        : (at ?? { x: 0, y: 0, rotated: false });
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
        this.entities.contentsChanged(target.entity);
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
      !('item' in recipe.result) ||
      target.type !== recipe.result.item ||
      target.count !== 1
    ) {
      throw new Error('Missing or invalid repair target');
    }
  }
};

type Admits = NonNullable<ItemDef['container']>;

const assertSavedAdmitted = (
  registry: Registry,
  owner: string,
  saved: readonly (readonly { item: ItemState }[])[],
  admits?: Admits,
): void => {
  const unseated = saved.some((pocket, index) => {
    const slot = admits?.pockets[index]?.slot;
    return (
      slot !== undefined &&
      pocket.some(({ item }, n) =>
        slotRefusal(
          registry,
          { owner, id: slot },
          item,
          pocket.slice(0, n).map((entry) => entry.item),
        ),
      )
    );
  });
  if (unseated) {
    throw new Error('Saved stowage slot holds what it does not seat');
  }
  const contents = saved.flat();
  const overstacked = contents.some(({ item }) => {
    const def = defOf(registry, item.type);
    return def.stockpileStack !== undefined && item.count > (admits?.stockpile ? def.stockpileStack : (def.stack ?? 1));
  });
  if (overstacked) {
    throw new Error('Saved container holds a stack its kind does not allow');
  }
  if (admits?.accepts && contents.some(({ item }) => !admits.accepts?.includes(item.type))) {
    throw new Error('Saved container holds a rejected item');
  }
  const holds = admits?.holds;
  const items = contents.map(({ item }) => item);
  if (holds && items.some((item, index) => holderRefusal(registry, holds, item, items.slice(0, index)))) {
    throw new Error('Saved holder holds what it does not admit');
  }
  if (containerRoom(registry, admits, items) < 0) {
    throw new Error('Saved container holds more than it admits');
  }
};

const commitBalances = (balances: readonly { item: Item; contents: NonNullable<Item['liquidContents']> }[]): void => {
  for (const { item, contents } of balances) {
    item.liquidContents = { ...contents };
  }
};

const validateWorkHosting = (state: InventoryState, tree: readonly { item: ItemState }[]): void => {
  const hosted = new Set(state.entities.entities.flatMap(({ work }) => (work ? [work.uid] : [])));
  for (const { item } of tree) {
    if (item.work && worldJob(item.work) !== hosted.has(item.uid)) {
      throw new Error('A world job must live on its piece, and a piece holds only a world job');
    }
  }
  for (const entity of state.entities.entities) {
    if (entity.work && !jobNamesPiece(entity.work.work, entity)) {
      throw new Error('A piece holds only its own world job');
    }
  }
};

const validateWornState = (registry: Registry, worn: InventoryState['worn']): void => {
  for (const [slot, item] of Object.entries(worn)) {
    if (!registry.wearSlots.has(slot)) {
      throw new Error(`Invalid worn slot "${slot}": unknown wear slot`);
    }
    const issue = item && wornOccupancyIssue(registry, slot, item);
    if (issue) {
      throw new Error(`Invalid worn slot "${slot}": ${issue}`);
    }
  }
};

const validateInventoryTree = (registry: Registry, state: InventoryState, vehicles: VehicleInstancesState): void => {
  validateWornState(registry, state.worn);
  itemIds(savedItemTree(state, vehicles), state.nextItemUid);
  const tree = [...savedItemTree(state, vehicles)];
  validateRepairTargets(registry, tree);
  validateWorkHosting(state, tree);
  const grid = (placed: readonly PlacedState[], size: GridSize) => {
    const previous: Placed[] = [];
    for (const entry of placed) {
      if (
        entry.x === undefined ||
        entry.y === undefined ||
        entry.rotated === undefined ||
        !Number.isInteger(entry.x) ||
        !Number.isInteger(entry.y) ||
        !fitsAt(registry, { size, placed: previous }, entry.item, { x: entry.x, y: entry.y, rotated: entry.rotated })
      ) {
        throw new Error('Invalid item placement');
      }
      previous.push(entry);
    }
  };
  const pockets = (
    type: string,
    saved: PlacedState[][] | undefined,
    specs: { grid?: [number, number] | undefined; layout?: string | undefined }[] | undefined,
    admits?: Admits,
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
    assertSavedAdmitted(registry, type, saved, admits);
    for (const [index, spec] of specs.entries()) {
      if (spec.grid) {
        grid(saved[index]!, { w: spec.grid[0], h: spec.grid[1] });
      } else if (
        saved[index]!.some((entry) => entry.x !== undefined || entry.y !== undefined || entry.rotated !== undefined)
      ) {
        throw new Error('A pile entry has no grid placement');
      }
    }
  };
  for (const { item } of tree) {
    assertSavedLiquidContents(registry, item);
    const def = defOf(registry, item.type);
    const container =
      item.cargo && def.vehicle?.cargoSpace ? cargoGrid(item.cargo, def.vehicle.cargoSpace) : def.container;
    pockets(item.type, item.pockets, container?.pockets, def.container);
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
    pockets(entity.type, entity.pockets, def.container?.pockets, def.container);
  }
};

/** Work aimed at a piece in the world, which lives on that piece (`packages/deadvox/DESIGN.md`, "World repair selection"). */
const worldJob = (work: NonNullable<ItemState['work']>): boolean =>
  work.kind === 'pieceDisassembly' || work.kind === 'partService' || work.repairTarget?.kind === 'entity';

const jobNamesPiece = (work: ItemState['work'], entity: { uid: number; type: string }): boolean =>
  work?.kind === 'pieceDisassembly' || work?.kind === 'partService'
    ? work.furniture === entity.type
    : work?.repairTarget?.kind === 'entity' && work.repairTarget.uid === entity.uid;

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
  const expected = disassemblyOutputs(
    source,
    work.skillLevel,
    (quality) => work.toolLevels[quality] ?? 0,
    work.operation,
  );
  // Escrowed lights can keep burning; restore bounds the snapshot, not the later burn balance.
  const fullSource = { ...work.components[0]! };
  Reflect.deleteProperty(fullSource, 'burnRemainingGameSeconds');
  const liquids = disassemblyLiquidOutputs(registry, fullSource, work.skillLevel, {
    toolLevel: (quality) => work.toolLevels[quality] ?? 0,
    operation: work.operation,
  });
  return (
    outputsAreValid &&
    sameDisassemblyOutputs(expected, work.outputs) &&
    Array.isArray(work.liquids) &&
    Array.isArray(work.receivers) &&
    Array.isArray(work.spillApproval) &&
    validLiquidRecoveryChoices(work.liquids, work) &&
    work.liquids.every(
      ({ liquid, volumeMicrolitres }, index) =>
        registry.liquids.has(liquid) &&
        (index === 0 || compareCodeUnits(work.liquids[index - 1]!.liquid, liquid) < 0) &&
        volumeMicrolitres <= (liquids.find((amount) => amount.liquid === liquid)?.volumeMicrolitres ?? 0),
    )
  );
};

const validateCraftLiquidDraws = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'craft' }>,
) => {
  const recipe = registry.recipes.get(work.recipe)!;
  const liquidGroups = new Map<number, NonNullable<typeof work.liquids>[number]>();
  const perUnit = new Map<string, number>();
  for (const draw of work.liquids ?? []) {
    if (
      !Number.isSafeInteger(draw.group) ||
      draw.group < 0 ||
      liquidGroups.has(draw.group) ||
      !registry.liquids.has(draw.liquid) ||
      !Number.isSafeInteger(draw.volumeMicrolitres) ||
      draw.volumeMicrolitres <= 0 ||
      !recipe.components[draw.group]?.some(
        (alternative) =>
          'liquid' in alternative &&
          alternative.liquid === draw.liquid &&
          alternative.volumeMicrolitres === draw.volumeMicrolitres,
      ) ||
      !Array.isArray(draw.sources) ||
      draw.sources.length === 0 ||
      new Set(draw.sources.map(({ uid }) => uid)).size !== draw.sources.length ||
      draw.sources.some(
        ({ uid, volumeMicrolitres }) =>
          !Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(volumeMicrolitres) || volumeMicrolitres <= 0,
      ) ||
      draw.sources.reduce((sum, source) => sum + source.volumeMicrolitres, 0) !== draw.volumeMicrolitres
    ) {
      throw new Error('Invalid craft liquid draws');
    }
    const volume = (perUnit.get(draw.liquid) ?? 0) + draw.volumeMicrolitres / recipe.result.count;
    if (!Number.isSafeInteger(volume)) {
      throw new Error('Invalid per-unit craft liquid volume');
    }
    perUnit.set(draw.liquid, volume);
    liquidGroups.set(draw.group, draw);
  }
  return liquidGroups;
};

const validWorkTarget = (
  target: NonNullable<ItemState['work']>['repairTarget'],
  recipe: RecipeDef | undefined,
): boolean => {
  if (target === undefined) {
    return true;
  }
  if (target.kind === 'cell') {
    return (
      target.cell.length === 3 &&
      target.cell.every(Number.isSafeInteger) &&
      Number.isSafeInteger(target.epoch) &&
      target.epoch >= 0 &&
      recipe?.repair?.block !== undefined
    );
  }
  if (target.kind !== 'item' && target.kind !== 'entity') {
    return false;
  }
  return (
    Number.isSafeInteger(target.uid) &&
    target.uid >= 1 &&
    (target.kind === 'entity') === (recipe?.repair?.entity !== undefined)
  );
};

const validateCraftWorkItem = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'craft' }>,
): void => {
  const recipe = registry.recipes.get(work.recipe);
  if (
    !(recipe && validWorldDestination(work.destination, recipe)) ||
    (recipe.kind === 'repair') !== (work.repairTarget !== undefined && work.repairAmount !== undefined) ||
    (work.repairTarget === undefined) !== (work.repairAmount === undefined) ||
    !validWorkTarget(work.repairTarget, recipe) ||
    (work.repairAmount !== undefined &&
      (!Number.isFinite(work.repairAmount) ||
        work.repairAmount <= 0 ||
        (work.repairTarget?.kind === 'item' && work.repairAmount > 1)))
  ) {
    throw new Error('Invalid craft work payload');
  }
  const liquidGroups = validateCraftLiquidDraws(registry, work);
  const actual = new Map<string, number>();
  for (const component of work.components) {
    actual.set(component.type, (actual.get(component.type) ?? 0) + component.count);
  }
  const matches = (group: number, remaining: Map<string, number>): boolean => {
    if (group === recipe.components.length) {
      return [...remaining.values()].every((count) => count === 0);
    }
    return recipe.components[group]!.some((alternative) => {
      const draw = liquidGroups.get(group);
      if ('liquid' in alternative) {
        return Boolean(
          draw &&
            draw.liquid === alternative.liquid &&
            draw.volumeMicrolitres === alternative.volumeMicrolitres &&
            matches(group + 1, remaining),
        );
      }
      if (draw) {
        return false;
      }
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
  if (
    (work.operation !== 'salvage' && work.operation !== 'disassembly') ||
    (work.operation === 'salvage' ? !source.salvage : !source.disassembly)
  ) {
    throw new Error('Invalid disassembly work operation');
  }
  const duration = disassemblyWorkTime(source, work.operation);
  if (!validDisassemblyToolLevels(source, work.toolLevels, work.operation)) {
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
    work.duration < 0 ||
    // An instant part service still runs as a job, so review and Start stay one path for every slot
    // (`packages/deadvox/docs/holdout.md`, "Supplies and progression"); other work always takes time.
    (work.duration === 0 && work.kind !== 'partService') ||
    work.elapsed > work.duration ||
    work.components.some((component) => component.work || (component.pockets ?? []).some((grid) => grid.length));
  if (commonInvalid) {
    throw new Error(work.kind === 'craft' ? 'Invalid craft work payload' : 'Invalid disassembly work payload');
  }
  switch (work.kind) {
    case 'craft':
      validateCraftWorkItem(registry, work);
      return;
    case 'disassembly':
      validateDisassemblyWorkItem(registry, work);
      return;
    case 'pieceDisassembly':
      validatePieceDisassemblyWorkItem(registry, work);
      return;
    case 'cellDisassembly':
      validateCellDisassemblyWorkItem(registry, work);
      return;
    case 'partService':
      validatePartServiceWorkItem(registry, work);
      return;
    default:
      throw new Error('Unknown work kind');
  }
};

/** A fit holds exactly its one spare; a remove holds nothing, since its part leaves the slot only at the finish. */
const validatePartServiceWorkItem = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'partService' }>,
): void => {
  const slot = housingBlueprint(registry, work.furniture)?.slots.find(({ id }) => id === work.slot);
  const [spare, ...rest] = work.components;
  const components =
    work.operation === 'fit'
      ? rest.length === 0 && spare?.type === work.part && spare.count === 1
      : work.operation === 'remove' && spare === undefined;
  if (
    !(slot?.accepts.includes(work.part) && components) ||
    work.repairTarget !== undefined ||
    work.duration !== slot.service.timeGameMinutes
  ) {
    throw new Error('Invalid part service work payload');
  }
};

const validateCellDisassemblyWorkItem = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'cellDisassembly' }>,
): void => {
  const clear = rubbleClearWork(registry, work.block);
  if (
    !clear ||
    work.cell.length !== 3 ||
    !work.cell.every(Number.isSafeInteger) ||
    !Number.isSafeInteger(work.epoch) ||
    work.epoch < 1 ||
    work.components.length > 0 ||
    work.repairTarget !== undefined ||
    work.duration !== clear.timeGameMinutes ||
    !sameDisassemblyOutputs(clear.outputs, work.outputs)
  ) {
    throw new Error('Invalid disassembly work payload');
  }
};

const validatePieceDisassemblyWorkItem = (
  registry: Registry,
  work: Extract<NonNullable<ItemState['work']>, { kind: 'pieceDisassembly' }>,
): void => {
  const recovery = pieceRecoveryWork(registry, work.furniture, work.boarding);
  if (
    !recovery ||
    work.components.length > 0 ||
    work.repairTarget !== undefined ||
    work.duration !== recovery.timeGameMinutes ||
    !Number.isSafeInteger(work.skillLevel) ||
    work.skillLevel < SKILL_LEVEL_MIN ||
    work.skillLevel > SKILL_LEVEL_LEGENDARY ||
    !validPieceToolLevels(recovery, work.toolLevels) ||
    !sameDisassemblyOutputs(pieceDisassemblyOutputs(recovery, work.skillLevel, work.toolLevels), work.outputs)
  ) {
    throw new Error('Invalid disassembly work payload');
  }
};

/** Where an item lies in a grid, if it's in one. */
export const spotOf = (at: Location): Spot | undefined =>
  'placed' in at && at.placed.x !== undefined && at.placed.y !== undefined && at.placed.rotated !== undefined
    ? { x: at.placed.x, y: at.placed.y, rotated: at.placed.rotated }
    : undefined;

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
