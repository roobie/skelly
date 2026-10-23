// Item instances and grid space (`DESIGN.md`, "The item model"). An item takes w × h
// cells and can be rotated; a container's pockets are grids. Identical, stateless
// items stack up to their type's limit.

import { assertBatteryEnergy, batteryFields } from './battery.ts';
import type { ItemDef, ModelDef, Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { firearmSlotIds } from './firearmFitting.ts';
import { assertFirearmState, type FirearmState, snapshotFirearm } from './firearmState.ts';
import {
  assertFoodExposure,
  equalFoodExposure,
  type FoodExposure,
  initialFoodExposure,
  projectFoodExposure,
} from './food.ts';
import { magazineContentsReason, magazineSpec, magazineWellCalibre, slotsReason } from './magazine.ts';
import { modelBodyMassKg } from './modelMass.ts';
import { assertPaperMapItem, type PaperMapCoverage } from './paperMap.ts';
import { freezeSnapshot } from './snapshotData.ts';

/** Craft or disassembly inputs/progress have exactly one owner: this ordinary item subtree. */
interface WorkProgress<Node> {
  elapsed: number;
  duration: number;
  components: Node[];
  repairTargetUid?: number;
  repairAmount?: number;
}
type CraftWork<Node> =
  | (WorkProgress<Node> & { kind: 'craft'; recipe: string })
  | (WorkProgress<Node> & {
      kind: 'disassembly';
      source: string;
      skillLevel: number;
      toolLevels: Record<string, number>;
      gather: number;
      outputs: { item: string; count: number }[];
    });

/** Scalar and pocket fields are shared by live items and their saved tree. */
export interface ItemFields<Node> {
  count: number;
  paperMap?: PaperMapCoverage;
  /** Units in this stack already included in the death-screen loot tally. */
  lootedCount?: number;
  /** 0 (ruined) to 1 (pristine). */
  condition: number;
  /** Battery charge, fuel and the like; absent means full (as found). */
  charges?: number | undefined;
  batteryMicrojoules?: number;
  /** A light that's switched on. */
  on?: boolean;
  /** Remaining consumable-light burn in Game seconds; absent until first ignition. */
  burnRemainingGameSeconds?: number;
  /** Game-clock timestamp at the last burn-state update; present only while lit. */
  litAtGameTimestamp?: number | undefined;
  /** An explosive whose pin is out (core/explosive.ts). */
  pinPulled?: true | undefined;
  /** An explosive's fuse left in Sim seconds; present once it has left the hand with the pin out. */
  fuseRemainingSimSeconds?: number;
  /** A trap lying set on the floor, or shut on a leg (core/bearTrap.ts); absent while it is safe to carry. */
  trap?: TrapState | undefined;
  /**
   * Game-clock timestamp when it was made; absent means before the world began (day 1,
   * 00:00). This is provenance, not the food exposure authority.
   */
  madeAtGameTimestamp?: number | undefined;
  foodExposure?: FoodExposure | undefined;
  /** One grid per pocket of the type's container, in the type's pocket order. */
  pockets?: PlacedItem<Node>[][];
  /** Chamber contents and in-flight mechanical action; separate from handling jobs. */
  firearm?: FirearmState;
  /** A magazine's cartridge item types in feed order, top round first (core/magazine.ts). */
  cartridges?: string[];
  /** A cargo space's size in inventory cells along x, y and z, kept from fitting to salvage (core/cargoSpace.ts). */
  cargo?: [x: number, y: number, z: number];
  /** Items fitted to this one, owned by it like work components. Keys are exported mount IDs or named device slots. */
  slots?: ItemSlots<Node>;
  work?: CraftWork<Node> | undefined;
}

/** Holding a zombie by id, or the player when `zombie` is absent. */
export type TrapState = { state: 'armed' } | { state: 'holding'; zombie?: number; remainingSimSeconds: number };

type ItemSlots<Node> = Record<string, Node>;

export interface Item extends ItemFields<Item> {
  /** Unique per world; never reused. */
  readonly uid: number;
  type: string;
}

/** An item in a grid, at its top-left cell. */
export interface PlacedItem<Node> {
  item: Node;
  x: number;
  y: number;
  rotated: boolean;
}

export interface ItemState extends ItemFields<ItemState> {
  uid: number;
  type: string;
}

export type Placed = PlacedItem<Item>;
export type PlacedState = PlacedItem<ItemState>;

const trapField = (trap: TrapState | undefined): { trap?: TrapState } =>
  trap === undefined ? {} : { trap: { ...trap } };

const cargoField = (cargo: ItemFields<unknown>['cargo']): Pick<ItemFields<unknown>, 'cargo'> =>
  cargo === undefined ? {} : { cargo: [...cargo] };

const foodExposureField = (
  exposure: FoodExposure | undefined,
  foodAt: number | undefined,
): { foodExposure?: FoodExposure } =>
  exposure === undefined
    ? {}
    : { foodExposure: foodAt === undefined ? { ...exposure } : projectFoodExposure(exposure, foodAt) };

const paperMapField = (paperMap: PaperMapCoverage | undefined): { paperMap?: PaperMapCoverage } =>
  paperMap === undefined ? {} : { paperMap: { ...paperMap } };

/**
 * Immutable, isolated item tree suitable for a save snapshot. With `foodAt`, the copy carries exposure settled at
 * that game millisecond while the live item keeps its own watermark, so capturing never changes live state.
 */
export const snapshotItem = (item: Item, foodAt?: number): Readonly<ItemState> =>
  freezeSnapshot({
    uid: item.uid,
    type: item.type,
    count: item.count,
    ...(item.lootedCount === undefined ? {} : { lootedCount: item.lootedCount }),
    condition: item.condition,
    ...batteryFields(item),
    ...(item.on === undefined ? {} : { on: item.on }),
    ...(item.burnRemainingGameSeconds === undefined ? {} : { burnRemainingGameSeconds: item.burnRemainingGameSeconds }),
    ...(item.litAtGameTimestamp === undefined ? {} : { litAtGameTimestamp: item.litAtGameTimestamp }),
    ...(item.pinPulled === undefined ? {} : { pinPulled: item.pinPulled }),
    ...(item.fuseRemainingSimSeconds === undefined ? {} : { fuseRemainingSimSeconds: item.fuseRemainingSimSeconds }),
    ...trapField(item.trap),
    ...(item.madeAtGameTimestamp === undefined ? {} : { madeAtGameTimestamp: item.madeAtGameTimestamp }),
    ...foodExposureField(item.foodExposure, foodAt),
    ...(item.firearm === undefined ? {} : { firearm: snapshotFirearm(item.firearm) }),
    ...(item.cartridges === undefined ? {} : { cartridges: [...item.cartridges] }),
    ...cargoField(item.cargo),
    ...paperMapField(item.paperMap),
    ...(item.slots === undefined
      ? {}
      : {
          slots: Object.fromEntries(
            Object.entries(item.slots)
              .filter((entry): entry is [string, Item] => entry[1] !== undefined)
              .map(([slot, child]) => [slot, snapshotItem(child, foodAt) as ItemState]),
          ),
        }),
    ...(item.pockets === undefined
      ? {}
      : { pockets: item.pockets.map((grid) => grid.map((placed) => snapshotPlaced(placed, foodAt))) }),
    ...(item.work === undefined
      ? {}
      : {
          work: {
            ...item.work,
            ...(item.work.kind === 'disassembly'
              ? {
                  outputs: item.work.outputs.map((output) => ({ ...output })),
                  toolLevels: { ...item.work.toolLevels },
                }
              : {}),
            components: item.work.components.map((component) => snapshotItem(component, foodAt) as ItemState),
          },
        }),
  });

export const snapshotPlaced = ({ item, x, y, rotated }: Placed, foodAt?: number): Readonly<PlacedState> =>
  freezeSnapshot({ item: snapshotItem(item, foodAt) as ItemState, x, y, rotated });

const assertSavedBurnState = (def: ItemDef, state: ItemState): void => {
  const burnTime = def.light?.burnTimeGameHours;
  const invalidRemaining =
    state.burnRemainingGameSeconds !== undefined &&
    (burnTime === undefined ||
      state.burnRemainingGameSeconds > burnTime ||
      !Number.isFinite(state.burnRemainingGameSeconds));
  const missingActiveState =
    state.litAtGameTimestamp !== undefined &&
    (burnTime === undefined || state.on !== true || state.burnRemainingGameSeconds === undefined);
  const litWithoutBurnState =
    burnTime !== undefined &&
    state.on === true &&
    (state.burnRemainingGameSeconds === undefined || state.litAtGameTimestamp === undefined);
  if (invalidRemaining || missingActiveState || litWithoutBurnState) {
    throw new Error('Invalid saved light burn state');
  }
};

/** A pin is pulled on one explosive, and only an explosive with its pin pulled has a fuse burning. */
const assertSavedFuse = (def: ItemDef, state: ItemState): void => {
  const fuse = state.fuseRemainingSimSeconds;
  const pinValid = state.pinPulled === undefined || (state.pinPulled === true && def.explosive && state.count === 1);
  const fuseValid =
    fuse === undefined ||
    (def.explosive !== undefined &&
      state.pinPulled &&
      Number.isFinite(fuse) &&
      fuse >= 0 &&
      fuse <= def.explosive.fuseSimSeconds);
  if (!(pinValid && fuseValid)) {
    throw new Error('Invalid saved explosive pin or fuse');
  }
};

/** Only a single trap is set or shut, and a hold never outlasts the trap's own. */
const assertSavedTrap = (def: ItemDef, state: ItemState): void => {
  const { trap } = state;
  if (trap === undefined) {
    return;
  }
  const holdValid =
    trap.state === 'armed' ||
    (Number.isFinite(trap.remainingSimSeconds) &&
      trap.remainingSimSeconds > 0 &&
      trap.remainingSimSeconds <= (def.trap?.holdSimSeconds ?? 0) &&
      (trap.zombie === undefined || Number.isSafeInteger(trap.zombie)));
  if (!(def.trap && state.count === 1 && holdValid)) {
    throw new Error('Invalid saved trap state');
  }
};

/** Only a cargo space has a size, in whole cells, and its one pocket is its floor. */
const assertSavedCargo = (def: ItemDef, state: ItemState): void => {
  const { cargo } = state;
  if (
    cargo !== undefined &&
    !(
      def.vehicle?.cargoSpace &&
      state.count === 1 &&
      cargo.length === 3 &&
      cargo.every((cells) => Number.isSafeInteger(cells) && cells >= 1) &&
      state.pockets?.length === 1
    )
  ) {
    throw new Error('Invalid saved cargo space');
  }
};

const assertSavedLootCount = (state: ItemState): void => {
  if (
    state.lootedCount !== undefined &&
    (!Number.isSafeInteger(state.lootedCount) || state.lootedCount < 0 || state.lootedCount > state.count)
  ) {
    throw new Error('Invalid saved looted item count');
  }
};

const restoreFirearmState = (registry: Registry, def: ItemDef, state: ItemState): FirearmState | undefined => {
  const { firearm } = state;
  if (firearm === undefined) {
    return undefined;
  }
  if (!def.firearm || state.count !== 1) {
    throw new Error('Mechanical firearm state needs one firearm');
  }
  assertFirearmState(firearm);
  assertAmmunition(registry, state.type, firearm);
  if (firearm.roundType !== undefined) {
    defOf(registry, firearm.roundType);
  }
  return structuredClone(firearm);
};

const restoreWork = (registry: Registry, work: NonNullable<ItemState['work']>): NonNullable<Item['work']> => ({
  ...work,
  ...(work.kind === 'disassembly'
    ? {
        outputs: work.outputs.map((output) => ({ ...output })),
        toolLevels: { ...work.toolLevels },
      }
    : {}),
  components: work.components.map((component) => restoreItem(registry, component)),
});

export const restoreItem = (registry: Registry, state: ItemState): Item => {
  const def = defOf(registry, state.type);
  assertFoodExposure(registry, state);
  assertSavedBurnState(def, state);
  assertSavedFuse(def, state);
  assertSavedTrap(def, state);
  assertSavedLootCount(state);
  assertSavedCargo(def, state);
  assertBatteryEnergy(registry, state);
  assertPaperMapItem(def, state.count, state.paperMap);
  const firearm = restoreFirearmState(registry, def, state);
  const magazineReason =
    magazineContentsReason(registry, state.type, state.cartridges) ?? slotsReason(registry, state.type, state.slots);
  if (magazineReason) {
    throw new Error(magazineReason);
  }
  return {
    uid: state.uid,
    type: state.type,
    count: state.count,
    ...(state.lootedCount === undefined ? {} : { lootedCount: state.lootedCount }),
    condition: state.condition,
    ...batteryFields(state),
    ...(state.on === undefined ? {} : { on: state.on }),
    ...(state.burnRemainingGameSeconds === undefined
      ? {}
      : { burnRemainingGameSeconds: state.burnRemainingGameSeconds }),
    ...(state.litAtGameTimestamp === undefined ? {} : { litAtGameTimestamp: state.litAtGameTimestamp }),
    ...(state.pinPulled === undefined ? {} : { pinPulled: state.pinPulled }),
    ...(state.fuseRemainingSimSeconds === undefined ? {} : { fuseRemainingSimSeconds: state.fuseRemainingSimSeconds }),
    ...trapField(state.trap),
    ...(state.madeAtGameTimestamp === undefined ? {} : { madeAtGameTimestamp: state.madeAtGameTimestamp }),
    ...(state.foodExposure === undefined ? {} : { foodExposure: { ...state.foodExposure } }),
    ...(firearm === undefined ? {} : { firearm }),
    ...(state.cartridges === undefined ? {} : { cartridges: [...state.cartridges] }),
    ...cargoField(state.cargo),
    ...paperMapField(state.paperMap),
    ...(state.slots === undefined
      ? {}
      : {
          slots: Object.fromEntries(
            Object.entries(state.slots).map(([slot, child]) => [slot, restoreItem(registry, child)]),
          ),
        }),
    ...(state.pockets === undefined
      ? {}
      : { pockets: state.pockets.map((grid) => grid.map((p) => restorePlaced(registry, p))) }),
    ...(state.work === undefined ? {} : { work: restoreWork(registry, state.work) }),
  };
};

export const restorePlaced = (registry: Registry, state: PlacedState): Placed => ({
  item: restoreItem(registry, state.item),
  x: state.x,
  y: state.y,
  rotated: state.rotated,
});

export interface GridSize {
  w: number;
  h: number;
}

/** A grid and what's in it. */
export interface GridState {
  size: GridSize;
  placed: readonly Placed[];
}

/** A place in a grid; `ignore` is an item whose own cells count as free (it's the one moving). */
export interface SpotCheck {
  x: number;
  y: number;
  rotated: boolean;
  ignore?: Item | undefined;
}

const addDefaultAttachments = (
  factory: ItemFactory,
  registry: Registry,
  item: Item,
  modelId: string | undefined,
): void => {
  const model = modelId === undefined ? undefined : registry.models.get(modelId);
  for (const attachment of model?.gun?.attachments ?? []) {
    const attachmentType = [...registry.items.values()].find((candidate) => {
      const attachmentModel = candidate.model === undefined ? undefined : registry.models.get(candidate.model);
      return attachmentModel?.gun?.attachment?.id === attachment.id;
    });
    if (!attachmentType?.model) {
      throw new Error(`No item registered for default attachment "${attachment.id}"`);
    }
    item.slots = {
      ...(item.slots ?? {}),
      [attachment.mountedAt]: factory.create(registry, attachmentType.id, 1),
    };
  }
};

const initializeFittedSlots = (factory: ItemFactory, registry: Registry, item: Item, def: ItemDef): void => {
  if (magazineWellCalibre(registry, def.id) !== undefined) {
    item.firearm = { chamber: 'empty' };
    item.slots = {};
  } else if (def.firearm && firearmSlotIds(registry, def).length > 0) {
    item.slots = {};
  }
  if (def.light?.power) {
    item.slots = {
      ...(item.slots ?? {}),
      battery: factory.create(registry, def.light.power.battery, 1),
    };
  }
  if (def.tool?.fuel) {
    item.slots = { ...(item.slots ?? {}) };
  }
  addDefaultAttachments(factory, registry, item, def.model);
};

/** Makes item instances, handing out uids. */
export class ItemFactory {
  private nextUid: number;

  constructor(nextUid = 1) {
    this.nextUid = nextUid;
  }

  /** The uid the next item will get, for saves. */
  get next(): number {
    return this.nextUid;
  }

  create(
    registry: Registry,
    type: string,
    count = 1,
    { condition = 1, paperMap, madeAt = 0 }: { condition?: number; paperMap?: PaperMapCoverage; madeAt?: number } = {},
  ): Item {
    const def = defOf(registry, type);
    assertPaperMapItem(def, count, paperMap);
    const item: Item = {
      uid: this.nextUid,
      type,
      count,
      condition,
      ...paperMapField(paperMap),
    };
    const exposure = initialFoodExposure(registry, def, madeAt);
    if (exposure) {
      item.foodExposure = exposure;
      item.madeAtGameTimestamp = madeAt;
    }
    this.nextUid += 1;
    if (def.container) {
      item.pockets = def.container.pockets.map(() => []);
    }
    if (def.firearm?.pump || def.firearm?.bolt) {
      item.firearm = { chamber: 'empty', tube: [], ...(def.firearm.bolt ? { actionOpen: false } : {}) };
    }
    const model = def.model ? registry.models.get(def.model) : undefined;
    if (def.firearm && model?.gun?.revolver) {
      item.firearm = {
        cylinder: {
          chambers: Array.from({ length: model.gun.revolver.chambers }, () => ({ state: 'empty' })),
          aligned: 0,
          open: false,
          cocked: false,
        },
      };
    }
    initializeFittedSlots(this, registry, item, def);
    if (magazineSpec(registry, type)) {
      item.cartridges = [];
    }
    if (def.igniter) {
      item.charges = def.igniter.capacity;
    }
    return item;
  }

  /** Takes `count` off a stack into a new instance. */
  split(item: Item, count: number): Item {
    if (item.paperMap !== undefined || count <= 0 || count >= item.count) {
      throw new Error(`can't split ${count} off a stack of ${item.count}`);
    }
    item.count -= count;
    const part: Item = { uid: this.nextUid, type: item.type, count, condition: item.condition };
    const splitLootedCount = Math.min(item.lootedCount ?? 0, count);
    if (splitLootedCount > 0) {
      part.lootedCount = splitLootedCount;
      item.lootedCount = (item.lootedCount ?? 0) - splitLootedCount;
    }
    this.nextUid += 1;
    if (item.charges !== undefined) {
      part.charges = item.charges;
    }
    if (item.batteryMicrojoules !== undefined) {
      part.batteryMicrojoules = item.batteryMicrojoules;
    }
    if (item.madeAtGameTimestamp !== undefined) {
      part.madeAtGameTimestamp = item.madeAtGameTimestamp;
    }
    if (item.foodExposure !== undefined) {
      part.foodExposure = { ...item.foodExposure };
    }
    if (item.burnRemainingGameSeconds !== undefined) {
      part.burnRemainingGameSeconds = item.burnRemainingGameSeconds;
    }
    if (item.litAtGameTimestamp !== undefined) {
      part.litAtGameTimestamp = item.litAtGameTimestamp;
    }
    return part;
  }
}

export const defOf = (registry: Registry, type: string): ItemDef => {
  const def = registry.items.get(type);
  if (!def) {
    throw new Error(`content does not define item "${type}"`);
  }
  return def;
};

/** A magazine-fed chamber holds exactly one cartridge of the firearm's calibre when loaded. */
const assertMagazineFedChamber = (registry: Registry, type: string, state: FirearmState): void => {
  if (state.tube !== undefined) {
    throw new Error('Tube state needs a pump firearm');
  }
  const calibre = magazineWellCalibre(registry, type);
  if (
    (state.chamber === 'round') !== (state.roundType !== undefined) ||
    (state.roundType !== undefined && defOf(registry, state.roundType).ammo?.calibre !== calibre)
  ) {
    throw new Error('Chambered round needs one cartridge of the firearm calibre');
  }
};

const assertCylinderAmmunition = (registry: Registry, model: ModelDef, state: FirearmState): void => {
  if (!state.cylinder || state.cylinder.chambers.length !== model.gun!.revolver!.chambers) {
    throw new Error('Cylinder chamber count does not match exported model');
  }
  for (const chamber of state.cylinder.chambers) {
    if (chamber.state === 'round' && defOf(registry, chamber.roundType).ammo?.calibre !== model.gun?.calibre) {
      throw new Error('Cylinder ammunition calibre mismatch');
    }
  }
};

const assertIntegralAmmunition = (registry: Registry, model: ModelDef | undefined, state: FirearmState): void => {
  if (
    !(state.tube && model?.gun?.internalMagazine) ||
    state.tube.length > model.gun.internalMagazine.capacity ||
    state.cycle?.mode === 'fire'
  ) {
    throw new Error('Invalid exported integral magazine state');
  }
  if ((state.chamber === 'round') !== (state.roundType !== undefined)) {
    throw new Error('Integral-magazine chamber needs exactly one real cartridge');
  }
  for (const round of [
    ...state.tube,
    ...(state.roundType ? [state.roundType] : []),
    ...(state.retainedRoundType ? [state.retainedRoundType] : []),
  ]) {
    if (defOf(registry, round).ammo?.calibre !== model.gun?.calibre) {
      throw new Error('Integral-magazine ammunition calibre mismatch');
    }
  }
};

/** Content-coupled constraints checked when rebuilding items from a decoded snapshot. */
const assertAmmunition = (registry: Registry, type: string, state: FirearmState): void => {
  const def = defOf(registry, type);
  if (
    (state.actionOpen !== undefined || state.cycle?.phase !== undefined || state.retainedRoundType !== undefined) &&
    !def.firearm?.bolt
  ) {
    throw new Error('Action-open state needs a bolt firearm');
  }
  const revolverModel = def.model ? registry.models.get(def.model) : undefined;
  if (revolverModel?.gun?.revolver) {
    assertCylinderAmmunition(registry, revolverModel, state);
    return;
  }
  if (state.cylinder) {
    throw new Error('Cylinder state needs a revolver model');
  }
  if (!(def.firearm?.pump || def.firearm?.bolt)) {
    assertMagazineFedChamber(registry, type, state);
    return;
  }
  assertIntegralAmmunition(registry, revolverModel, state);
};

/** Width and height in cells, as placed. */
export const footprint = (def: ItemDef, rotated: boolean): [number, number] =>
  rotated ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]];

