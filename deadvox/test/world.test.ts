import { describe, expect, it } from 'vitest';
import { CHUNK, toChunk, toLocal } from '../src/core/coords.ts';
import { buildMesh } from '../src/core/mesher.ts';
import { affectedChunks, BEDROCK, extractPadded, PADDED, paddedIndex, World } from '../src/core/world.ts';
import { unitFaces } from './meshFaces.ts';

describe('coords', () => {
  it('floors negative block coordinates into the right chunk', () => {
    expect([toChunk(0), toChunk(CHUNK - 1), toChunk(CHUNK), toChunk(-1), toChunk(-CHUNK), toChunk(-CHUNK - 1)]).toEqual(
      [0, 0, 1, -1, -1, -2],
    );
    expect([toLocal(-1), toLocal(-CHUNK), toLocal(CHUNK + 3)]).toEqual([CHUNK - 1, 0, 3]);
  });
});

describe('World', () => {
  it('reads back blocks across chunk boundaries, and air where nothing was set', () => {
    const world = new World();
    world.setBlock(-1, 5, 40, 3);
    world.setBlock(0, 5, 40, 4);
    expect(world.getBlock(-1, 5, 40)).toBe(3);
    expect(world.getBlock(0, 5, 40)).toBe(4);
    expect(world.getBlock(1, 5, 40)).toBe(0);
    expect(world.getBlock(1000, -1000, 7)).toBe(0);
  });

  it('reports neighbour chunks as stale only for blocks on a chunk face', () => {
    expect(affectedChunks(5, 5, 5)).toEqual([[0, 0, 0]]);
    expect(affectedChunks(0, 5, CHUNK - 1)).toEqual([
      [0, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ]);
  });

  it("pads a chunk with its neighbours' border blocks", () => {
    const world = new World();
    world.setBlock(0, 0, 0, 1); // inside chunk 0,0,0
    world.setBlock(-1, 0, 0, 2); // chunk -1: left border
    world.setBlock(CHUNK, CHUNK, CHUNK, 3); // chunk 1,1,1: far corner
    world.setBlock(-2, 0, 0, 9); // two blocks out: not in the padding
    const padded = extractPadded(world, [0, 0, 0]);
    expect(padded[paddedIndex(1, 1, 1)]).toBe(1);
    expect(padded[paddedIndex(0, 1, 1)]).toBe(2);
    expect(padded[paddedIndex(PADDED - 1, PADDED - 1, PADDED - 1)]).toBe(3);
    expect(padded.filter((b) => b !== 0).length).toBe(3);
  });

  it('treats everything below the bottom layer as solid, so the world has no underside', () => {
    const world = new World();
    for (let x = 0; x < CHUNK; x++) {
      for (let z = 0; z < CHUNK; z++) {
        world.setBlock(x, 0, z, 1); // a floor on the bottom layer's lowest row
      }
    }
    const open = extractPadded(world, [0, 0, 0]);
    const closed = extractPadded(world, [0, 0, 0], 0);
    expect(open[paddedIndex(5, 0, 5)]).toBe(0);
    expect(closed[paddedIndex(5, 0, 5)]).toBe(BEDROCK);
    const colors = new Uint8Array(6).fill(100);
    const downFaces = (padded: Uint16Array) =>
      [...unitFaces(buildMesh(padded, colors))].filter((f) => f.endsWith(',1,-1')).length;
    expect(downFaces(open)).toBe(CHUNK * CHUNK);
    expect(downFaces(closed)).toBe(0);
  });
});
