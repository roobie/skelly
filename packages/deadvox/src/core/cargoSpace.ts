/**
 * Cargo spaces (`DESIGN.md`, "Vehicles", **Cargo space.**): a block resting on a load floor, whose footprint on
 * the inventory cell lattice is its one pocket. The free floor bounds where a player can drag one out; fitting
 * refuses a block outside it, above its clearance, or a part placed into a fitted cargo space.
 */
import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { Item, ItemFactory } from './items.ts';
import type { ItemDef, VehicleFittingDef } from './schema.ts';
import type { PlacedFitting } from './vehicleBlueprint.ts';

/** A cargo space's size in inventory cells along x, y and z. */
export type CargoCells = readonly [x: number, y: number, z: number];

export type CargoSpaceDef = NonNullable<NonNullable<ItemDef['vehicle']>['cargoSpace']>;
type Container = NonNullable<ItemDef['container']>;

/** Exported collision is float metres; this absorbs its rounding against the cell lattice. */
const EPSILON = 1e-6;

/** The cells of one load floor that a cargo space may cover. */
export interface FreeFloor {
  readonly support: string;
  /** The load floor's top face, vehicle metres. */
  readonly top: number;
  /** Free cells by `cellKey`, each with the metres clear above it. */
  readonly clearance: ReadonlyMap<string, number>;
}

/** Cell (i, k) spans x from i to i + 1 cells and z from k to k + 1 cells, in the vehicle frame. */
const cellKey = (i: number, k: number): string => `${i},${k}`;

/** Cell indices along one axis: those lying inside the span, or those it overlaps (touching excluded). */
const cellSpan = (low: number, high: number, cell: number, inside: boolean): number[] => {
  const first = inside ? Math.ceil(low / cell - EPSILON) : Math.floor(low / cell + EPSILON);
  const end = inside ? Math.floor(high / cell + EPSILON) : Math.ceil(high / cell - EPSILON);
  return Array.from({ length: Math.max(end - first, 0) }, (_, n) => first + n);
};

const planCells = ({ min, max }: ModelBox, cell: number, inside: boolean): string[] =>
  cellSpan(min[0], max[0], cell, inside).flatMap((i) =>
    cellSpan(min[2], max[2], cell, inside).map((k) => cellKey(i, k)),
  );

/**
 * The free floor of load floor `support`: its top face less what stands in the cell-high layer above it, each
 * cell's clearance being the lowest fitting above it, or `openClearanceMetres` where nothing is.
 */
export const freeFloor = (
  fittings: readonly PlacedFitting[],
  support: string,
  cellMetres: number,
  openClearanceMetres: number,
): FreeFloor | undefined => {
  const floor = fittings.find(({ id }) => id === support);
  if (!floor?.capabilities.includes('load_floor')) {
    return undefined;
  }
  const top = Math.max(...floor.collision.map(({ max }) => max[1]));
  const clearance = new Map<string, number>();
  for (const face of floor.collision.filter(({ max }) => Math.abs(max[1] - top) < EPSILON)) {
    for (const key of planCells(face, cellMetres, true)) {
      clearance.set(key, openClearanceMetres);
    }
  }
  for (const fitting of fittings) {
    for (const box of fitting === floor ? [] : fitting.collision) {
      narrow(clearance, box, top, cellMetres);
    }
  }
  return { support, top, clearance };
};

/** Takes a box above the floor out of the cells under it: whole where it stands in the first cell's layer. */
const narrow = (clearance: Map<string, number>, box: ModelBox, top: number, cellMetres: number): void => {
  if (box.max[1] <= top + EPSILON) {
    return;
  }
  const standing = box.min[1] < top + cellMetres - EPSILON;
  for (const key of planCells(box, cellMetres, false).filter((at) => clearance.has(at))) {
    if (standing) {
      clearance.delete(key);
    } else {
      clearance.set(key, Math.min(clearance.get(key)!, box.min[1] - top));
    }
  }
};

