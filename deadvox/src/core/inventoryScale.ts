// Inventory space at real size (`DESIGN.md`, "The item model"): content names the side of one cell, and every
// footprint and pocket is a real size rounded up to it. These checks hold content to that unit.

import type { FurnitureDef, ItemDef, ModelDef, Registry } from './content.ts';
import type { GridSize } from './items.ts';
import { BLOCK_SIZE } from './scale.ts';

/** What one block of floor holds. A long item lies past the block's edge, so the pile is longer than the block. */
export const PILE_GRID: GridSize = { w: 12, h: 6 };

// Rounding metres up to cells must not turn a float's last bit into a whole extra cell.
const cellsFor = (metres: number, cellMetres: number): number => Math.ceil(metres / cellMetres - 1e-9);

const fits = ([w, h]: readonly [number, number], grid: GridSize): boolean =>
  (w <= grid.w && h <= grid.h) || (h <= grid.w && w <= grid.h);

/** How far the model's grip and anchors reach along its long x axis: a floor for the real length. */
const anchorSpanMetres = (model: ModelDef): number | undefined => {
  const xs = [...Object.values(model.anchors ?? {}), ...(model.grip ? [model.grip.at] : [])].map(([x]) => x);
  return xs.length < 2 ? undefined : Math.max(...xs) - Math.min(...xs);
};

/** An item's long side must cover what its model's anchors already span. */
export const footprintScaleIssue = (registry: Registry, item: ItemDef, cellMetres: number): string | undefined => {
  const model = item.model === undefined ? undefined : registry.models.get(item.model);
  const span = model && anchorSpanMetres(model);
  if (span === undefined) {
    return undefined;
  }
  const needed = cellsFor(span, cellMetres);
  return Math.max(...item.size) >= needed
    ? undefined
    : `model "${item.model}" spans ${needed} cells between its anchors, longer than the footprint`;
};

/** A pocket can't be larger than the furniture's two largest sides, in cells. */
export const pocketScaleIssue = (
  furniture: FurnitureDef,
  grid: readonly [number, number],
  cellMetres: number,
): string | undefined => {
  const [long, short] = [...furniture.size]
    .sort((a, b) => b - a)
    .map((blocks) => cellsFor(blocks * BLOCK_SIZE, cellMetres));
  return fits(grid, { w: long!, h: short! }) ? undefined : 'pocket is larger than the furniture it is inside';
};

const tableItems = (registry: Registry, table: string, seen = new Set<string>()): Set<string> => {
  const items = new Set<string>();
  if (seen.has(table)) {
    return items;
  }
  seen.add(table);
  for (const entry of registry.loot.get(table)?.entries ?? []) {
    if (entry.item !== undefined) {
      items.add(entry.item);
    } else if (entry.table !== undefined) {
      for (const item of tableItems(registry, entry.table, seen)) {
        items.add(item);
      }
    }
  }
  return items;
};

// Furnishing leaves out a rolled item that fits no pocket, so an oversized table entry would never appear.
export const rolledFitIssue = (registry: Registry, furniture: FurnitureDef, table: string): string | undefined => {
  const pockets = furniture.container?.pockets ?? [];
  const misfit = [...tableItems(registry, table)].find((id) => {
    const item = registry.items.get(id);
    return item && !pockets.some(({ grid: [w, h] }) => fits(item.size, { w, h }));
  });
  return misfit === undefined
    ? undefined
    : `loot table "${table}" rolls "${misfit}", which fits no pocket of "${furniture.id}"`;
};

/** Dropping puts an item in a floor pile, so every item has to fit one. */
export const pileFitIssue = (item: ItemDef, pile: GridSize): string | undefined =>
  fits(item.size, pile) ? undefined : 'footprint is larger than a floor pile';
