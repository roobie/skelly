import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import {
  generateChunk,
  generateColumn,
  MAX_HEIGHT_M,
  MIN_HEIGHT_M,
  terrainHeight,
  terrainHeightMetres,
} from '../src/core/worldgen.ts';

const blocks = { grass: 1, dirt: 2, stone: 3, sand: 4 };
const metre = makeScale(1);
const half = makeScale(0.5);

describe('worldgen', () => {
  it('is deterministic for a seed and varies between seeds', () => {
    const a = generateChunk({ seed: 42, blocks, scale: half }, [3, 1, -2]);
    const b = generateChunk({ seed: 42, blocks, scale: half }, [3, 1, -2]);
    const c = generateChunk({ seed: 43, blocks, scale: half }, [3, 1, -2]);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.blocks).not.toEqual(c.blocks);
  });

  it('keeps heights in range', () => {
    for (let i = 0; i < 2000; i++) {
      const h = terrainHeightMetres(7, i * 13 - 9000, i * 7 - 3000);
      expect(h).toBeGreaterThanOrEqual(MIN_HEIGHT_M);
      expect(h).toBeLessThan(MAX_HEIGHT_M);
    }
  });

  it('gives the same landscape in metres at every block size', () => {
    for (let i = 0; i < 200; i++) {
      const [xm, zm] = [i * 3.7 - 300, i * 2.3 + 100];
      const surface = (s: typeof half) =>
        (terrainHeight(5, s, Math.floor(xm / s.blockSize), Math.floor(zm / s.blockSize)) + 1) * s.blockSize;
      // Different block sizes sample slightly different points and round differently.
      expect(Math.abs(surface(metre) - surface(half))).toBeLessThanOrEqual(1.5);
    }
  });

  it('fills each column up to its height with a grass or sand top', () => {
    const column = generateColumn({ seed: 5, blocks, scale: half }, 0, 0);
    expect(column.map((c) => c.cy)).toEqual([-3, -2, -1, 0, 1, 2, 3, 4]);
    const at = (x: number, y: number, z: number) => {
      const chunk = column.find((c) => c.cy === Math.floor(y / CHUNK))!;
      return chunk.get(x, y - chunk.cy * CHUNK, z);
    };
    for (const [x, z] of [
      [0, 0],
      [17, 3],
      [31, 31],
    ] as const) {
      const h = terrainHeight(5, half, x, z);
      expect([blocks.grass, blocks.sand]).toContain(at(x, h, z));
      expect(at(x, h + 1, z)).toBe(0);
      expect(at(x, h - 6, z)).toBe(blocks.stone);
    }
  });

  it('stamps structures into the chunks they overlap', () => {
    const column = generateColumn({ seed: 5, blocks, scale: half }, 0, 0, [
      { min: [2, 150, 2], max: [3, 151, 3], block: 9 },
    ]);
    const top = column.find((c) => c.cy === 4)!;
    expect(top.get(2, 150 - 4 * CHUNK, 2)).toBe(9);
  });
});
