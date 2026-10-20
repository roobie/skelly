import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK_VOLUME } from '../src/core/coords.ts';
import { World } from '../src/core/world.ts';
import { farColumns } from '../src/game/streamer.ts';

describe('Chunk', () => {
  it('stores a single id until a block differs', () => {
    const chunk = new Chunk(0, 0, 0, 3);
    expect(chunk.uniformId).toBe(3);
    expect(chunk.bytes).toBe(2);
    chunk.set(1, 2, 3, 3); // same id: still uniform
    expect(chunk.uniformId).toBe(3);
    chunk.set(1, 2, 3, 7);
    expect(chunk.uniformId).toBeUndefined();
    expect(chunk.bytes).toBe(CHUNK_VOLUME * 2);
    expect(chunk.get(1, 2, 3)).toBe(7);
    expect(chunk.get(0, 0, 0)).toBe(3);
  });

  it('compacts back to a single id when every block matches again', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.set(4, 4, 4, 2);
    expect(chunk.compact()).toBe(false);
    chunk.set(4, 4, 4, 0);
    expect(chunk.compact()).toBe(true);
    expect(chunk.uniformId).toBe(0);
    expect(chunk.isEmpty()).toBe(true);
    expect(chunk.toArray()).toEqual(new Uint16Array(CHUNK_VOLUME));
  });

  it('is marked edited by World.setBlock but not by worldgen writes', () => {
    const world = new World();
    const generated = new Chunk(0, 0, 0);
    generated.set(0, 0, 0, 1);
    world.addChunk(generated);
    expect(generated.edited).toBe(false);
    world.setBlock(5, 5, 5, 2);
    expect(world.getChunk(0, 0, 0)?.edited).toBe(true);
  });
});

describe('farColumns', () => {
  it('picks columns beyond the keep distance (square)', () => {
    const columns = ['0,0', '3,0', '4,0', '-4,4', '0,-5'];
    expect(farColumns(columns, [0, 0], 3)).toEqual(['4,0', '-4,4', '0,-5']);
    expect(farColumns(columns, [4, 0], 3)).toEqual(['0,0', '-4,4', '0,-5']);
  });
});
