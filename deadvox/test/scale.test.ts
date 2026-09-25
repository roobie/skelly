import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK_VOLUME } from '../src/core/coords.ts';
import { chunksFor, makeScale } from '../src/core/scale.ts';
import { paletteBits, storageStats } from '../src/core/storage.ts';
import { rasterize, stampChunk } from '../src/core/structure.ts';

describe('scale', () => {
  it('covers −48 m to +80 m with whole chunks', () => {
    expect(makeScale(0.5)).toEqual({ blockSize: 0.5, minCy: -3, maxCy: 4 });
    expect(makeScale(1)).toEqual({ blockSize: 1, minCy: -2, maxCy: 2 });
  });

  it('converts view distances to chunks, rounding up', () => {
    expect(chunksFor(makeScale(0.5), 96)).toBe(6);
    expect(chunksFor(makeScale(1), 96)).toBe(3);
    expect(chunksFor(makeScale(1), 100)).toBe(4);
  });
});

describe('rasterize', () => {
  const wall = { min: [0, 0, 0] as const, max: [0.5, 3, 7] as const, block: 1 };

  it('makes a 0.5 m wall one block thick at either block size', () => {
    expect(rasterize([{ ...wall, min: [...wall.min], max: [...wall.max] }], 0.5)[0]).toEqual({
      min: [0, 0, 0],
      max: [1, 6, 14],
      block: 1,
    });
    expect(rasterize([{ ...wall, min: [...wall.min], max: [...wall.max] }], 1)[0]).toEqual({
      min: [0, 0, 0],
      max: [1, 3, 7],
      block: 1,
    });
  });

  it('covers every block a box touches, including negative coordinates', () => {
    expect(rasterize([{ min: [-1.2, 0, 0], max: [0.3, 1, 1], block: 2 }], 1)[0]?.min[0]).toBe(-2);
    expect(rasterize([{ min: [-1.2, 0, 0], max: [0.3, 1, 1], block: 2 }], 1)[0]?.max[0]).toBe(1);
  });
});

describe('stampChunk', () => {
  it('writes only the part of a box inside the chunk, in order', () => {
    const chunk = new Chunk(1, 0, 0); // x 32..63
    stampChunk(chunk, [
      { min: [30, 0, 0], max: [34, 2, 1], block: 5 },
      { min: [33, 1, 0], max: [34, 2, 1], block: 0 },
    ]);
    expect(chunk.get(0, 0, 0)).toBe(5);
    expect(chunk.get(1, 0, 0)).toBe(5);
    expect(chunk.get(2, 0, 0)).toBe(0);
    expect(chunk.get(1, 1, 0)).toBe(0);
    expect(chunk.get(0, 1, 0)).toBe(5);
  });
});

describe('storageStats', () => {
  it('counts uniform chunks and estimates palette packing', () => {
    const air = new Chunk(0, 5, 0);
    const mixed = new Chunk(0, 0, 0);
    mixed.set(0, 0, 0, 3);
    mixed.set(1, 0, 0, 4);
    const stats = storageStats([air, mixed]);
    expect(stats.chunks).toBe(2);
    expect(stats.uniform).toBe(1);
    expect(stats.bytesFull).toBe(4 * CHUNK_VOLUME);
    expect(stats.bytesUniform).toBe(2 * CHUNK_VOLUME + 2);
    // 3 distinct ids → 2 bits per block, plus a 3-entry palette.
    expect(stats.bytesPalette).toBe(2 + (CHUNK_VOLUME * 2) / 8 + 6);
  });

  it('rounds palette index sizes up to 1, 2, 4, 8 or 16 bits', () => {
    expect([2, 3, 4, 5, 16, 17, 300].map(paletteBits)).toEqual([1, 2, 2, 4, 4, 8, 16]);
  });
});
