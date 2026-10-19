/**
 * Where a vehicle piece stops movement and light. It is read from the same fitted parts that are drawn,
 * so collision cannot drift from the model (`DESIGN.md`, "Vehicles").
 */

import { BLUEPRINTS, CATALOGUE } from './catalogue.ts';
import { CELLS_PER_BLOCK, newInstance, PartLibrary, VOXELS_PER_CELL } from './model.ts';
import { GLASS, keyVoxel, type Vec3i, type VoxelGrid, voxelKey } from './voxels.ts';

const VOXELS_PER_BLOCK = CELLS_PER_BLOCK * VOXELS_PER_CELL;
const library = new PartLibrary(CATALOGUE);

interface Fitted {
  readonly grid: VoxelGrid;
  /** The voxel row the vehicle stands on: its lowest that isn't glass. */
  readonly baseY: number;
}

/** What decides a vehicle piece's body: its blueprint less the `removed` fittings, and the fill a block needs to block. */
interface VehicleBody {
  readonly blueprint: string;
  readonly removed: readonly string[];
  readonly solidFill: number;
}

const fitted = new Map<string, Fitted>();

/** A blueprint's voxels without the `removed` fittings. */
export const fittedGrid = (blueprint: string, removed: readonly string[]): Fitted => {
  const key = JSON.stringify([blueprint, removed]);
  let result = fitted.get(key);
  if (result === undefined) {
    const grid: VoxelGrid = new Map();
    for (const fitting of newInstance(BLUEPRINTS[blueprint]!, blueprint, removed).fittings) {
      for (const [voxel, material] of library.placed(fitting).grid) {
        grid.set(voxel, material);
      }
    }
    let baseY = Number.POSITIVE_INFINITY;
    for (const [voxel, material] of grid) {
      if (material !== GLASS) {
        baseY = Math.min(baseY, keyVoxel(voxel)[1]);
      }
    }
    result = { grid, baseY };
    fitted.set(key, result);
  }
  return result;
};

/**
 * The piece's own blocks, counted from its left, bottom and front, that its body fills to at least `solidFill`.
 * Each voxel column counts as filled from its lowest voxel to its highest, because the parts are thin shells
 * and a cabin's walls alone fill too little of a block to stop anyone walking into it. A block outside `size`
 * is kept so a load check can refuse it.
 */
export const solidBlocks = ({ blueprint, removed, solidFill }: VehicleBody, [width, , depth]: Vec3i): Vec3i[] => {
  const { grid, baseY } = fittedGrid(blueprint, removed);
  const [length, , across] = BLUEPRINTS[blueprint]!.lattice.map((cells) => cells * VOXELS_PER_CELL) as [
    number,
    number,
    number,
  ];
  const columns = new Map<number, [number, number]>();
  for (const voxel of grid.keys()) {
    const [x, y, z] = keyVoxel(voxel);
    const column = voxelKey(x, 0, z);
    const span = columns.get(column);
    columns.set(column, span ? [Math.min(span[0], y), Math.max(span[1], y)] : [y, y]);
  }
  // The model's forward +x is the piece's front, local −z, and its +z the piece's right, as `src/render/workshopVehicle.ts` draws it.
  const filled = new Map<string, number>();
  for (const [column, [low, high]] of columns) {
    const [x, , z] = keyVoxel(column);
    const i = Math.floor((z + 0.5 - across / 2) / VOXELS_PER_BLOCK + width / 2);
    const k = Math.floor((length / 2 - x - 0.5) / VOXELS_PER_BLOCK + depth / 2);
    for (let y = low; y <= high; y++) {
      const block = `${i},${Math.floor((y - baseY + 0.5) / VOXELS_PER_BLOCK)},${k}`;
      filled.set(block, (filled.get(block) ?? 0) + 1);
    }
  }
  const needed = solidFill * VOXELS_PER_BLOCK ** 3;
  return [...filled].flatMap(([block, count]) =>
    count >= needed ? [block.split(',').map(Number) as unknown as Vec3i] : [],
  );
};
