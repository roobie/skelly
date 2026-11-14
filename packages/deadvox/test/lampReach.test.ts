import { LampReachCache } from '@skelly/engine/internal/core/lampReach.ts';
import type { PoweredLight } from '@skelly/engine/internal/core/sitePower.ts';
import { BlockEntities, CHUNK, Chunk, sitePalette, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { registry, scale } from './snapshotTestSupport.ts';

const TUNING = { cellBlocks: 1, rangeMetres: 8 };
const wall = sitePalette(registry).paving;

/** A lamp whose body is the one block around its light, or `height` blocks standing from `base`. */
const lampAt = (pos: Vec3, body?: { base: Vec3; height: number }): PoweredLight => {
  const min = body?.base ?? (pos.map(Math.floor) as Vec3);
  return {
    pos,
    color: '#ffffff',
    intensity: 10,
    radius: TUNING.rangeMetres,
    body: { min, max: [min[0] + 1, min[1] + (body?.height ?? 1), min[2] + 1] },
  };
};

const room = () => {
  const world = new World();
  for (let cx = -1; cx <= 8; cx++) {
    world.addChunk(new Chunk(cx, 0, 0));
  }
  const entities = new BlockEntities(registry);
  const cache = new LampReachCache(
    { world, entities },
    (x, y, z) => world.getBlock(x, y, z) !== 0,
    scale.blockSize,
    TUNING,
  );
  return { world, cache };
};

/** A wall one block thick, tall and wide enough that no ray round it stays within the lamp's range. */
const buildWallAt = (world: World, x: number): void => {
  for (let y = 0; y < CHUNK; y++) {
    for (let z = -8; z <= 8; z++) {
      world.setBlock(x, y, z, wall);
    }
  }
};

describe('lamp reach', () => {
  const lamp = lampAt([0.5, 4.5, 0.5]);
  const beside: Vec3 = [3.5, 4.5, 0.5];
  const behind: Vec3 = [6.5, 4.5, 0.5];

  it('gives a lamp no light behind a solid wall and full reach on its own side', () => {
    const { world, cache } = room();
    buildWallAt(world, 5);
    const reach = cache.reachOf(lamp)!;
    expect(reach.at(beside)).toBe(1);
    expect(reach.at(behind)).toBe(0);
  });

  it('never lets a lamp occlude itself: its own body cells do not shadow the lamp or the floor at its foot', () => {
    const { world, cache } = room();
    const standing = lampAt([0.5, 5.5, 0.5], { base: [0, 4, 0], height: 2 });
    for (let y = 4; y < 6; y++) {
      world.setBlock(0, y, 0, wall);
    }
    const reach = cache.reachOf(standing)!;
    expect(reach.at([0.5, 4.5, 0.5])).toBe(1);
    expect(reach.at([1.5, 3.5, 0.5])).toBe(1);
    expect(reach.at([0.5, 3.5, 0.5])).toBe(1);
  });

  it('centres each ceiling lamp’s lit pool under that lamp, whatever its position or the lamps beside it', () => {
    const { world, cache } = room();
    for (let x = 0; x < 3 * CHUNK; x++) {
      for (let z = -6; z <= 6; z++) {
        world.setBlock(x, 9, z, wall);
      }
    }
    // Strip lights hang from the ceiling slab: a body two blocks long, the light inside its own cell.
    const lamps = [3, 9, 17].map((x) => lampAt([x + 0.5, 8.15, 0.5], { base: [x, 8, 0], height: 1 }));
    for (const strip of lamps) {
      world.setBlock(strip.body!.min[0], 8, 0, wall);
    }
    for (const strip of lamps) {
      const reach = cache.reachOf(strip)!;
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        expect(reach.at([strip.pos[0] + dx, 2.5, strip.pos[2] + dz])).toBe(1);
      }
    }
  });

  it('updates a lit lamp the moment a wall goes up beside it', () => {
    const { world, cache } = room();
    expect(cache.reachOf(lamp)!.at(behind)).toBe(1);
    buildWallAt(world, 5);
    expect(cache.isCurrent(lamp)).toBe(false);
    expect(cache.reachOf(lamp)!.at(behind)).toBe(0);
    expect(cache.isCurrent(lamp)).toBe(true);
  });

  it('rebuilds only the lamps within range of the changed block', () => {
    const { world, cache } = room();
    const distant = lampAt([lamp.pos[0] + 6 * CHUNK, lamp.pos[1], lamp.pos[2]]);
    cache.reachOf(lamp);
    const before = cache.reachOf(distant)!;
    buildWallAt(world, 5);
    expect(cache.isCurrent(lamp)).toBe(false);
    expect(cache.isCurrent(distant)).toBe(true);
    expect(cache.reachOf(distant)).toBe(before);
  });
});