export const cellCount = (def: ItemDef): number => def.size[0] * def.size[1];

/** True when the item has no pockets, or they're all empty. */
export const isEmpty = (item: Item): boolean =>
  !item.work &&
  Object.values(item.slots ?? {}).every((child) => child === undefined) &&
  (item.pockets ?? []).every((grid) => grid.length === 0);

/** Recipes may explicitly consume fitted parts, but never hidden pocket contents or unfinished work. */
export const craftComponentEligible = (item: Item, consumeFitted = false): boolean =>
  isEmpty(item) || (consumeFitted && !item.work && (item.pockets ?? []).every((grid) => grid.length === 0));

/** Condition as a word, from the content band table (`DESIGN.md`, "The item model"). */
export const conditionWord = (registry: Registry, condition: number): string => {
  const bands = registry.inventory.get(CORE_CONTENT_IDS.player)!.conditionBands;
  return (bands.findLast((band) => band.from <= condition) ?? bands[0]!).word;
};

/** The band word for a condition below the top band; a thing in the top band reads by its plain name. */
export const damageWord = (registry: Registry, condition: number): string | undefined => {
  const bands = registry.inventory.get(CORE_CONTENT_IDS.player)!.conditionBands;
  return condition < bands.at(-1)!.from ? conditionWord(registry, condition) : undefined;
};

