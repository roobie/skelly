// Chunk storage: what's held in memory, and estimates under the layouts CHALLENGES.md
// §1 discusses (every chunk in full, uniform chunks as one id, palette packing).

import type { Chunk } from './chunk.ts';
import { CHUNK_VOLUME } from './coords.ts';

export interface StorageStats {
  chunks: number;
  /** Block data actually held in memory. */
  bytesStored: number;
  /** Chunks where every block is the same id (all air, all stone…). */
  uniform: number;
  /** Every chunk stored as 16-bit ids. */
  bytesFull: number;
  /** Uniform chunks stored as a single id, the rest in full. */
  bytesUniform: number;
  /** Uniform chunks as a single id, the rest as a palette plus 1/2/4/8/16-bit indices. */
  bytesPalette: number;
}

const FULL_BYTES = CHUNK_VOLUME * 2;

/** Distinct ids in a chunk, stopping early once more than `limit` are found. */
const distinctIds = (blocks: Readonly<Uint16Array>, limit: number): number => {
  const seen: number[] = [];
  for (const id of blocks) {
    if (!seen.includes(id)) {
      seen.push(id);
      if (seen.length > limit) {
        break;
      }
    }
  }
  return seen.length;
};

/** Bits per block index for a palette of n entries, rounded up to 1, 2, 4, 8 or 16. */
export const paletteBits = (n: number): number => {
  const bits = Math.max(1, Math.ceil(Math.log2(n)));
  return [1, 2, 4, 8, 16].find((b) => b >= bits) ?? 16;
};

export const storageStats = (chunks: Iterable<Chunk>): StorageStats => {
  const stats: StorageStats = { chunks: 0, bytesStored: 0, uniform: 0, bytesFull: 0, bytesUniform: 0, bytesPalette: 0 };
  for (const chunk of chunks) {
    stats.chunks += 1;
    stats.bytesStored += chunk.bytes;
    stats.bytesFull += FULL_BYTES;
    const raw = chunk.raw();
    const n = raw ? distinctIds(raw, 256) : 1;
    if (n === 1) {
      stats.uniform += 1;
      stats.bytesUniform += 2;
      stats.bytesPalette += 2;
    } else {
      stats.bytesUniform += FULL_BYTES;
      stats.bytesPalette += (CHUNK_VOLUME * paletteBits(n)) / 8 + n * 2;
    }
  }
  return stats;
};
