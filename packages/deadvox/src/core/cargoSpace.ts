/**
 * Cargo spaces (`DESIGN.md`, "Vehicles", **Cargo space.**): a block resting on a load floor, whose footprint on
 * the inventory cell lattice is its one pocket. The free floor bounds where a player can drag one out; fitting
 * refuses a block outside it, above its clearance, or a part placed into a fitted cargo space.
 */
import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { Item, ItemFactory } from './items.ts';
import { type ItemDef, VEHICLE_ADDON_FACES, type VehicleFittingDef } from './schema.ts';
import type { PlacedFitting } from './vehicleBlueprint.ts';

/** A cargo space's size in inventory cells along x, y and z. */
export type CargoCells = readonly [x: number, y: number, z: number];

export type CargoSpaceDef = NonNullable<NonNullable<ItemDef['vehicle']>['cargoSpace']>;
type Container = NonNullable<ItemDef['container']>;

/** Exported collision is float metres; this absorbs its rounding against the cell lattice. */
const EPSILON = 1e-6;

/** Legal cells on a supporting part's capability-selected face. */
export interface PlacementRegion {
  readonly support: string;
  readonly plane: number;
  readonly face: (typeof VEHICLE_ADDON_FACES)[keyof typeof VEHICLE_ADDON_FACES];
  /** Free cells by `cellKey`, each with the metres clear above it. */
  readonly clearance: ReadonlyMap<string, number>;
  /** The lattice the load floor is drawn on, which cargo standing on it snaps to. */
  readonly lattice: Lattice;
}

type Lattice = PlacedFitting['lattice'];

/**
 * The plane of `lattice` nearest `value` along `axis`: a cargo space is a datum, so like every other it stands on
 * the drawn voxels of the floor it rests on (`packages/thing-export/README.md`, "Voxelized export").
 */
const snap = (lattice: Lattice, value: number, axis: number): number => {
  if (!lattice) {
    return value;
  }
  const origin = lattice.origin[axis]!;
  return origin + Math.round((value - origin) / lattice.grain) * lattice.grain;
};

/** `box` with each face on its nearest plane of `lattice`, where the drawn voxels put it. */
export const snapBox = (lattice: Lattice, { min, max }: ModelBox): ModelBox => ({
  min: [snap(lattice, min[0], 0), snap(lattice, min[1], 1), snap(lattice, min[2], 2)],
  max: [snap(lattice, max[0], 0), snap(lattice, max[1], 1), snap(lattice, max[2], 2)],
});

/** Cell (i, k) spans x from i to i + 1 cells and z from k to k + 1 cells, in the vehicle frame. */
const cellKey = (i: number, k: number): string => `${i},${k}`;

/** Inventory cells `metres` across over one load floor, each snapped to its `lattice` as cargo on it would be. */
interface FaceCells {
  readonly metres: number;
  readonly lattice: Lattice;
  readonly face: PlacementRegion['face'];
}

/** Cell indices along `axis`: those lying inside the span, or those it overlaps (touching excluded). */
const cellSpan = (
  { metres, lattice }: FaceCells,
  [low, high]: readonly [number, number],
  axis: number,
  inside: boolean,
) => {
  const cells: number[] = [];
  for (let n = Math.floor(low / metres) - 1; n <= Math.ceil(high / metres); n += 1) {
    const [from, to] = [snap(lattice, n * metres, axis), snap(lattice, (n + 1) * metres, axis)];
    const kept = inside ? from >= low - EPSILON && to <= high + EPSILON : from < high - EPSILON && to > low + EPSILON;
    if (kept) {
      cells.push(n);
    }
  }
  return cells;
};

const planCells = (cells: FaceCells, { min, max }: ModelBox, inside: boolean): string[] => {
  const [a, b] = cells.face.tangents;
  return cellSpan(cells, [min[a], max[a]], a, inside).flatMap((i) =>
    cellSpan(cells, [min[b], max[b]], b, inside).map((k) => cellKey(i, k)),
  );
};

/**
 * A word opens its face; all regions share lattice and fitted-collision subtraction.
 */
