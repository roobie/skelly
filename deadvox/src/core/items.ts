// Item instances and grid space (DESIGN.md, "The item model"). An item takes w × h
// cells and can be rotated; a container's pockets are grids. Identical, stateless
// items stack up to their type's limit.

import type { ItemDef, Registry } from './content.ts';
import { assertFirearmState, type FirearmState, snapshotFirearm } from './firearmState.ts';
import { freezeSnapshot } from './snapshotData.ts';

/** Craft or disassembly inputs/progress have exactly one owner: this ordinary item subtree. */
interface WorkProgress<Node> {
  elapsed: number;
  duration: number;
  components: Node[];
}
export type CraftWork<Node> =
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
  /** 0 (ruined) to 1 (pristine). */
  condition: number;
  /** Battery charge, fuel and the like; absent means full (as found). */
  charges?: number;
  /** A light that's switched on. */
  on?: boolean;
  /**
   * Calendar seconds when it was made; absent means before the world began (day 1,
   * 00:00). Food rots from then (core/food.ts).
   */
  made?: number;
  /** One grid per pocket of the type's container, in the type's pocket order. */
  pockets?: PlacedItem<Node>[][];
  /** Chamber contents and in-flight mechanical action; separate from handling jobs. */
  firearm?: FirearmState;
  work?: CraftWork<Node> | undefined;
}

export interface Item extends ItemFields<Item> {
  /** Unique per world; never reused. */
  readonly uid: number;
  readonly type: string;
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

/** Immutable, isolated item tree suitable for a save snapshot. */
export const snapshotItem = (item: Item): Readonly<ItemState> =>
  freezeSnapshot({
    uid: item.uid,
    type: item.type,
    count: item.count,
    condition: item.condition,
    ...(item.charges === undefined ? {} : { charges: item.charges }),
    ...(item.on === undefined ? {} : { on: item.on }),
    ...(item.made === undefined ? {} : { made: item.made }),
    ...(item.firearm === undefined ? {} : { firearm: snapshotFirearm(item.firearm) }),
    ...(item.pockets === undefined ? {} : { pockets: item.pockets.map((grid) => grid.map(snapshotPlaced)) }),
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
            components: item.work.components.map((component) => snapshotItem(component) as ItemState),
          },
        }),
  });

export const snapshotPlaced = ({ item, x, y, rotated }: Placed): Readonly<PlacedState> =>
  freezeSnapshot({ item: snapshotItem(item) as ItemState, x, y, rotated });

