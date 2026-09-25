// Structures are lists of boxes defined in metres, applied in order. Rasterizing
// turns them into block boxes for one block size; stamping writes them into chunks.

import type { Chunk } from './chunk.ts';
import { CHUNK, type Vec3 } from './coords.ts';

/** A box in metres filled with one block id (0 carves air). Applied after the boxes before it. */
export interface MetreBox {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly block: number;
}

/** A box in block coordinates; `max` is exclusive. */
export interface BlockBox {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly block: number;
}

// Tolerance for coordinates that are whole multiples of the block size.
const EPS = 1e-6;

/**
 * Converts metre boxes to block boxes. A box covers every block it touches, and at
 * least one block on each axis, so a 0.5 m wall is one block thick at any block size.
 */
export const rasterize = (boxes: readonly MetreBox[], blockSize: number): BlockBox[] =>
  boxes.map(({ min, max, block }) => {
    const lo = min.map((v) => Math.floor(v / blockSize + EPS)) as Vec3;
    const hi = max.map((v, i) => Math.max(Math.ceil(v / blockSize - EPS), lo[i]! + 1)) as Vec3;
    return { min: lo, max: hi, block };
  });

/** Writes the part of each box that falls inside the chunk. */
export const stampChunk = (chunk: Chunk, boxes: readonly BlockBox[]): void => {
  const origin: Vec3 = [chunk.cx * CHUNK, chunk.cy * CHUNK, chunk.cz * CHUNK];
  for (const { min, max, block } of boxes) {
    const [x0, y0, z0] = min.map((v, i) => Math.max(v - origin[i]!, 0)) as Vec3;
    const [x1, y1, z1] = max.map((v, i) => Math.min(v - origin[i]!, CHUNK)) as Vec3;
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          chunk.set(x, y, z, block);
        }
      }
    }
  }
};
