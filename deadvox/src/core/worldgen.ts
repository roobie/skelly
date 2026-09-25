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

/** Everything terrain generation depends on. */
export interface Terrain {
  seed: number;
  blocks: TerrainBlocks;
  scale: Scale;
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

/** The block at height y in a column whose top block is at h (both in blocks). */
const blockAt = (blocks: TerrainBlocks, scale: Scale, y: number, h: number): number => {
  if (y === h) {
    return h * scale.blockSize < BEACH_BELOW_M ? blocks.sand : blocks.grass;
  }
  return y > h - DIRT_DEPTH_M / scale.blockSize ? blocks.dirt : blocks.stone;
};

export const generateChunk = (
  { seed, blocks, scale }: Terrain,
  [cx, cy, cz]: Vec3,
  heights = columnHeights(seed, scale, cx, cz),
): Chunk => {
  const chunk = new Chunk(cx, cy, cz);
  const y0 = cy * CHUNK;
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const h = heights[lx + CHUNK * lz]!;
      const top = Math.min(h - y0, CHUNK - 1);
      for (let ly = 0; ly <= top; ly++) {
        chunk.set(lx, ly, lz, blockAt(blocks, scale, y0 + ly, h));
      }
    }
  }
  return chunk;
};

/**
 * Every chunk of the column (cx, cz) inside the world's vertical range, bottom first,
 * with any structures stamped in.
 */
export const generateColumn = (
  terrain: Terrain,
  cx: number,
  cz: number,
  structures: readonly BlockBox[] = [],
): Chunk[] => {
  const { seed, scale } = terrain;
  const heights = columnHeights(seed, scale, cx, cz);
  const out: Chunk[] = [];
  for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
    const chunk = generateChunk(terrain, [cx, cy, cz], heights);
    stampChunk(chunk, structures);
    out.push(chunk);
  }
  return out;
};
