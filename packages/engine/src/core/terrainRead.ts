import type { Chunk } from './chunk.ts';
import type { Vec3 } from './coords.ts';

export const NOT_LOADED = Symbol('terrain not loaded');
export type BlockRead = number | typeof NOT_LOADED;
export type ChunkRead = Chunk | undefined | typeof NOT_LOADED;

/** A missing publication is unknown, not an empty cell or an empty chunk. */
export interface ChunkSource {
  getChunk: (cx: number, cy: number, cz: number) => ChunkRead;
  /** A single-cell edit supplies its cell; publication or whole-chunk replacement leaves it absent. */
  watchChunks: (changed: (cx: number, cy: number, cz: number, cell?: Readonly<Vec3>) => void) => () => void;
}

export interface TerrainRead extends ChunkSource {
  readonly renderOnly?: never;
  readonly version: number;
  getBlock: (x: number, y: number, z: number) => BlockRead;
}
