// World and chunk coordinates. Blocks are 1 unit; +y is up.
// Chunks are cubes of CHUNK³ blocks, stored y-major: index = x + CHUNK * (z + CHUNK * y).

export type Vec3 = [number, number, number];

export const CHUNK_BITS = 5;
export const CHUNK = 1 << CHUNK_BITS;
export const CHUNK_VOLUME = CHUNK * CHUNK * CHUNK;

/** Vertical extent of the world, in chunks (inclusive). Terrain lives inside this range. */
export const MIN_CY = -1;
export const MAX_CY = 2;

/** Chunk coordinate of an integer block coordinate (floors negatives correctly). */
export const toChunk = (n: number): number => n >> CHUNK_BITS;

/** Position of an integer block coordinate inside its chunk, 0..CHUNK-1. */
export const toLocal = (n: number): number => n & (CHUNK - 1);

export const localIndex = (x: number, y: number, z: number): number => x + CHUNK * (z + CHUNK * y);

export const chunkKey = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