export const restoreItem = (registry: Registry, state: ItemState): Item => {
  const def = defOf(registry, state.type);
  if (state.firearm !== undefined) {
    if (!def.firearm || state.count !== 1) {
      throw new Error('Mechanical firearm state needs one firearm');
    }
    assertFirearmState(state.firearm);
    assertPumpAmmunition(registry, state.type, state.firearm);
    if (state.firearm.roundType !== undefined) {
      defOf(registry, state.firearm.roundType);
    }
  }
  const item: Item = {
    uid: state.uid,
    type: state.type,
    count: state.count,
    condition: state.condition,
    ...(state.charges === undefined ? {} : { charges: state.charges }),
    ...(state.on === undefined ? {} : { on: state.on }),
    ...(state.made === undefined ? {} : { made: state.made }),
    ...(state.firearm === undefined ? {} : { firearm: structuredClone(state.firearm) }),
    ...(state.pockets === undefined
      ? {}
      : { pockets: state.pockets.map((grid) => grid.map((p) => restorePlaced(registry, p))) }),
  };
  if (state.work) {
    item.work = {
      ...state.work,
      ...(state.work.kind === 'disassembly'
        ? {
            outputs: state.work.outputs.map((output) => ({ ...output })),
            toolLevels: { ...state.work.toolLevels },
          }
        : {}),
      components: state.work.components.map((component) => restoreItem(registry, component)),
    };
  }
  return item;
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

  create(registry: Registry, type: string, count = 1, condition = 1): Item {
    const def = defOf(registry, type);
    const item: Item = { uid: this.nextUid, type, count, condition };
    this.nextUid += 1;
    if (def.container) {
      item.pockets = def.container.pockets.map(() => []);
    }
    if (def.firearm?.pump) {
      item.firearm = { chamber: 'empty', tube: [] };
    }
    return item;
  }

  /** Takes `count` off a stack into a new instance. */
  split(item: Item, count: number): Item {
    if (count <= 0 || count >= item.count) {
      throw new Error(`can't split ${count} off a stack of ${item.count}`);
    }
    item.count -= count;
    const part: Item = { uid: this.nextUid, type: item.type, count, condition: item.condition };
    this.nextUid += 1;
    if (item.charges !== undefined) {
      part.charges = item.charges;
    }
    if (item.made !== undefined) {
      part.made = item.made;
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

/** Content-coupled constraints checked when rebuilding items from a decoded snapshot. */
export const assertPumpAmmunition = (registry: Registry, type: string, state: FirearmState): void => {
  const def = defOf(registry, type);
  if (!def.firearm?.pump) {
    if (state.tube !== undefined || state.landing !== undefined) {
      throw new Error('Tube/landing state needs a pump firearm');
    }
    return;
  }
  const model = def.model ? registry.models.get(def.model) : undefined;
  if (!(state.tube && model?.tube) || state.tube.length > model.tube.capacity || state.cycle?.mode === 'fire') {
    throw new Error('Invalid exported pump tube state');
  }
  if ((state.chamber === 'round') !== (state.roundType !== undefined)) {
    throw new Error('Pump chamber needs exactly one real cartridge');
  }
  for (const round of [...state.tube, ...(state.roundType ? [state.roundType] : [])]) {
    if (defOf(registry, round).ammo?.calibre !== model.calibre) {
      throw new Error('Pump ammunition calibre mismatch');
    }
  }
};

/** Width and height in cells, as placed. */
export const footprint = (def: ItemDef, rotated: boolean): [number, number] =>
  rotated ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]];

export const cellCount = (def: ItemDef): number => def.size[0] * def.size[1];

/** True when the item has no pockets, or they're all empty. */
export const isEmpty = (item: Item): boolean => !item.work && (item.pockets ?? []).every((grid) => grid.length === 0);

/** Condition as a word (DESIGN.md, "The item model"). */
export const conditionWord = (condition: number): string => {
  if (condition >= 0.9) {
    return 'pristine';
  }
  if (condition >= 0.6) {
    return 'worn';
  }
  if (condition >= 0.3) {
    return 'damaged';
  }
  return condition >= 0.1 ? 'badly damaged' : 'ruined';
};

/** How many of `item` could join the `onto` stack. */
export const stackRoom = (registry: Registry, onto: Item, item: Item): number => {
  const def = defOf(registry, onto.type);
  const same =
    onto !== item &&
    onto.type === item.type &&
    onto.condition === item.condition &&
    onto.charges === item.charges &&
    onto.made === item.made &&
    onto.firearm === undefined &&
    item.firearm === undefined &&
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

/** Whether the item could fit in an empty grid of this size, either way round. */
export const couldFit = (registry: Registry, grid: GridSize, item: Item): boolean => {
  const [w, h] = defOf(registry, item.type).size;
  return (w <= grid.w && h <= grid.h) || (h <= grid.w && w <= grid.h);
};

/** The placed item covering a cell, if any. */
export const itemAt = (registry: Registry, placed: readonly Placed[], x: number, y: number): Placed | undefined =>
  placed.find((p) => {
    const [w, h] = footprint(defOf(registry, p.item.type), p.rotated);
    return x >= p.x && x < p.x + w && y >= p.y && y < p.y + h;
  });

/** Grams, counting the stack, ammunition and everything in its pockets. */
export const weightOf = (registry: Registry, item: Item): number =>
  defOf(registry, item.type).weight * item.count +
  ammunitionWeight(registry, item) +
  (item.pockets ?? []).flat().reduce((sum, p) => sum + weightOf(registry, p.item), 0) +
  (item.work?.components ?? []).reduce((sum, component) => sum + weightOf(registry, component), 0);

const ammunitionWeight = (registry: Registry, item: Item): number => {
  const state = item.firearm;
  if (!state?.tube) {
    return 0;
  }
  const rounds = [...state.tube, ...(state.roundType ? [state.roundType] : [])];
  const modelId = defOf(registry, item.type).model;
  const calibre = modelId ? registry.models.get(modelId)?.calibre : undefined;
  const hull =
    state.chamber === 'case'
      ? [...registry.items.values()].find((def) => {
          const model = def.model ? registry.models.get(def.model) : undefined;
          return model?.id.startsWith('case_') && model.calibre === calibre;
        })
      : undefined;
  return rounds.reduce((sum, type) => sum + defOf(registry, type).weight, hull?.weight ?? 0);
};