/** A cargo space's pocket: its footprint, whatever its height. */
export const cargoGrid = ([x, , z]: CargoCells, { handlingSimSeconds, wideReason }: CargoSpaceDef): Container => ({
  pockets: [{ grid: [x, z], handlingSimSeconds }],
  ...(wideReason === undefined ? {} : { wideReason }),
});

const bounds = (boxes: readonly ModelBox[]): ModelBox => ({
  min: [0, 1, 2].map((axis) => Math.min(...boxes.map(({ min }) => min[axis]!))) as [number, number, number],
  max: [0, 1, 2].map((axis) => Math.max(...boxes.map(({ max }) => max[axis]!))) as [number, number, number],
});

const overlaps = (a: ModelBox, b: ModelBox): boolean =>
  [0, 1, 2].every((axis) => a.min[axis]! < b.max[axis]! - EPSILON && b.min[axis]! < a.max[axis]! - EPSILON);

const cargoIssue = (
  present: readonly PlacedFitting[],
  candidate: PlacedFitting,
  cells: CargoCells,
  cellMetres: number,
): string | undefined => {
  const block = bounds(candidate.collision);
  const openMetres = (candidate.cargo?.openClearanceCells ?? 0) * cellMetres;
  const floors = candidate.supportedBy.flatMap((id) => freeFloor(present, id, cellMetres, openMetres) ?? []);
  if (floors.length === 0) {
    return 'a cargo space must rest on a load floor';
  }
  const floor = floors.find(({ top }) => Math.abs(top - block.min[1]) < EPSILON);
  if (!floor) {
    return 'a cargo space must stand on its load floor’s top face';
  }
  const [i0, k0] = [block.min[0] / cellMetres, block.min[2] / cellMetres];
  if (Math.abs(i0 - Math.round(i0)) > EPSILON || Math.abs(k0 - Math.round(k0)) > EPSILON) {
    return 'a cargo space must lie on the inventory cell lattice';
  }
  let clear = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cells[0]; i += 1) {
    for (let k = 0; k < cells[2]; k += 1) {
      const above = floor.clearance.get(cellKey(Math.round(i0) + i, Math.round(k0) + k));
      if (above === undefined) {
        return `a cargo space must lie within the free floor of ${floor.support}`;
      }
      clear = Math.min(clear, above);
    }
  }
  return block.max[1] - block.min[1] > clear + EPSILON
    ? `a cargo space must not rise above the clearance over ${floor.support}`
    : undefined;
};

/**
 * Why `candidate` can't be fitted beside `present`, the vehicle's other fittings. A cargo space must lie on a
 * supporting load floor's free floor, below its clearance; any other part must stay out of fitted cargo spaces.
 */
export const fitIssue = (
  present: readonly PlacedFitting[],
  candidate: PlacedFitting,
  cellMetres: number,
): string | undefined => {
  if (candidate.cargo) {
    return cargoIssue(present, candidate, candidate.cargo.cells, cellMetres);
  }
  const hold = present.find(
    ({ cargo, collision }) =>
      cargo && collision.some((box) => candidate.collision.some((other) => overlaps(box, other))),
  );
  return hold && `${candidate.id} would stand inside cargo space ${hold.id}`;
};

/**
 * A cargo space item of `type` sized `cells`, with its pocket empty. Salvage keeps the size and contents on the
 * item (`DESIGN.md`, "Vehicles", rule 6), and `cargoFitting` refits it at that size.
 */
export const cargoSpaceItem = (factory: ItemFactory, registry: Registry, type: string, cells: CargoCells): Item => {
  const item = factory.create(registry, type, 1);
  item.cargo = [...cells];
  item.pockets = [[]];
  return item;
};

/** The fitting that refits a cargo space item at its own size. */
export const cargoFitting = (
  item: Item,
  placement: Pick<VehicleFittingDef, 'id' | 'at' | 'supportedBy'>,
): VehicleFittingDef => {
  if (!item.cargo) {
    throw new Error(`Item ${item.uid} has no cargo space size`);
  }
  return { ...placement, part: item.type, cargo: [...item.cargo] };
};
