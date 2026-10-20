/**
 * Where a shaped piece stops movement and light. It is read from the same boxes that are drawn, so collision
 * cannot drift from the look (`docs/content.md`, "Furniture solidity").
 */

import type { Vec3 } from './coords.ts';

interface ShapeBox {
  readonly position: readonly number[];
  readonly size: readonly number[];
}

interface Span {
  readonly low: readonly number[];
  readonly high: readonly number[];
}

const AXES = [0, 1, 2] as const;
const solids = new Map<string, readonly Vec3[]>();

/** How much of the block at `corner` the boxes cover, counting overlaps once. */
const filledShare = (boxes: readonly ShapeBox[], corner: Vec3): number => {
  const clipped: Span[] = [];
  for (const { position, size } of boxes) {
    const low = AXES.map((axis) => Math.max(position[axis]!, corner[axis]));
    const high = AXES.map((axis) => Math.min(position[axis]! + size[axis]!, corner[axis] + 1));
    if (AXES.every((axis) => low[axis]! < high[axis]!)) {
      clipped.push({ low, high });
    }
  }
  const cuts = AXES.map((axis) =>
    [...new Set(clipped.flatMap(({ low, high }) => [low[axis]!, high[axis]!]))].sort((a, b) => a - b),
  );
  const [xs, ys, zs] = cuts as [number[], number[], number[]];
  let share = 0;
  for (let i = 1; i < xs.length; i++) {
    for (let j = 1; j < ys.length; j++) {
      for (let k = 1; k < zs.length; k++) {
        const middle = [(xs[i - 1]! + xs[i]!) / 2, (ys[j - 1]! + ys[j]!) / 2, (zs[k - 1]! + zs[k]!) / 2];
        if (
          clipped.some(({ low, high }) =>
            AXES.every((axis) => low[axis]! < middle[axis]! && middle[axis]! < high[axis]!),
          )
        ) {
          share += (xs[i]! - xs[i - 1]!) * (ys[j]! - ys[j - 1]!) * (zs[k]! - zs[k - 1]!);
        }
      }
    }
  }
  return share;
};

/** The piece's own blocks, counted from its left, bottom and front, that its shape fills to at least `solidFill`. */
export const shapeBlocks = (shape: readonly ShapeBox[], solidFill: number): readonly Vec3[] => {
  const key = JSON.stringify([shape, solidFill]);
  const known = solids.get(key);
  if (known !== undefined) {
    return known;
  }
  const candidates = new Map<string, Vec3>();
  for (const { position, size } of shape) {
    const [x0, y0, z0] = AXES.map((axis) => Math.floor(position[axis]!));
    const [x1, y1, z1] = AXES.map((axis) => Math.ceil(position[axis]! + size[axis]!));
    for (let x = x0!; x < x1!; x++) {
      for (let y = y0!; y < y1!; y++) {
        for (let z = z0!; z < z1!; z++) {
          candidates.set(`${x},${y},${z}`, [x, y, z]);
        }
      }
    }
  }
  const blocks = [...candidates.values()].filter((corner) => filledShare(shape, corner) >= solidFill);
  solids.set(key, blocks);
  return blocks;
};
