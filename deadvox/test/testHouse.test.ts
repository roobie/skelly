import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK } from '../src/core/coords.ts';
import { rasterize, stampChunk } from '../src/core/structure.ts';
import { testHouse } from '../src/game/testHouse.ts';

const blocks = { brick: 1, plaster: 2, planks: 3, tiles: 4, fabric: 5, roof: 6, dirt: 7, grass: 8 };

/** Stamps the house (origin at 0,0,0) into a small world and returns a block lookup in metres. */
const build = (blockSize: number) => {
  const boxes = rasterize(testHouse([0, 0, 0], blocks, blockSize), blockSize);
  const chunks = new Map<string, Chunk>();
  const at = (xm: number, ym: number, zm: number): number => {
    const [x, y, z] = [xm, ym, zm].map((v) => Math.floor(v / blockSize));
    const [cx, cy, cz] = [x, y, z].map((v) => Math.floor(v! / CHUNK)) as [number, number, number];
    const key = `${cx},${cy},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      stampChunk(chunk, boxes);
      chunks.set(key, chunk);
    }
    return chunk.get(x! - cx * CHUNK, y! - cy * CHUNK, z! - cz * CHUNK);
  };
  return at;
};

describe('test house', () => {
  for (const blockSize of [1, 0.5]) {
    describe(`at ${blockSize} m`, () => {
      const at = build(blockSize);

      it('has a walk-through front door 1 m wide and 2 m tall', () => {
        expect(at(0.25, 0.1, 3.5)).toBe(0);
        expect(at(0.25, 1.9, 3.5)).toBe(0);
        expect(at(0.25, 2.1, 3.5)).toBe(blocks.brick);
        expect(at(0.25, 1, 2.5)).toBe(blocks.brick);
      });

      it('has a floor, walls and a roof with a hatch over the stairs', () => {
        expect(at(2, -0.1, 3)).toBe(blocks.tiles);
        expect(at(8, -0.1, 3)).toBe(blocks.planks);
        expect(at(5.2, 2.5, 5)).toBe(blocks.plaster);
        expect(at(3, 3.1, 3)).toBe(blocks.roof);
        expect(at(7, 3.1, 1)).toBe(0);
      });

      it('has stairs that rise one block per step to the roof', () => {
        const steps = Math.round(3 / blockSize);
        for (let i = 0; i < steps; i++) {
          const x = 6 + (i + 0.5) * blockSize;
          expect(at(x, (i + 0.5) * blockSize, 1)).toBe(blocks.planks);
          expect(at(x, (i + 1.5) * blockSize, 1)).toBe(0);
        }
      });
    });
  }
});
