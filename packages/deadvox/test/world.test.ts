import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK, toChunk, toLocal, type Vec3 } from '../src/core/coords.ts';
import { buildMesh } from '../src/core/mesher.ts';
import { BEDROCK, extractPadded, extractWide, PADDED, paddedIndex } from '../src/core/meshInput.ts';
import { OCCLUSION_RADIUS, WIDE } from '../src/core/occlusion.ts';
import { hash3 } from '../src/core/random.ts';
import { affectedChunks, isEnclosed, MESH_REACH, World } from '../src/core/world.ts';
import { unitFaces } from './meshFaces.ts';

/** Chunks whose shell (the chunk plus OCCLUSION_RADIUS on every side) holds the cell, by brute force. */
const chunksWithShellAround = (cell: Vec3): Set<string> => {
  const inShell = (v: number, c: number) => v >= c * CHUNK - OCCLUSION_RADIUS && v < (c + 1) * CHUNK + OCCLUSION_RADIUS;
  const found = new Set<string>();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = [toChunk(cell[0]) + dx, toChunk(cell[1]) + dy, toChunk(cell[2]) + dz];
        if (c.every((chunk, axis) => inShell(cell[axis]!, chunk))) {
          found.add(c.join(','));
        }
      }
    }
  }
  return found;
};

