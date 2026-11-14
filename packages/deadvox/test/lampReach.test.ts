import { LampReachCache } from '@skelly/engine/internal/core/lampReach.ts';
import { raycast, type SolidAt } from '@skelly/engine/internal/core/raycast.ts';
import type { PoweredLight } from '@skelly/engine/internal/core/sitePower.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
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

const referenceReaches = (light: PoweredLight, to: Vec3, solid: SolidAt): boolean => {
  const delta = to.map((value, axis) => value - light.pos[axis]!) as Vec3;
  const length = Math.hypot(...delta);
  if (length === 0) {
    return true;
  }
  const ends = new Set([light.pos.map(Math.floor).join(','), to.map(Math.floor).join(',')]);
  return !raycast(light.pos, delta.map((value) => value / length) as Vec3, length, (x, y, z) => {
    const inBody =
      light.body && [x, y, z].every((value, axis) => value >= light.body!.min[axis]! && value < light.body!.max[axis]!);
    return !(ends.has(`${x},${y},${z}`) || inBody) && solid(x, y, z);
  });
};

describe('lamp reach', () => {
  it.each([
    { cellBlocks: 1, pos: [-1.5, 2.5, -0.5] as Vec3 },
    { cellBlocks: 2, pos: [-2.25, 2, -0.25] as Vec3 },
  ])(
    'matches reference rays through walls and an opening door, querying each blocker once ($cellBlocks)',
    ({ cellBlocks, pos }) => {
      const fixtureRegistry = {
        ...registry,
        furniture: new Map(registry.furniture).set('reach_fixture_door', {
          id: 'reach_fixture_door',
          name: 'Fixture door',
          color: '#777777',
          size: [1, 3, 2],
          material: 'reach_fixture_material',
          breach: { minimumStrength: 1, durability: 10 },
          door: { methods: {}, handlingSimSeconds: simSeconds(1) },
        }),
      };
      const world = new World();
      const entities = new BlockEntities(fixtureRegistry);
      const door = entities.add({ type: 'reach_fixture_door', pos: [1, 1, -1], size: [1, 3, 2], facing: 'n' })!;
      const light = lampAt(pos, { base: [-3, 1, -1], height: 3 });
      const solid: SolidAt = (x, y, z) =>
        (x === 1 && y >= -2 && y < 6 && z >= -4 && z < 4 && !(y >= 1 && y < 4 && z >= -1 && z < 1)) ||
        (z === 2 && x >= -4 && x < 1) ||
        (x === -3 && y >= 1 && y < 4 && z === -1) ||
        entities.isSolid(x, y, z);
      const queries = new Map<string, number>();
      const cache = new LampReachCache(
        { world, entities },
        (x, y, z) => {
          const key = `${x},${y},${z}`;
          queries.set(key, (queries.get(key) ?? 0) + 1);
          return solid(x, y, z);
        },
        scale.blockSize,
        { ...TUNING, cellBlocks },
      );
      const check = () => {
        queries.clear();
        const reach = cache.reachOf(light)!;
        const expected = Uint8Array.from({ length: reach.cells.length }, (_, index) => {
          const cell = [
            index % reach.size,
            Math.floor(index / reach.size ** 2),
            Math.floor(index / reach.size) % reach.size,
          ];
          const to = cell.map((value, axis) => (reach.origin[axis]! + value + 0.5) * cellBlocks) as Vec3;
          return Math.hypot(...to.map((value, axis) => value - pos[axis]!)) <= TUNING.rangeMetres / scale.blockSize
            ? Number(referenceReaches(light, to, solid))
            : 1;
        });
        expect(reach.cells).toEqual(expected);
        expect(expected).toContain(0);
        expect(expected).toContain(1);
        expect(queries.size).toBeGreaterThan(0);
        expect([...queries.values()].every((count) => count === 1)).toBe(true);
        return reach;
      };
      try {
        const closed = check();
        expect(entities.setOpen(door, true)).toBeUndefined();
        const open = check();
        expect(open.cells.some((value, index) => value > closed.cells[index]!)).toBe(true);
        expect(entities.setOpen(door, false)).toBeUndefined();
        expect(check().cells).toEqual(closed.cells);
      } finally {
        cache.dispose();
      }
    },
  );
  it('reuses the GPU blocking volume until a block owner changes, then samples the same wall predicate', () => {
    const world = new World();
    world.addChunk(new Chunk(-1, 0, 0));
    const entities = new BlockEntities(registry);
    const solid: SolidAt = (x, y, z) => world.getBlock(x, y, z) !== 0;
    const cache = new LampReachCache({ world, entities }, solid, scale.blockSize, TUNING);
    const check = () => {
      const volume = cache.blockers();
      expect(volume.cells.some(Boolean)).toBe([...world.chunks.values()].some((chunk) => !chunk.isEmpty()));
      for (let z = 0; z < volume.size[2]; z++) {
        for (let y = 0; y < volume.size[1]; y++) {
          for (let x = 0; x < volume.size[0]; x++) {
            expect(volume.cells[x + volume.size[0] * (y + volume.size[1] * z)] !== 0).toBe(
              solid(x + volume.origin[0], y + volume.origin[1], z + volume.origin[2]),
            );
          }
        }
      }
      return volume;
    };
    try {
      const empty = check();
      expect(cache.blockers()).toBe(empty);
      world.setBlock(-1, 1, 1, wall);
      const blocked = check();
      expect(blocked).not.toBe(empty);
      expect(cache.blockers()).toBe(blocked);
      world.setBlock(-1, 1, 1, 0);
      expect(check().cells).toEqual(empty.cells);
    } finally {
      cache.dispose();
    }
  });
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

  it('rebuilds a moving source only when its source cell changes, including negative cells', () => {
    const { cache } = room();
    const reachSource = {};
    const moving = { ...lampAt([-0.75, 4.5, 0.5]), reachSource };
    const before = cache.reachOf(moving)!;
    const within = { ...moving, pos: [-0.25, 4.5, 0.5] as Vec3 };
    expect(cache.isCurrent(within)).toBe(true);
    expect(cache.reachOf(within)).toBe(before);
    const across = { ...moving, pos: [0.25, 4.5, 0.5] as Vec3 };
    expect(cache.isCurrent(across)).toBe(false);
    expect(cache.reachOf(across)).not.toBe(before);
    cache.dispose();
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
