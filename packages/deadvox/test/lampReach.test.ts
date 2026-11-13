import { LampReachCache } from '@skelly/engine/internal/core/lampReach.ts';
import type { PoweredLight } from '@skelly/engine/internal/core/sitePower.ts';
import { BlockEntities, CHUNK, Chunk, sitePalette, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { registry, scale } from './snapshotTestSupport.ts';

const TUNING = { cellBlocks: 1, rangeMetres: 8 };
const wall = sitePalette(registry).paving;

const lampAt = (pos: Vec3): PoweredLight => ({ pos, color: '#ffffff', intensity: 10, radius: TUNING.rangeMetres });

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
