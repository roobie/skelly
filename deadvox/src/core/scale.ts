// Block size and what follows from it. Everything the player sees or tunes is in
// metres; the voxel grid is in blocks. The game uses BLOCK_SIZE; the benchmark can
// build other scales to compare them.

import { CHUNK } from './coords.ts';

/** The world's vertical extent in metres (DESIGN.md, "Scale and units"). */
export const WORLD_BOTTOM_M = -48;
export const WORLD_TOP_M = 80;

/** Edge length of a block in metres. Chosen in milestone 1.0 (SLICE-1.md, Results). */
export const BLOCK_SIZE = 0.5;

export interface Scale {
  /** Edge length of one block, in metres. */
  readonly blockSize: number;
  /** Lowest and highest chunk layer (inclusive) that covers the world's height. */
  readonly minCy: number;
  readonly maxCy: number;
}

export const makeScale = (blockSize: number): Scale => ({
  blockSize,
  minCy: Math.floor(WORLD_BOTTOM_M / blockSize / CHUNK),
  maxCy: Math.ceil(WORLD_TOP_M / blockSize / CHUNK) - 1,
});

/** Metres to blocks (fractional). */
export const toBlocks = (scale: Scale, metres: number): number => metres / scale.blockSize;

/** Blocks to metres. */
export const toMetres = (scale: Scale, blocks: number): number => blocks * scale.blockSize;

/** How many chunks a horizontal distance in metres spans, rounded up. */
export const chunksFor = (scale: Scale, metres: number): number => Math.ceil(metres / (CHUNK * scale.blockSize));
