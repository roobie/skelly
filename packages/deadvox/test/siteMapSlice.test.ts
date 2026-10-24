import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK } from '../src/core/coords.ts';
import { topSolidAtOrBelow } from '../src/render/siteMap.ts';

const SOLID = 1;

// A column with a floor slab at y 4, a roof slab at y 12 and open air between,
// standing in for a cellar under a surface.
const cellarColumn = (): Chunk[] => {
  const chunk = new Chunk(0, 0, 0);
  for (let y = 0; y <= 4; y += 1) {
    chunk.set(3, y, 3, SOLID);
  }
  chunk.set(3, 12, 3, SOLID);
  return [chunk, new Chunk(0, 1, 0)];
};

describe('site map height slice', () => {
  it('shows a below-ground floor in its slice and the roof in the surface view', () => {
    const column = cellarColumn();

    expect(topSolidAtOrBelow(column, 3, 3)?.y).toBe(12);
    expect(topSolidAtOrBelow(column, 3, 3, 8)?.y).toBe(4);
  });

  it('leaves out everything above the ceiling, even a whole chunk', () => {
    const upper = new Chunk(0, 1, 0, SOLID);
    const column = [...cellarColumn().slice(0, 1), upper];

    expect(topSolidAtOrBelow(column, 3, 3, CHUNK - 1)?.y).toBe(12);
    expect(topSolidAtOrBelow(column, 0, 0, CHUNK - 1)).toBeUndefined();
    expect(topSolidAtOrBelow(column, 0, 0)?.y).toBe(CHUNK * 2 - 1);
  });
});
