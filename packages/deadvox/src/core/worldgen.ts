import { Chunk } from './chunk.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { fbm2 } from './random.ts';
import type { Scale } from './scale.ts';
import { type BlockBox, stampChunk } from './structure.ts';

/** Registry ids of the blocks terrain is made of. */
export interface TerrainBlocks {
  grass: number;
  dirt: number;
  rock: number;
  sand: number;
  water: number;
}

/** The natural ground's recipe, from site-generation content. All lengths are metres. */
export interface TerrainShape {
  readonly minHeightMetres: number;
  readonly maxHeightMetres: number;
  readonly beachBelowMetres: number;
  readonly dirtDepthMetres: number;
  readonly featureSizeMetres: number;
  readonly octaves: number;
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
  /** The standing water's top face in blocks, or undefined for none; generateChunk decides which cells it fills. */
  water?: ((x: number, z: number) => number | undefined) | undefined;
}

/** Everything terrain generation depends on. */
export interface Terrain {
  seed: number;
  blocks: TerrainBlocks;
  shape: TerrainShape;
  scale: Scale;
  surface?: Surface | undefined;
  /** Writes buildings into a chunk once its terrain is done. */
  stamp?: ((chunk: Chunk) => void) | undefined;
}

/**
 * A column's top block heights, any top blocks the surface replaces (-1 keeps the natural one), and
 * the water's top face (NO_WATER for none).
 */
export interface ColumnSurface {
  heights: Int32Array;
  tops: Int32Array;
  water: Int32Array;
}

const NO_WATER = -0x8000_0000;

// Terrain is defined in metres, so every block size gives the same landscape.

/** Ground height in metres at a point in metres. */
export const terrainHeightMetres = (seed: number, shape: TerrainShape, xm: number, zm: number): number =>
  shape.minHeightMetres +
  fbm2(seed, xm / shape.featureSizeMetres, zm / shape.featureSizeMetres, shape.octaves) *
    (shape.maxHeightMetres - shape.minHeightMetres);

/** Y (in blocks) of the top solid block of the column at block (x, z). Sampled at the block's centre. */
// biome-ignore lint/complexity/useMaxParams: Numeric block coordinates avoid a per-sample tuple allocation on the generation hot path.
export const terrainHeight = (seed: number, shape: TerrainShape, scale: Scale, x: number, z: number): number => {
  const s = scale.blockSize;
  return Math.floor(terrainHeightMetres(seed, shape, (x + 0.5) * s, (z + 0.5) * s) / s);
};

/** Ground surface height in metres, matching the game engine for natural or site-shaped terrain. */
export const worldGroundAt = ({
  seed,
  shape,
  scale,
  surface,
  xm,
  zm,
}: {
  seed: number;
  shape: TerrainShape;
  scale: Scale;
  surface: Surface | undefined;
  xm: number;
  zm: number;
}): number => {
  const s = scale.blockSize;
  if (!surface) {
    return Math.floor(terrainHeightMetres(seed, shape, xm, zm) / s) * s + s;
  }
  const x = Math.floor(xm / s);
  const z = Math.floor(zm / s);
  return (surface.height(x, z, terrainHeight(seed, shape, scale, x, z)) + 1) * s;
};

/** Top block heights for a chunk column, CHUNK×CHUNK, indexed x + CHUNK * z. */
// biome-ignore lint/complexity/useMaxParams: Numeric chunk coordinates avoid a per-column tuple allocation on the generation hot path.
const columnHeights = (seed: number, shape: TerrainShape, scale: Scale, cx: number, cz: number): Int32Array => {
  const out = new Int32Array(CHUNK * CHUNK);
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      out[lx + CHUNK * lz] = terrainHeight(seed, shape, scale, cx * CHUNK + lx, cz * CHUNK + lz);
    }
  }
  return out;
};

/** A column's heights with the surface's changes applied. */
const columnSurface = ({ seed, shape, scale, surface }: Terrain, cx: number, cz: number): ColumnSurface => {
  const heights = columnHeights(seed, shape, scale, cx, cz);
  const tops = new Int32Array(CHUNK * CHUNK).fill(-1);
  const water = new Int32Array(CHUNK * CHUNK).fill(NO_WATER);
  if (surface) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const [x, z] = [cx * CHUNK + lx, cz * CHUNK + lz];
        const i = lx + CHUNK * lz;
        heights[i] = surface.height(x, z, heights[i]!);
        tops[i] = surface.top(x, z) ?? -1;
        water[i] = surface.water?.(x, z) ?? NO_WATER;
      }
    }
  }
  return { heights, tops, water };
};

/** The block at height y in a column whose top block is at h (both in blocks), unless `top` replaces it. */
const blockAt = ({ blocks, shape, scale }: Terrain, y: number, h: number, top: number): number => {
  if (y === h) {
    if (top >= 0) {
      return top;
    }
    return h * scale.blockSize < shape.beachBelowMetres ? blocks.sand : blocks.grass;
  }
  return y > h - shape.dirtDepthMetres / scale.blockSize ? blocks.dirt : blocks.rock;
};

export const generateChunk = (terrain: Terrain, [cx, cy, cz]: Vec3, column = columnSurface(terrain, cx, cz)): Chunk => {
  const { blocks, shape, scale } = terrain;
  const { heights, tops, water } = column;
  const y0 = cy * CHUNK;
  // Entirely below the dirt layer of every column: all stone, no per-block writes.
  if (y0 + CHUNK - 1 <= Math.min(...heights) - shape.dirtDepthMetres / scale.blockSize) {
    return new Chunk(cx, cy, cz, blocks.rock);
  }
  const chunk = new Chunk(cx, cy, cz);
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const h = heights[lx + CHUNK * lz]!;
      const top = Math.min(h - y0, CHUNK - 1);
      for (let ly = 0; ly <= top; ly++) {
        chunk.set(lx, ly, lz, blockAt(terrain, y0 + ly, h, tops[lx + CHUNK * lz]!));
      }
      // Water fills h + 1 <= y < level, so a level at the bed's top face leaves the column dry.
      const surfaceTop = Math.min(water[lx + CHUNK * lz]! - 1 - y0, CHUNK - 1);
      for (let ly = Math.max(h + 1 - y0, 0); ly <= surfaceTop; ly++) {
        chunk.set(lx, ly, lz, blocks.water);
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