/** How many of `item` could join the `onto` stack. */
export const stackRoom = (registry: Registry, onto: Item, item: Item): number => {
  const def = defOf(registry, onto.type);
  const same =
    onto !== item &&
    onto.type === item.type &&
    onto.condition === item.condition &&
    onto.charges === item.charges &&
    onto.batteryMicrojoules === item.batteryMicrojoules &&
    onto.madeAtGameTimestamp === item.madeAtGameTimestamp &&
    equalFoodExposure(onto, item) &&
    onto.firearm === undefined &&
    item.firearm === undefined &&
    !def.paperMap &&
    onto.paperMap === undefined &&
    item.paperMap === undefined &&
    isEmpty(onto) &&
    isEmpty(item);
  return same && def.stack !== undefined ? Math.max(0, def.stack - onto.count) : 0;
};

const overlaps = (a: [number, number, number, number], b: [number, number, number, number]): boolean =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Whether `item` fits at a spot in a grid. */
export const fitsAt = (registry: Registry, grid: GridState, item: Item, at: SpotCheck): boolean => {
  const [w, h] = footprint(defOf(registry, item.type), at.rotated);
  if (at.x < 0 || at.y < 0 || at.x + w > grid.size.w || at.y + h > grid.size.h) {
    return false;
  }
  const box: [number, number, number, number] = [at.x, at.y, w, h];
  return grid.placed.every((p) => {
    if (p.item === at.ignore) {
      return true;
    }
    const [pw, ph] = footprint(defOf(registry, p.item.type), p.rotated);
    return !overlaps(box, [p.x, p.y, pw, ph]);
  });
};

