/**
 * Where a content vehicle piece stops movement and light. It is read from the same fitted part collision that
 * the piece is drawn from, so collision cannot drift from the model (`packages/deadvox/DESIGN.md`, "Vehicles").
 * The parts' collision is placed in the model frame — z forward, y up, the near side at −x, metres, origin at
 * the vehicle's ground centre — and read into the piece's cell coordinates: the model's forward +z is the
 * piece's front, local −z, and its −x near side the piece's +x, with the kept parts' bounds centred in the
 * piece. Like the spike catalogue's voxels (`packages/engine/src/vehicles/solid.ts`), each column counts as
 * filled from its lowest box to its highest, because the parts are thin shells whose walls alone fill too
 * little of a block to stop anyone. `contentVehicleFrame` is the same centring for the renderer, so where the
 * piece stops movement is where it is drawn.
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

const frameCache = new Map<string, { cx: number; cz: number }>();
const cellsCache = new Map<string, readonly ShapeBox[]>();

/** Where the model's ground origin sits inside the piece, in metres: the kept parts' bounds are centred. */
export const contentVehicleFrame = (
  registry: Registry,
  { blueprint: id, removed }: NonNullable<FurnitureDef['vehicle']>,
): { cx: number; cz: number } => {
  const key = JSON.stringify([id, removed]);
  const known = frameCache.get(key);
  if (known !== undefined) {
    return known;
  }
  const blueprint = registry.vehicleBlueprints.get(id);
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  if (blueprint) {
    for (const fitting of blueprint.fittings) {
      if (removed.includes(fitting.id)) {
        continue;
      }
      for (const { min, max } of placeFitting(registry, fitting).collision as readonly Corners[]) {
        xMin = Math.min(xMin, min[0]);
        xMax = Math.max(xMax, max[0]);
        zMin = Math.min(zMin, min[2]);
        zMax = Math.max(zMax, max[2]);
      }
    }
  }
  const frame = Number.isFinite(xMin) ? { cx: (xMin + xMax) / 2, cz: (zMin + zMax) / 2 } : { cx: 0, cz: 0 };
  frameCache.set(key, frame);
  return frame;
};

/** The blueprint's kept columns, in the piece's cell coordinates: each spans its lowest box bottom to its highest box top. */
export const contentVehicleCells = (
  registry: Registry,
  look: NonNullable<FurnitureDef['vehicle']>,
  [width, , depth]: FurnitureDef['size'],
  blockSize: number,
): readonly ShapeBox[] => {
  const key = JSON.stringify([look.blueprint, look.removed, width, depth, blockSize]);
  const known = cellsCache.get(key);
  if (known !== undefined) {
    return known;
  }
  const { cx, cz } = contentVehicleFrame(registry, look);
  const blueprint = registry.vehicleBlueprints.get(look.blueprint);
  const columns = new Map<string, [number, number]>();
  if (blueprint) {
    for (const fitting of blueprint.fittings) {
      if (look.removed.includes(fitting.id)) {
        continue;
      }
      for (const { min, max } of placeFitting(registry, fitting).collision as readonly Corners[]) {
        const x = Math.floor(width / 2 - (max[0] - cx) / blockSize);
        const z = Math.floor(depth / 2 - (max[2] - cz) / blockSize);
        const column = `${x},${z}`;
        const low = min[1] / blockSize;
        const high = max[1] / blockSize;
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
