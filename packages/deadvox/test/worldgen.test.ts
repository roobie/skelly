import { describe, expect, it } from 'vitest';
import { generateChunk, terrainHeight, terrainHeightMetres } from '../../engine/src/core/worldgen.ts';
import { CHUNK, generateColumn, makeScale } from '../../engine/src/world.ts';
import { baseTerrainShape } from './baseRegistry.ts';

const blocks = { air: 0, grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 };
const shape = baseTerrainShape();
const metre = makeScale(1);
const half = makeScale(0.5);

describe('worldgen', () => {
  it('is deterministic for a seed and varies between seeds', () => {
    const a = generateChunk({ seed: 42, blocks, shape, scale: half }, [3, 1, -2]);
    const b = generateChunk({ seed: 42, blocks, shape, scale: half }, [3, 1, -2]);
    const c = generateChunk({ seed: 43, blocks, shape, scale: half }, [3, 1, -2]);
    expect(a.toArray()).toEqual(b.toArray());
    expect(a.toArray()).not.toEqual(c.toArray());
  });

  it('keeps heights in range', () => {
    for (let i = 0; i < 2000; i++) {
      const h = terrainHeightMetres(7, shape, i * 13 - 9000, i * 7 - 3000);
      expect(h).toBeGreaterThanOrEqual(shape.minHeightMetres);
      expect(h).toBeLessThan(shape.maxHeightMetres);
    }
  });

  it('gives the same landscape in metres at every block size', () => {
    for (let i = 0; i < 200; i++) {
      const [xm, zm] = [i * 3.7 - 300, i * 2.3 + 100];
      const surface = (s: typeof half) =>
        (terrainHeight(5, shape, s, Math.floor(xm / s.blockSize), Math.floor(zm / s.blockSize)) + 1) * s.blockSize;
      // Different block sizes sample slightly different points and round differently.
      expect(Math.abs(surface(metre) - surface(half))).toBeLessThanOrEqual(1.5);
    }
  });

  it('fills each column up to its height with a grass or sand top', () => {
    const column = generateColumn({ seed: 5, blocks, shape, scale: half }, 0, 0);
    const levels = column.map((chunk) => chunk.cy);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((level, index) => index === 0 || level === levels[index - 1]! + 1)).toBe(true);
    const at = (x: number, y: number, z: number) => {
      const chunk = column.find((c) => c.cy === Math.floor(y / CHUNK))!;
      return chunk.get(x, y - chunk.cy * CHUNK, z);
    };
    for (const [x, z] of [
      [0, 0],
      [17, 3],
      [31, 31],
    ] as const) {
      const h = terrainHeight(5, shape, half, x, z);
      expect([blocks.grass, blocks.sand]).toContain(at(x, h, z));
      expect(at(x, h + 1, z)).toBe(blocks.air);
      expect(at(x, h - Math.ceil(shape.dirtDepthMetres / half.blockSize) - 1, z)).toBe(blocks.rock);
    }
  });

  it('stamps structures into the chunks they overlap', () => {
    const column = generateColumn({ seed: 5, blocks, shape, scale: half }, 0, 0, [
      { min: [2, 150, 2], max: [3, 151, 3], block: 9 },
    ]);
    const top = column.find((c) => c.cy === 4)!;
    expect(top.get(2, 150 - 4 * CHUNK, 2)).toBe(9);
  });

  it('stores chunks wholly below or above the height range as a single id', () => {
    const column = generateColumn({ seed: 5, blocks, shape, scale: half }, 0, 0);
    const s = half.blockSize;
    const rockBelow = Math.floor(shape.minHeightMetres / s) - Math.ceil(shape.dirtDepthMetres / s);
    const skyAbove = Math.ceil(shape.maxHeightMetres / s);
    const below = column.filter((c) => (c.cy + 1) * CHUNK - 1 <= rockBelow);
    const above = column.filter((c) => c.cy * CHUNK > skyAbove);
    expect(below.length).toBeGreaterThan(0);
    expect(above.length).toBeGreaterThan(0);
    for (const chunk of below) {
      expect(chunk.uniformId, `chunk ${chunk.cy}`).toBe(blocks.rock);
    }
    for (const chunk of above) {
      expect(chunk.uniformId, `chunk ${chunk.cy}`).toBe(blocks.air);
    }
  });
});