/** The first free spot, scanning rows from the top: as it is first, then rotated. */
export const findSpot = (
  registry: Registry,
  grid: GridState,
  item: Item,
  ignore?: Item,
): { x: number; y: number; rotated: boolean } | undefined => {
  const def = defOf(registry, item.type);
  const turns = def.size[0] === def.size[1] ? [false] : [false, true];
  for (const rotated of turns) {
    for (let y = 0; y < grid.size.h; y++) {
      for (let x = 0; x < grid.size.w; x++) {
        if (fitsAt(registry, grid, item, { x, y, rotated, ignore })) {
          return { x, y, rotated };
        }
      }
    }
  }
  return undefined;
};

/** Whether a footprint fits an empty grid of this size, either way round. */
export const sizeFits = ([w, h]: readonly [number, number], grid: GridSize): boolean =>
  (w <= grid.w && h <= grid.h) || (h <= grid.w && w <= grid.h);

/** Whether the item could fit in an empty grid of this size, either way round. */
export const couldFit = (registry: Registry, grid: GridSize, item: Item): boolean =>
  sizeFits(defOf(registry, item.type).size, grid);

/** The placed item covering a cell, if any. */
export const itemAt = (registry: Registry, placed: readonly Placed[], x: number, y: number): Placed | undefined =>
  placed.find((p) => {
    const [w, h] = footprint(defOf(registry, p.item.type), p.rotated);
    return x >= p.x && x < p.x + w && y >= p.y && y < p.y + h;
  });

