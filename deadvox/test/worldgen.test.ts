import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import { generateChunk, generateColumn, MAX_HEIGHT, MIN_HEIGHT, terrainHeight } from '../src/core/worldgen.ts';

const blocks = { grass: 1, dirt: 2, stone: 3, sand: 4 };

describe('worldgen', () => {
  it('is deterministic for a seed and varies between seeds', () => {
    const a = generateChunk(42, blocks, [3, 0, -2]);
    const b = generateChunk(42, blocks, [3, 0, -2]);
    const c = generateChunk(43, blocks, [3, 0, -2]);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.blocks).not.toEqual(c.blocks);
  });

  it('keeps heights in range', () => {
    for (let i = 0; i < 2000; i++) {
      const h = terrainHeight(7, i * 13 - 9000, i * 7 - 3000);
      expect(h).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(h).toBeLessThan(MAX_HEIGHT);
    }
  });

  it('fills each column up to its height with a grass or sand top', () => {
    const column = generateColumn(5, blocks, 0, 0);
    const at = (x: number, y: number, z: number) => {
      const chunk = column.find((c) => c.cy === Math.floor(y / CHUNK))!;
      return chunk.get(x, y - chunk.cy * CHUNK, z);
    };
    for (const [x, z] of [
      [0, 0],
      [17, 3],
      [31, 31],
    ] as const) {
      const h = terrainHeight(5, x, z);
      expect([blocks.grass, blocks.sand]).toContain(at(x, h, z));
      expect(at(x, h + 1, z)).toBe(0);
      expect(at(x, h - 6, z)).toBe(blocks.stone);
    }
  });
});
