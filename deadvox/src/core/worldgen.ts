import { Chunk } from './chunk.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { fbm2 } from './random.ts';
import type { Scale } from './scale.ts';
import { type BlockBox, stampChunk } from './structure.ts';

/** Registry ids of the blocks terrain is made of. */
export interface TerrainBlocks {
  grass: number;
  dirt: number;
  stone: number;
  sand: number;
}

/**
 * Changes to the natural ground, such as flattened lots and roads. Both are pure
 * functions of the column, so any chunk can be generated on its own.
 */
export interface Surface {
  /** The top block's height in blocks, given the natural one. */
  height: (x: number, z: number, natural: number) => number;
  /** The top block's id, or undefined for the natural one. */
  top: (x: number, z: number) => number | undefined;
}

/** Everything terrain generation depends on. */
export interface Terrain {
  seed: number;
  blocks: TerrainBlocks;
  scale: Scale;
  surface?: Surface | undefined;
  /** Writes buildings into a chunk once its terrain is done. */
  stamp?: ((chunk: Chunk) => void) | undefined;
}

/** A column's top block heights and any top blocks the surface replaces (-1 keeps the natural one). */
export interface ColumnSurface {
  heights: Int32Array;
  tops: Int32Array;
}

// Terrain is defined in metres, so every block size gives the same landscape.
export const MIN_HEIGHT_M = 8;
export const MAX_HEIGHT_M = 56;
const BEACH_BELOW_M = 14;
const DIRT_DEPTH_M = 2;
const FEATURE_SIZE_M = 96;

/** Ground height in metres at a point in metres. */
export const terrainHeightMetres = (seed: number, xm: number, zm: number): number =>
  MIN_HEIGHT_M + fbm2(seed, xm / FEATURE_SIZE_M, zm / FEATURE_SIZE_M, 4) * (MAX_HEIGHT_M - MIN_HEIGHT_M);

/** Y (in blocks) of the top solid block of the column at block (x, z). Sampled at the block's centre. */
export const terrainHeight = (seed: number, scale: Scale, x: number, z: number): number => {
  const s = scale.blockSize;
  return Math.floor(terrainHeightMetres(seed, (x + 0.5) * s, (z + 0.5) * s) / s);
};

/** Top block heights for a chunk column, CHUNK×CHUNK, indexed x + CHUNK * z. */
export const columnHeights = (seed: number, scale: Scale, cx: number, cz: number): Int32Array => {
  const out = new Int32Array(CHUNK * CHUNK);
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      out[lx + CHUNK * lz] = terrainHeight(seed, scale, cx * CHUNK + lx, cz * CHUNK + lz);
    }
  }
  return out;
};

/** A column's heights with the surface's changes applied. */
export const columnSurface = ({ seed, scale, surface }: Terrain, cx: number, cz: number): ColumnSurface => {
  const heights = columnHeights(seed, scale, cx, cz);
  const tops = new Int32Array(CHUNK * CHUNK).fill(-1);
  if (surface) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const [x, z] = [cx * CHUNK + lx, cz * CHUNK + lz];
        const i = lx + CHUNK * lz;
        heights[i] = surface.height(x, z, heights[i]!);
        tops[i] = surface.top(x, z) ?? -1;
      }
    }
  }
  return { heights, tops };
};

/** The block at height y in a column whose top block is at h (both in blocks), unless `top` replaces it. */
const blockAt = ({ blocks, scale }: Terrain, y: number, h: number, top: number): number => {
  if (y === h) {
    if (top >= 0) {
      return top;
    }
    return h * scale.blockSize < BEACH_BELOW_M ? blocks.sand : blocks.grass;
  }
  return y > h - DIRT_DEPTH_M / scale.blockSize ? blocks.dirt : blocks.stone;
};

export const generateChunk = (terrain: Terrain, [cx, cy, cz]: Vec3, column = columnSurface(terrain, cx, cz)): Chunk => {
  const { blocks, scale } = terrain;
  const { heights, tops } = column;
  const y0 = cy * CHUNK;
  // Entirely below the dirt layer of every column: all stone, no per-block writes.
  if (y0 + CHUNK - 1 <= Math.min(...heights) - DIRT_DEPTH_M / scale.blockSize) {
    return new Chunk(cx, cy, cz, blocks.stone);
  }
  const chunk = new Chunk(cx, cy, cz);
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const h = heights[lx + CHUNK * lz]!;
      const top = Math.min(h - y0, CHUNK - 1);
      for (let ly = 0; ly <= top; ly++) {
        chunk.set(lx, ly, lz, blockAt(terrain, y0 + ly, h, tops[lx + CHUNK * lz]!));
      }
    }
  }
  return chunk;
};

/**
 * Every chunk of the column (cx, cz) inside the world's vertical range, bottom first,
 * with any structures stamped in, then whatever the terrain's `stamp` writes.
 */
export const generateColumn = (
  terrain: Terrain,
  cx: number,
  cz: number,
  structures: readonly BlockBox[] = [],
): Chunk[] => {
  const { scale } = terrain;
  const column = columnSurface(terrain, cx, cz);
  const out: Chunk[] = [];
  for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
    const chunk = generateChunk(terrain, [cx, cy, cz], column);
    stampChunk(chunk, structures);
    terrain.stamp?.(chunk);
    chunk.compact();
    out.push(chunk);
  }
  return out;
};