/** Random blocks in a few chunks around the origin, one uniform solid chunk, and gaps (including below). */
const mixedWorld = (): World => {
  const world = new World();
  for (const [cx, cy, cz] of [
    [0, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [1, 1, 1],
    [-1, -1, -1],
  ] as Vec3[]) {
    const chunk = new Chunk(cx, cy, cz);
    for (let i = 0; i < 4000; i++) {
      const at = (k: number) => Math.floor(hash3(5 + k, i, cx * 7 + cy * 13 + cz * 17, 0) * CHUNK);
      chunk.set(at(0), at(1), at(2), 1 + (i % 3));
    }
    world.addChunk(chunk);
  }
  world.addChunk(new Chunk(0, 1, 0, 4));
  return world;
};

/** Cells of chunk 0,0,0's padded array that differ from a per-cell read of the world. */
const paddedMismatches = (world: World, bottomCy: number): number => {
  const padded = extractPadded(world, [0, 0, 0], bottomCy);
  let wrong = 0;
  for (let i = 0; i < padded.length; i++) {
    const [x, y, z] = [i % PADDED, Math.floor(i / PADDED ** 2), Math.floor(i / PADDED) % PADDED];
    const expected = y === 0 && bottomCy === 0 ? BEDROCK : world.getBlock(x - 1, y - 1, z - 1);
    wrong += padded[paddedIndex(x, y, z)] === expected ? 0 : 1;
  }
  return wrong;
};

/** The same for the wide solidity array, where everything below the bottom layer reads as solid. */
const wideMismatches = (world: World, bottomCy: number): number => {
  const wide = extractWide(world, [0, 0, 0], bottomCy);
  let wrong = 0;
  for (let i = 0; i < wide.length; i++) {
    const [x, y, z] = [i % WIDE, Math.floor(i / WIDE ** 2), Math.floor(i / WIDE) % WIDE].map(
      (c) => c - OCCLUSION_RADIUS,
    );
    const solid = (bottomCy === 0 && y! < 0) || world.getBlock(x!, y!, z!) !== 0;
    wrong += wide[i] === (solid ? 1 : 0) ? 0 : 1;
  }
  return wrong;
};

describe('coords', () => {
  it('floors negative block coordinates into the right chunk', () => {
    expect([toChunk(0), toChunk(CHUNK - 1), toChunk(CHUNK), toChunk(-1), toChunk(-CHUNK), toChunk(-CHUNK - 1)]).toEqual(
      [0, 0, 1, -1, -1, -2],
    );
    expect([toLocal(-1), toLocal(-CHUNK), toLocal(CHUNK + 3)]).toEqual([CHUNK - 1, 0, 3]);
  });
});

describe('World', () => {
  it('revises the world token when queried blocks change', () => {
    const world = new World();
    let previous = world.version;
    world.addChunk(new Chunk(0, 0, 0));
    expect(world.version).toBeGreaterThan(previous);
    previous = world.version;
    world.setBlock(1, 5, 1, 3);
    expect(world.version).toBeGreaterThan(previous);
    previous = world.version;
    world.setBlock(1, 5, 1, 0);
    expect(world.version).toBeGreaterThan(previous);
    previous = world.version;
    world.removeChunk(0, 0, 0);
    expect(world.version).toBeGreaterThan(previous);
  });

  it('reads back blocks across chunk boundaries, and air where nothing was set', () => {
    const world = new World();
    world.setBlock(-1, 5, 40, 3);
    world.setBlock(0, 5, 40, 4);
    expect(world.getBlock(-1, 5, 40)).toBe(3);
    expect(world.getBlock(0, 5, 40)).toBe(4);
    expect(world.getBlock(1, 5, 40)).toBe(0);
    expect(world.getBlock(1000, -1000, 7)).toBe(0);
  });

  it('keeps restored diffs pending for ungenerated chunks and applies them over the matching base', () => {
    const world = new World();
    const saved = { chunks: [{ cx: 0, cy: 0, cz: 0, cells: [{ index: 0, base: 'dirt', id: 'planks' }] }] };
    const ids = new Map([
      ['dirt', 1],
      ['planks', 2],
    ]);
    const names = new Map([...ids].map(([name, id]) => [id, name]));
    const blockId = (name: string) => {
      const id = ids.get(name);
      if (id === undefined) {
        throw new Error(`unknown block ${name}`);
      }
      return id;
    };
    world.restoreDiffs(saved, blockId);
    expect(world.getBlock(0, 0, 0)).toBe(0);
    expect(world.snapshotDiffs((id) => names.get(id) ?? 'unknown')).toEqual(saved);

    world.addChunk(new Chunk(0, 0, 0, 1));
    expect(world.getBlock(0, 0, 0)).toBe(2);
    expect(world.snapshotDiffs((id) => names.get(id) ?? 'unknown')).toEqual(saved);
  });

  it('reaches as far as the occlusion radius, which the simulation graph repeats rather than imports', () => {
    expect(MESH_REACH).toBe(OCCLUSION_RADIUS);
  });

  it('reports every chunk within the occlusion radius of an edited block as stale', () => {
    const mid = CHUNK >> 1;
    expect(affectedChunks(mid, mid, mid)).toEqual([[0, 0, 0]]);
    expect(affectedChunks(OCCLUSION_RADIUS - 1 + CHUNK, mid, mid)).toEqual([
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect(affectedChunks(OCCLUSION_RADIUS + CHUNK, mid, mid)).toEqual([[1, 0, 0]]);
    expect(affectedChunks(0, 0, 0)).toHaveLength(8); // a chunk corner: every neighbour touching it, diagonals too
    for (let i = 0; i < 200; i++) {
      const cell = [0, 1, 2].map((k) => Math.floor(hash3(11, i, k, 0) * 4 * CHUNK) - 2 * CHUNK) as Vec3;
      const got = affectedChunks(...cell);
      expect(new Set(got.map((c) => c.join(',')))).toEqual(chunksWithShellAround(cell));
      expect(got).toHaveLength(chunksWithShellAround(cell).size); // no duplicates
      expect(got[0]).toEqual(cell.map(toChunk));
    }
  });

  it('extracts the padded array exactly as a per-cell read of the world would', () => {
    const world = mixedWorld();
    expect(paddedMismatches(world, Number.NEGATIVE_INFINITY)).toBe(0);
    expect(paddedMismatches(world, 0)).toBe(0);
  });

  it('extracts the wide solidity array as a per-cell read would: missing chunks air, below the bottom solid', () => {
    const world = mixedWorld();
    expect(wideMismatches(world, Number.NEGATIVE_INFINITY)).toBe(0);
    expect(wideMismatches(world, 0)).toBe(0);
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

  it('knows when a chunk has no visible faces (solid, with solid neighbours)', () => {
    const world = new World();
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          world.addChunk(new Chunk(x, y, z, 3));
        }
      }
    }
    expect(isEnclosed(world, [0, 0, 0])).toBe(true);
    world.setBlock(CHUNK, 5, 5, 0); // a hole in the +x neighbour
    expect(isEnclosed(world, [0, 0, 0])).toBe(false);
    // Missing neighbours are air, except below the world's bottom layer.
    world.removeChunk(0, -1, 0);
    world.addChunk(new Chunk(1, 0, 0, 3));
    expect(isEnclosed(world, [0, 0, 0])).toBe(false);
    expect(isEnclosed(world, [0, 0, 0], 0)).toBe(true);
  });
});
