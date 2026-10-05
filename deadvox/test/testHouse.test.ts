import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK } from '../src/core/coords.ts';
import { type MetreBox, rasterize, stampChunk } from '../src/core/structure.ts';
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
const content = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const { registry } = buildRegistry(content);
const sizeOf = (type: string) => registry.furniture.get(type)!.size;

const build = (blockSize: number) => {
  const boxes = testHouse([0, 0, 0], blocks, blockSize);
  const stamped = rasterize(boxes, blockSize);
  const chunks = new Map<string, Chunk>();
  const at = (xm: number, ym: number, zm: number): number => {
    const [x, y, z] = [xm, ym, zm].map((value) => Math.floor(value / blockSize));
    const [cx, cy, cz] = [x, y, z].map((value) => Math.floor(value! / CHUNK)) as [number, number, number];
    const key = `${cx},${cy},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      stampChunk(chunk, stamped);
      chunks.set(key, chunk);
    }
    return chunk.get(x! - cx * CHUNK, y! - cy * CHUNK, z! - cz * CHUNK);
  };
  return { boxes, at };
};

const houseBounds = (boxes: MetreBox[]) => {
  const walls = boxes.filter(({ block }) => block === blocks.brick);
  return {
    x0: Math.min(...walls.map(({ min }) => min[0])),
    x1: Math.max(...walls.map(({ max }) => max[0])),
    y1: Math.max(...walls.map(({ max }) => max[1])),
    z0: Math.min(...walls.map(({ min }) => min[2])),
    z1: Math.max(...walls.map(({ max }) => max[2])),
  };
};

const cellCenter = (from: number, to: number, fraction: number, blockSize: number) =>
  (Math.floor((from + (to - from) * fraction) / blockSize) + 0.5) * blockSize;

describe('test house', () => {
  for (const blockSize of [1, 0.5]) {
    it(`keeps the room enclosed and its door and stairs traversable at ${blockSize} m blocks`, () => {
      const { boxes, at } = build(blockSize);
      const bounds = houseBounds(boxes);
      const wallY = bounds.y1 / 2;
      const interior = {
        x: bounds.x0 + (bounds.x1 - bounds.x0) / 4,
        y: wallY,
        z: (bounds.z0 + bounds.z1) / 2,
      };
      expect(at(interior.x, interior.y, interior.z)).toBe(0);
      expect(at(interior.x, -blockSize / 2, interior.z)).not.toBe(0);
      expect(at(interior.x, bounds.y1 + blockSize / 2, interior.z)).not.toBe(0);

      const fractions = [0.1, 0.3, 0.7, 0.9];
      const wallSamples = [
        fractions.map((fraction) =>
          at(bounds.x0 + blockSize / 2, wallY, cellCenter(bounds.z0, bounds.z1, fraction, blockSize)),
        ),
        fractions.map((fraction) =>
          at(bounds.x1 - blockSize / 2, wallY, cellCenter(bounds.z0, bounds.z1, fraction, blockSize)),
        ),
        fractions.map((fraction) =>
          at(cellCenter(bounds.x0, bounds.x1, fraction, blockSize), wallY, bounds.z0 + blockSize / 2),
        ),
        fractions.map((fraction) =>
          at(cellCenter(bounds.x0, bounds.x1, fraction, blockSize), wallY, bounds.z1 - blockSize / 2),
        ),
      ];
      expect(wallSamples.every((side) => side.some((block) => block !== 0))).toBe(true);

      const doorway = boxes.find(
        (box) =>
          box.block === 0 &&
          box.min[0] <= bounds.x0 &&
          box.max[0] <= bounds.x0 + blockSize &&
          box.min[2] >= bounds.z0 &&
          box.max[2] <= bounds.z1 &&
          box.max[1] - box.min[1] >= 2,
      );
      expect(doorway).toBeDefined();
      const doorwayX = (doorway!.min[0] + doorway!.max[0]) / 2;
      const doorwayZ = (doorway!.min[2] + doorway!.max[2]) / 2;
      const walkingY = doorway!.min[1] + blockSize / 2;
      expect(at(doorwayX, walkingY, doorwayZ)).toBe(0);
      expect(at(doorway!.min[0] - blockSize / 2, walkingY, doorwayZ)).toBe(0);
      expect(at(doorway!.max[0] + blockSize / 2, walkingY, doorwayZ)).toBe(0);
      expect(at(doorwayX, (doorway!.max[1] + bounds.y1) / 2, doorwayZ)).not.toBe(0);

      const stairs = boxes
        .filter(
          (box) =>
            box.block === blocks.planks &&
            box.min[1] === 0 &&
            box.max[1] > 0 &&
            box.max[1] <= bounds.y1 &&
            box.min[2] >= bounds.z0 &&
            box.max[2] <= bounds.z0 + 2,
        )
        .sort((a, b) => a.min[0] - b.min[0]);
      expect(stairs.length).toBeGreaterThan(0);
      for (const [index, step] of stairs.entries()) {
        const x = (step.min[0] + step.max[0]) / 2;
        const z = (step.min[2] + step.max[2]) / 2;
        expect(at(x, step.max[1] - blockSize / 2, z)).toBe(blocks.planks);
        expect(at(x, step.max[1] + blockSize / 2, z)).toBe(0);
        const next = stairs[index + 1];
        if (next) {
          expect(next.min[0] - step.min[0]).toBe(blockSize);
          expect(next.max[1] - step.max[1]).toBe(blockSize);
        }
      }
    });
  }

  it('keeps each furniture footprint clear, supported and disjoint from its neighbors', () => {
    const blockSize = 0.5;
    const { at } = build(blockSize);
    const furniture = testHouseFurniture([0, 0, 0], blockSize, sizeOf);
    const occupied = new Set<string>();
    expect(
      furniture.some(({ size }) => size.every((dimension) => dimension > 0)),
      'fixture furniture must exercise the clearance contract',
    ).toBe(true);

    for (const spec of furniture) {
      expect(
        spec.size.every((dimension) => dimension > 0),
        `furniture ${spec.type} has a footprint`,
      ).toBe(true);
      const footprint = [...cellsOf(spec.size)].filter(([, y]) => y === 0);
      for (const [x, y, z] of cellsOf(spec.size)) {
        const cell: [number, number, number] = [spec.pos[0] + x, spec.pos[1] + y, spec.pos[2] + z];
        const key = cell.join(',');
        expect(occupied.has(key), `furniture overlaps at ${key}`).toBe(false);
        occupied.add(key);
        expect(
          at(...(cell.map((value) => (value + 0.5) * blockSize) as [number, number, number])),
          `furniture intersects the house at ${key}`,
        ).toBe(0);
      }
      expect(
        footprint.every(
          ([x, , z]) =>
            at(
              (spec.pos[0] + x + 0.5) * blockSize,
              (spec.pos[1] - 0.5) * blockSize,
              (spec.pos[2] + z + 0.5) * blockSize,
            ) !== 0,
        ),
        `furniture ${spec.type} stands on its floor`,
      ).toBe(true);
    }
  });
});