export const typeWeightGrams = (registry: Registry, type: string): number => {
  const def = defOf(registry, type);
  const model = def.model === undefined ? undefined : registry.models.get(def.model);
  if (def.model !== undefined && model === undefined) {
    throw new Error(`Missing model ${def.model}`);
  }
  if (model?.parts !== undefined) {
    if (def.weight !== undefined) {
      throw new Error(`Assembly ${type} also authors an item weight`);
    }
    return modelBodyMassKg(model) * 1000;
  }
  if (def.weight === undefined) {
    throw new Error(`Atom ${type} has no authored item weight`);
  }
  return def.weight;
};

/** Grams, counting the stack, ammunition and everything in its pockets. */
export const weightOf = (registry: Registry, item: Item): number =>
  (typeWeightGrams(registry, item.type) +
    (defOf(registry, item.type).serving ? typeWeightGrams(registry, defOf(registry, item.type).serving!.food) : 0)) *
    item.count +
  ammunitionWeight(registry, item) +
  (item.cartridges ?? []).reduce((sum, round) => sum + typeWeightGrams(registry, round), 0) +
  Object.values(item.slots ?? {}).reduce((sum, child) => sum + (child ? weightOf(registry, child) : 0), 0) +
  (item.pockets ?? []).flat().reduce((sum, p) => sum + weightOf(registry, p.item), 0) +
  (item.work?.components ?? []).reduce((sum, component) => sum + weightOf(registry, component), 0);

const ammunitionWeight = (registry: Registry, item: Item): number => {
  const state = item.firearm;
  if (!state) {
    return 0;
  }
  const rounds = [
    ...(state.tube ?? []),
    ...(state.roundType ? [state.roundType] : []),
    ...(state.retainedRoundType ? [state.retainedRoundType] : []),
    ...(state.cylinder?.chambers.flatMap((chamber) => (chamber.state === 'round' ? [chamber.roundType] : [])) ?? []),
  ];
  const modelId = defOf(registry, item.type).model;
  const calibre = modelId ? registry.models.get(modelId)?.gun?.calibre : undefined;
  const hull =
    state.chamber === 'case' || state.cylinder?.chambers.some((chamber) => chamber.state === 'case')
      ? [...registry.items.values()].find((def) => {
          const model = def.model ? registry.models.get(def.model) : undefined;
          return model?.id.startsWith('case_') && model.gun?.calibre === calibre;
        })
      : undefined;
  return rounds.reduce(
    (sum, type) => sum + typeWeightGrams(registry, type),
    (hull ? typeWeightGrams(registry, hull.id) : 0) *
      (state.cylinder?.chambers.filter((chamber) => chamber.state === 'case').length ?? 1),
  );
};