export const placementRegion = (
  fittings: readonly PlacedFitting[],
  support: string,
  cellMetres: number,
  addon: NonNullable<PlacedFitting['addon']>,
): PlacementRegion | undefined => {
  const floor = fittings.find(({ id }) => id === support);
  if (!floor?.capabilities.includes(addon.requires)) {
    return undefined;
  }
  const face = VEHICLE_ADDON_FACES[addon.requires];
  const plane = Math.max(...floor.collision.map(({ max }) => max[face.normal]));
  const { lattice } = floor;
  const cells: FaceCells = { metres: cellMetres, lattice, face };
  const clearance = new Map<string, number>();
  for (const faceBox of floor.collision.filter(({ max }) => Math.abs(max[face.normal] - plane) < EPSILON)) {
    for (const key of planCells(cells, faceBox, true)) {
      clearance.set(key, addon.openClearanceCells ? addon.openClearanceCells * cellMetres : Number.POSITIVE_INFINITY);
    }
  }
  for (const fitting of fittings) {
    for (const box of fitting === floor ? [] : drawnCollision(fittings, fitting)) {
      narrow(clearance, box, plane, cells);
    }
  }
  return { support, plane, face, clearance, lattice };
};

/** A thin add-on may fit below an obstruction within the first cell, so keep its actual clearance. */
const narrow = (clearance: Map<string, number>, box: ModelBox, plane: number, cells: FaceCells): void => {
  const axis = cells.face.normal;
  if (box.max[axis] <= plane + EPSILON) {
    return;
  }
  const standing = box.min[axis] <= plane + EPSILON;
  for (const key of planCells(cells, box, false).filter((at) => clearance.has(at))) {
    if (standing) {
      clearance.delete(key);
    } else {
      clearance.set(key, Math.min(clearance.get(key)!, box.min[axis] - plane));
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

/** A fitting's collision as drawn: a cargo space's cell block snapped onto the load floor it rests on. */
const drawnCollision = (fittings: readonly PlacedFitting[], fitting: PlacedFitting): readonly ModelBox[] => {
  if (!fitting.cargo) {
    return fitting.collision;
  }
  const floor = fittings.find(
    ({ id, capabilities }) => fitting.supportedBy.includes(id) && capabilities.includes('load_floor'),
  );
  return fitting.collision.map((box) => snapBox(floor?.lattice, box));
};

const addonIssue = (
  present: readonly PlacedFitting[],
  candidate: PlacedFitting,
  cellMetres: number,
): string | undefined => {
  const block = bounds(candidate.collision);
  const addon = candidate.addon!;
  const subject = candidate.cargo ? 'a cargo space' : 'an add-on';
  const floors = candidate.supportedBy.flatMap((id) => placementRegion(present, id, cellMetres, addon) ?? []);
  if (floors.length === 0 || floors.length !== candidate.supportedBy.length) {
    return `${subject} must rest on a ${addon.requires.replaceAll('_', ' ')}`;
  }
  const floor = floors.find(
    ({ plane, lattice, face }) => Math.abs(plane - snap(lattice, block.min[face.normal], face.normal)) < EPSILON,
  );
  if (!floor) {
    return `${subject} must stand on its support’s face`;
  }
  const [a, b] = floor.face.tangents;
  const [i0, k0] = [block.min[a] / cellMetres, block.min[b] / cellMetres];
  if (Math.abs(i0 - Math.round(i0)) > EPSILON || Math.abs(k0 - Math.round(k0)) > EPSILON) {
    return `${subject} must lie on the inventory cell lattice`;
  }
  const cells = candidate.cargo?.cells ?? [
    Math.ceil((block.max[0] - block.min[0]) / cellMetres),
    Math.ceil((block.max[1] - block.min[1]) / cellMetres),
    Math.ceil((block.max[2] - block.min[2]) / cellMetres),
  ];
  let clear = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cells[a]!; i += 1) {
    for (let k = 0; k < cells[b]!; k += 1) {
      const above = floor.clearance.get(cellKey(Math.round(i0) + i, Math.round(k0) + k));
      if (above === undefined) {
        return `${subject} must lie within the free floor of ${floor.support}`;
      }
      clear = Math.min(clear, above);
    }
  }
  const drawn = snapBox(floor.lattice, block);
  return drawn.max[floor.face.normal] - drawn.min[floor.face.normal] > clear + EPSILON
    ? `${subject} must not rise above the clearance over ${floor.support}`
    : undefined;
};

/**
 * Why `candidate` can't be fitted beside `present`: add-ons need their word's free region and all parts must
 * stay out of fitted cargo spaces.
 */
export const fitIssue = (
  present: readonly PlacedFitting[],
  candidate: PlacedFitting,
  cellMetres: number,
): string | undefined => {
  if (candidate.addon) {
    const issue = addonIssue(present, candidate, cellMetres);
    if (issue) {
      return issue;
    }
  }
  const all = [...present, candidate];
  const hold = present.find(
    (fitting) =>
      fitting.cargo &&
      drawnCollision(all, fitting).some((box) => candidate.collision.some((other) => overlaps(box, other))),
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
