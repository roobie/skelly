import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK } from '../src/core/coords.ts';
import { rasterize, stampChunk } from '../src/core/structure.ts';
import { cellsOf } from '../src/core/templates.ts';
import { testHouse, testHouseFurniture } from '../src/game/testHouse.ts';

const blocks = {
  brick: 1,
  plaster: 2,
  planks: 3,
  tiles: 4,
  fabric: 5,
  roof: 6,
  dirt: 7,
  grass: 8,
  stone: 9,
  sidingRed: 10,
  sidingBlue: 11,
  galvanized: 12,
  cobblestone: 13,
  dressedStone: 14,
  hazard: 15,
};

/** Furniture sizes in blocks, as furniture.json has them. */
const FURNITURE_SIZE = new Map<string, [number, number, number]>([
  ['crate', [2, 2, 2]],
  ['fridge', [2, 4, 2]],
  ['kitchen_cupboard', [2, 2, 1]],
  ['wardrobe', [2, 4, 1]],
]);
const sizeOf = (type: string) => FURNITURE_SIZE.get(type)!;

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

      it('has a stone plinth under the walls that the front door still cuts through', () => {
        expect(at(5, 0.25, 0.25)).toBe(blocks.stone);
        // A half-metre plinth rounds up to a whole block at 1 m, so brick starts higher there.
        expect(at(1.5, blockSize === 1 ? 1.5 : 0.75, 0.25)).toBe(blocks.brick);
        expect(at(9.75, 0.25, 1.5)).toBe(blocks.stone);
        expect(at(0.25, 0.25, 3.5)).toBe(0);
      });

      it('has stonework outside: chimney, gated garden wall and flagstone path', () => {
        expect(at(10.5, 3.75, 5.75)).toBe(blocks.stone);
        expect(at(10.5, 5.5, 5.75)).toBe(0);
        expect(at(-3, 1.25, 8.75)).toBe(0);
        expect(at(2.5, 0.5, 8.75)).toBe(0);
        expect(at(-4, -0.25, 3.5)).toBe(blocks.stone);
        expect(at(-4, -0.25, 5)).toBe(blocks.grass);
      });

      it('has painted siding on the north wall, with the window cut through it', () => {
        expect(at(1, 1.5, -0.25)).toBe(blocks.sidingRed);
        expect(at(7, 1.5, -0.25)).toBe(blocks.sidingBlue);
        expect(at(2.5, 1.5, -0.25)).toBe(0);
        expect(at(2.5, 1.5, 0.25)).toBe(0);
      });

      it('has a siding shed with a doorway and a galvanized roof', () => {
        expect(at(-7.5, 1.5, -2.75)).toBe(blocks.sidingBlue);
        expect(at(-8.75, 1.5, -1.5)).toBe(blocks.sidingBlue);
        expect(at(-6.25, 1.5, -1.5)).toBe(blocks.sidingBlue);
        expect(at(-7.5, 1.5, -2)).toBe(0);
        expect(at(-7.5, 1, -0.75)).toBe(0);
        expect(at(-7.5, 2.75, -1.5)).toBe(blocks.galvanized);
      });

      it('has a mossy cobblestone wall cap, hazard-yellow gate posts, and dressed stone on the chimney and doorstep', () => {
        expect(at(-3, 0.75, 8.75)).toBe(blocks.cobblestone);
        expect(at(6, 0.75, 8.75)).toBe(blocks.cobblestone);
        expect(at(-3, 0.25, 8.75)).toBe(blockSize === 1 ? blocks.cobblestone : blocks.stone);
        expect(at(1.75, 0.75, 8.75)).toBe(blocks.hazard);
        expect(at(3.25, 0.75, 8.75)).toBe(blocks.hazard);
        expect(at(2.5, 0.75, 8.75)).toBe(0);
        expect(at(10.5, 4.75, 5.75)).toBe(blocks.dressedStone);
        expect(at(11.25, 4.75, 5.75)).toBe(blocks.dressedStone);
        expect(at(-0.5, -0.25, 3.5)).toBe(blocks.dressedStone);
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

  describe('furniture', () => {
    const specs = testHouseFurniture([4, 10, -4], 0.5, sizeOf);

    it('places a crate, fridge, cupboard and wardrobe at whole blocks, turned by their facing', () => {
      expect(specs).toEqual([
        { type: 'crate', pos: [4, 20, 1], size: [2, 2, 2], facing: 'n' },
        { type: 'fridge', pos: [10, 20, 3], size: [2, 4, 2], facing: 'n' },
        { type: 'kitchen_cupboard', pos: [14, 20, 4], size: [2, 2, 1], facing: 'n' },
        { type: 'wardrobe', pos: [26, 20, -5], size: [1, 4, 2], facing: 'w' },
      ]);
    });

    it('stands in air, on the floor, clear of the walls, stairs and bed', () => {
      const at = build(0.5);
      for (const { pos, size } of testHouseFurniture([0, 0, 0], 0.5, sizeOf)) {
        for (const [x, y, z] of cellsOf(size)) {
          const [xm, ym, zm] = [pos[0] + x, pos[1] + y, pos[2] + z].map((v) => (v + 0.5) * 0.5);
          expect(at(xm!, ym!, zm!), `${xm}, ${ym}, ${zm}`).toBe(0);
        }
      }
    });
  });
});
