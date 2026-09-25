import { Chunk } from './chunk.ts';
import { CHUNK, MAX_CY, MIN_CY } from './coords.ts';
import { fbm2 } from './random.ts';

/** Registry ids of the blocks terrain is made of. */
export interface TerrainBlocks {
  grass: number;
  dirt: number;
  stone: number;
  sand: number;
}

export const MIN_HEIGHT = 8;
export const MAX_HEIGHT = 56;
const BEACH_BELOW = 14;

/** Y of the top solid block of the column at (x, z). */
export const terrainHeight = (seed: number, x: number, z: number): number =>
  Math.floor(MIN_HEIGHT + fbm2(seed, x / 96, z / 96, 4) * (MAX_HEIGHT - MIN_HEIGHT));

/** Top block heights for a chunk column, CHUNK×CHUNK, indexed x + CHUNK * z. */
export const columnHeights = (seed: number, cx: number, cz: number): Int32Array => {
  const out = new Int32Array(CHUNK * CHUNK);
  for (let lz = 0; lz < CHUNK; lz++)
    for (let lx = 0; lx < CHUNK; lx++) out[lx + CHUNK * lz] = terrainHeight(seed, cx * CHUNK + lx, cz * CHUNK + lz);
  return out;
};

export const generateChunk = (
  seed: number,
  blocks: TerrainBlocks,
  cx: number,
  cy: number,
  cz: number,
  heights = columnHeights(seed, cx, cz),
): Chunk => {
  const chunk = new Chunk(cx, cy, cz);
  const y0 = cy * CHUNK;
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const h = heights[lx + CHUNK * lz]!;
      const top = Math.min(h - y0, CHUNK - 1);
      for (let ly = 0; ly <= top; ly++) {
        const y = y0 + ly;
        const id = y === h ? (h < BEACH_BELOW ? blocks.sand : blocks.grass) : y > h - 4 ? blocks.dirt : blocks.stone;
        chunk.set(lx, ly, lz, id);
      }
    }
  }
  return chunk;
};

/** Every chunk of the column (cx, cz) inside the world's vertical range, bottom first. */
export const generateColumn = (seed: number, blocks: TerrainBlocks, cx: number, cz: number): Chunk[] => {
  const heights = columnHeights(seed, cx, cz);
  const out: Chunk[] = [];
  for (let cy = MIN_CY; cy <= MAX_CY; cy++) out.push(generateChunk(seed, blocks, cx, cy, cz, heights));
  return out;
};
