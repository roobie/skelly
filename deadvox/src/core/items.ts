// Item instances and grid space (DESIGN.md, "The item model"). An item takes w × h
// cells and can be rotated; a container's pockets are grids. Identical, stateless
// items stack up to their type's limit.

import type { ItemDef, Registry } from './content.ts';

export interface Item {
  /** Unique per world; never reused. */
  readonly uid: number;
  readonly type: string;
  count: number;
  /** 0 (ruined) to 1 (pristine). */
  condition: number;
  /** Battery charge, fuel and the like. */
  charges?: number;
  /** One grid per pocket of the type's container, in the type's pocket order. */
  pockets?: Placed[][];
}

/** An item in a grid, at its top-left cell. */
export interface Placed {
  item: Item;
  x: number;
  y: number;
  rotated: boolean;
}

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

/** Width and height in cells, as placed. */
export const footprint = (def: ItemDef, rotated: boolean): [number, number] =>
  rotated ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]];

export const cellCount = (def: ItemDef): number => def.size[0] * def.size[1];

/** True when the item has no pockets, or they're all empty. */
export const isEmpty = (item: Item): boolean => (item.pockets ?? []).every((grid) => grid.length === 0);

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

/** Grams, counting the stack and everything in its pockets. */
export const weightOf = (registry: Registry, item: Item): number =>
  defOf(registry, item.type).weight * item.count +
  (item.pockets ?? []).flat().reduce((sum, p) => sum + weightOf(registry, p.item), 0);
