/**
 * Where a content vehicle piece stops movement and light. It is read from the same fitted part collision that
 * the piece is drawn from, so collision cannot drift from the model (`packages/deadvox/DESIGN.md`, "Vehicles").
 * The parts' collision is placed in the model frame — z forward, y up, the near side at −x, metres, origin at
 * the vehicle's ground centre — and read into the piece's cell coordinates: the model's forward +z is the
 * piece's front, local −z, and its −x near side the piece's +x, with the kept parts' bounds centred in the
 * piece and their lowest collision on its floor. Each column counts as filled from its lowest box to its highest,
 * because the parts are thin shells whose walls alone fill too little of a block to stop anyone.
 * `contentVehicleFrame` is the one frame the renderer also draws in, so where the piece stops movement is where it is
 * drawn.
 */

import type { Registry } from './content.ts';
import type { FurnitureDef } from './schema.ts';
import { type ShapeBox, shapeBlocks } from './shapeSolid.ts';
import { placeFitting } from './vehicleBlueprint.ts';

/** A box's corners in the model frame, in metres. */
interface Corners {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Where the model frame sits in a piece, in metres: `cx` and `cz` centre the kept parts, `cy` is their lowest point. */
interface VehicleFrame {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
}

const frameCache = new Map<string, VehicleFrame>();
const cellsCache = new Map<string, readonly ShapeBox[]>();

/**
 * The frame both the piece's collision and its drawing read the kept parts in. The kept parts' bounds are centred
 * across the piece, and their lowest collision stands on the piece's floor: a wreck without its wheels rests on what
 * is left rather than hovering where the wheels held it. The model frame's origin is the vehicle's ground under its
 * wheels, so with them kept the frame matches a live vehicle's.
 */
export const contentVehicleFrame = (
  registry: Registry,
  { blueprint: id, removed }: NonNullable<FurnitureDef['vehicle']>,
): VehicleFrame => {
  const key = JSON.stringify([id, removed]);
  const known = frameCache.get(key);
  if (known !== undefined) {
    return known;
  }
  const blueprint = registry.vehicleBlueprints.get(id);
  const low = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const high = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const fitting of blueprint?.fittings ?? []) {
    if (removed.includes(fitting.id)) {
      continue;
    }
    for (const { min, max } of placeFitting(registry, fitting).collision as readonly Corners[]) {
      for (const axis of [0, 1, 2]) {
        low[axis] = Math.min(low[axis]!, min[axis]!);
        high[axis] = Math.max(high[axis]!, max[axis]!);
      }
    }
  }
  const frame = Number.isFinite(low[0])
    ? { cx: (low[0]! + high[0]!) / 2, cy: low[1]!, cz: (low[2]! + high[2]!) / 2 }
    : { cx: 0, cy: 0, cz: 0 };
  frameCache.set(key, frame);
  return frame;
};

/**
 * Where a model-frame point (metres) sits in an upright piece of `width` by `depth` cells, in cells from its left,
 * bottom and front: the model's +x near side is the piece's −x, its forward +z the piece's front at −z.
 */
export const contentVehiclePiecePoint = (
  { cx, cy, cz }: VehicleFrame,
  [width, , depth]: FurnitureDef['size'],
  blockSize: number,
  [x, y, z]: readonly [number, number, number],
): [number, number, number] => [
  width / 2 - (x - cx) / blockSize,
  (y - cy) / blockSize,
  depth / 2 - (z - cz) / blockSize,
];

/** The blueprint's kept columns, in the piece's cell coordinates: each spans its lowest box bottom to its highest box top. */
export const contentVehicleCells = (
  registry: Registry,
  look: NonNullable<FurnitureDef['vehicle']>,
  size: FurnitureDef['size'],
  blockSize: number,
): readonly ShapeBox[] => {
  const key = JSON.stringify([look.blueprint, look.removed, size[0], size[2], blockSize]);
  const known = cellsCache.get(key);
  if (known !== undefined) {
    return known;
  }
  const frame = contentVehicleFrame(registry, look);
  const blueprint = registry.vehicleBlueprints.get(look.blueprint);
  const columns = new Map<string, [number, number]>();
  const boxes = (blueprint?.fittings ?? [])
    .filter(({ id }) => !look.removed.includes(id))
    .flatMap((fitting) => placeFitting(registry, fitting).collision);
  for (const { min, max } of boxes) {
    // The model's max corner is the piece's low corner on x and z, which both turn about.
    const [xLow, low, zLow] = contentVehiclePiecePoint(frame, size, blockSize, [max[0]!, min[1]!, max[2]!]);
    const [xHigh, high, zHigh] = contentVehiclePiecePoint(frame, size, blockSize, [min[0]!, max[1]!, min[2]!]);
    const x0 = Math.floor(xLow);
    const x1 = Math.ceil(xHigh);
    const z0 = Math.floor(zLow);
    const z1 = Math.ceil(zHigh);
    for (let x = x0; x < x1; x += 1) {
      for (let z = z0; z < z1; z += 1) {
        const column = `${x},${z}`;
        const span = columns.get(column);
        columns.set(column, span ? [Math.min(span[0], low), Math.max(span[1], high)] : [low, high]);
      }
    }
  }
  const cells: ShapeBox[] = [...columns].map(([column, [low, high]]) => {
    const [x, z] = column.split(',').map(Number) as [number, number];
    return { position: [x, low, z], size: [1, high - low, 1] };
  });
  cellsCache.set(key, cells);
  return cells;
};

/** The piece's own blocks, counted from its left, bottom and front, that its columns fill to at least `solidFill`. */
export const contentVehicleBlocks = (
  registry: Registry,
  look: NonNullable<FurnitureDef['vehicle']>,
  size: FurnitureDef['size'],
  blockSize: number,
): readonly ReturnType<typeof shapeBlocks>[number][] =>
  shapeBlocks(contentVehicleCells(registry, look, size, blockSize), look.solidFill);
