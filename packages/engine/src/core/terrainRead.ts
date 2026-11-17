import type { Chunk } from './chunk.ts';

export const NOT_LOADED = Symbol('terrain not loaded');
export type BlockRead = number | typeof NOT_LOADED;
export type ChunkRead = Chunk | undefined | typeof NOT_LOADED;

/** A missing publication is unknown, not an empty cell or an empty chunk. */
export interface ChunkSource {
  getChunk: (cx: number, cy: number, cz: number) => ChunkRead;
  watchChunks: (changed: (cx: number, cy: number, cz: number) => void) => () => void;
}

export interface TerrainRead extends ChunkSource {
  readonly renderOnly?: never;
  readonly version: number;
  getBlock: (x: number, y: number, z: number) => BlockRead;
}
