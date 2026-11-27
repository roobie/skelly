// biome-ignore lint/performance/noNamespaceImport: The spy needs the module object to observe sense construction.
import * as lightSenses from '@skelly/engine/internal/core/lights.ts';
import { SunExposureCache } from '@skelly/engine/internal/core/lights.ts';
import { SimulationTerrain } from '@skelly/engine/internal/core/simulationTerrain.ts';
import { NOT_LOADED } from '@skelly/engine/internal/core/terrainRead.ts';
import { terrainHeight } from '@skelly/engine/internal/core/worldgen.ts';
import { planRealFrame } from '@skelly/engine/internal/game/frameDriver.ts';
import { parseTimeOfDay, realSeconds } from '@skelly/engine/sim';
import { BlockEntities, CHUNK, Chunk, terrainShapeOf, World } from '@skelly/engine/world';
import { expect, it, vi } from 'vitest';
import { BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { fixtureBox, skyWorldFixture } from './fixtures/skyWorld.ts';
import { sunExposedAt } from './fixtures/sunOracle.ts';
import { fixtureTerrain, terrainFor } from './fixtures/terrain.ts';
import { createRuntime, fixtureColumns, fixtureSite, registry, scale, seed, startRest } from './snapshotTestSupport.ts';

const DAYTIME = parseTimeOfDay('10:00')!;

it('matches vertical ray exposure above and below the top blocker in a column', () => {
  const opaqueCells = new Set(['2,8,4', '2,3,4']);
  let cacheQueries = 0;
  const isOpaque = (x: number, y: number, z: number): boolean => opaqueCells.has(`${x},${y},${z}`);
  const cache = new SunExposureCache(15, 0, (x, y, z) => {
    cacheQueries += 1;
    return isOpaque(x, y, z);
  });
  const positions: [number, number, number][] = [
    [2.2, 9.1, 4.8],
    [2.2, 8.1, 4.8],
    [2.2, 7.1, 4.8],
    [2.2, 15, 4.8],
  ];
  let firstColumnQueries = 0;
  for (const [index, position] of positions.entries()) {
    expect(cache.isExposedAt(position, 12, BASE_DAY_CYCLE)).toBe(
      sunExposedAt({ position, gameHours: 12, cycle: BASE_DAY_CYCLE, skyTop: 15, isOpaque }),
    );
    if (index === 0) {
      firstColumnQueries = cacheQueries;
      expect(firstColumnQueries).toBeGreaterThan(0);
    } else {
      expect(cacheQueries).toBe(firstColumnQueries);
    }
  }
});

it('keeps unrelated cell edits cached but observes adding and removing a cover', () => {
  const world = new World();
  world.addChunk(new Chunk(0, 0, 0));
  let queries = 0;
  const cache = new SunExposureCache(
    15,
    0,
    (x, y, z) => {
      queries += 1;
      return world.getBlock(x, y, z) !== 0;
    },
    { world, entities: new BlockEntities(registry) },
  );
  const exposed = () => cache.isExposedAt([2.5, 2, 4.5], 12, BASE_DAY_CYCLE);
  expect(exposed()).toBe(true);
  const initial = queries;
  world.setBlock(3, 8, 4, 1);
  expect(exposed()).toBe(true);
  expect(queries).toBe(initial);
  world.setBlock(2, 8, 4, 1);
  expect(exposed()).toBe(false);
  world.setBlock(2, 8, 4, 0);
  expect(exposed()).toBe(true);
  cache.dispose();
});

it('observes a door covering a roof opening and preserves exposure after a distant door changes', () => {
  const { world, entities } = skyWorldFixture();
  const roof = fixtureBox.max[1] - 1;
  world.setBlock(8, roof, 8, 0);
  let queries = 0;
  const cache = new SunExposureCache(
    31,
    0,
    (x, y, z) => {
      queries += 1;
      return world.getBlock(x, y, z) !== 0 || entities.obstructs(x, y, z, 'light');
    },
    { world, entities },
  );
  const exposed = () => cache.isExposedAt([8.5, roof - 1, 8.5], 12, BASE_DAY_CYCLE);
  expect(exposed()).toBe(true);
  const door = entities.add({ type: 'fixture_door', pos: [8, roof, 8], size: [1, 1, 1], facing: 'n' });
  expect(door).toBeDefined();
  expect(exposed()).toBe(false);
  entities.setOpen(door!, true);
  expect(exposed()).toBe(true);
  const before = queries;
  const distant = entities.add({ type: 'fixture_door', pos: [20, roof, 20], size: [1, 1, 1], facing: 'n' });
  expect(distant).toBeDefined();
  expect(exposed()).toBe(true);
  expect(queries).toBe(before);
  cache.dispose();
});

it('tracks publication and precise edits through simulation terrain', () => {
  const world = new SimulationTerrain(fixtureTerrain({ scale, floor: 0 }));
  let queries = 0;
  const cache = new SunExposureCache(
    15,
    0,
    (x, y, z) => {
      queries += 1;
      const id = world.getBlock(x, y, z);
      return id === NOT_LOADED || id !== 0;
    },
    { world, entities: new BlockEntities(registry) },
  );
  const exposed = () => cache.isExposedAt([2.5, 2, 4.5], 12, BASE_DAY_CYCLE);
  expect(exposed()).toBe(false);
  world.arrive(0, 0);
  world.canonical.ensureColumn(0, 0);
  expect(exposed()).toBe(true);
  const before = queries;
  world.setBlock(3, 8, 4, 1);
  expect(exposed()).toBe(true);
  expect(queries).toBe(before);
  world.setBlock(2, 8, 4, 1);
  expect(exposed()).toBe(false);
  world.setBlock(2, 8, 4, 0);
  expect(exposed()).toBe(true);
  world.unload(0, 0);
  expect(exposed()).toBe(false);
  cache.dispose();
});

it('invalidates both footprints of a moved light occluder without dropping an unrelated column', () => {
  const world = new World();
  const entities = new BlockEntities(registry);
  const occluders = {
    version: 0,
    current: [{ min: [2, 8, 4] as [number, number, number], max: [3, 9, 5] as [number, number, number], shade: 1 }],
    boxes() {
      return this.current;
    },
  };
  let queries = 0;
  const cache = new SunExposureCache(
    15,
    0,
    (x, y, z) => {
      queries += 1;
      return occluders.current.some(
        ({ min, max }) => x >= min[0] && x < max[0] && y >= min[1] && y < max[1] && z >= min[2] && z < max[2],
      );
    },
    { world, entities, occluders },
  );
  const exposed = (x: number) => cache.isExposedAt([x + 0.5, 2, 4.5], 12, BASE_DAY_CYCLE);
  expect(exposed(2)).toBe(false);
  expect(exposed(3)).toBe(true);
  expect(exposed(6)).toBe(true);
  occluders.current = [{ min: [3, 8, 4], max: [4, 9, 5], shade: 1 }];
  occluders.version += 1;
  const before = queries;
  expect(exposed(6)).toBe(true);
  expect(queries).toBe(before);
  expect(exposed(2)).toBe(true);
  expect(exposed(3)).toBe(false);
  cache.dispose();
});

it('observes whole-chunk replacement and removal', () => {
  const world = new World();
  const cache = new SunExposureCache(15, 0, (x, y, z) => world.getBlock(x, y, z) !== 0, {
    world,
    entities: new BlockEntities(registry),
  });
  const exposed = () => cache.isExposedAt([2.5, 2, 4.5], 12, BASE_DAY_CYCLE);
  expect(exposed()).toBe(true);
  const roof = new Chunk(0, 0, 0);
  roof.set(2, 8, 4, 1);
  world.addChunk(roof);
  expect(exposed()).toBe(false);
  world.removeChunk(0, 0, 0);
  expect(exposed()).toBe(true);
  cache.dispose();
});

it('builds player sense once for a scheduled actor step including its pending spawn batch', () => {
  const runtime = createRuntime(undefined, false, undefined, { start: DAYTIME });
  const before = [...runtime.session.actors.store.entries()].length;
  const type = registry.actors.keys().next().value!;
  const positions: [number, number, number][] = [
    [0, 2, 0],
    [4, 2, 0],
  ];
  runtime.spawner.onColumn({
    cx: 0,
    cz: 0,
    registry,
    actors: runtime.session.actors,
    site: {
      actorsIn: () => positions.map((pos) => ({ type, pos, window: { fromGameTimeOfDay: 'midnight' as const } })),
    },
  });
  expect([...runtime.session.actors.store.entries()]).toHaveLength(before);
  const sources = vi.spyOn(lightSenses, 'inventoryLightSources');
  try {
    runtime.sim.paused = false;
    runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 20)));
    expect([...runtime.session.actors.store.entries()]).toHaveLength(before + positions.length);
    const ticks = runtime.sim.scheduler.tickCounts();
    const active = ticks.get('actors')!;
    expect(active).toBeGreaterThan(0);
    expect(sources).toHaveBeenCalledTimes(active + ticks.get('actor-background')!);
  } finally {
    sources.mockRestore();
  }
});

it('bounds daytime opacity queries to one column scan per source in a compressed frame', () => {
  const quietColumn = fixtureColumns.find(
    ([columnX, columnZ]) =>
      fixtureSite.actorsIn(columnX, columnZ).length === 0 &&
      (fixtureSite.hordesIn?.(columnX, columnZ).length ?? 0) === 0,
  );
  if (!quietColumn) {
    throw new Error('Snapshot fixture has no unoccupied column for daytime sleep');
  }
  const [cx, cz] = quietColumn;
  const furniture = fixtureSite.furnitureIn(cx, cz).map(({ spec }) => spec);
  const clearCell = Array.from({ length: CHUNK - 4 }, (_, i) => i + 2)
    .flatMap((localX) => Array.from({ length: CHUNK - 4 }, (_, i) => [localX, i + 2] as const))
    .find(([localX, localZ]) =>
      furniture.every(
        ({ pos, size }) =>
          localX + 2 < pos[0] - cx * CHUNK ||
          localX - 2 >= pos[0] - cx * CHUNK + size[0] ||
          localZ + 2 < pos[2] - cz * CHUNK ||
          localZ - 2 >= pos[2] - cz * CHUNK + size[2],
      ),
    );
  if (!clearCell) {
    throw new Error('Quiet fixture column has no clear sleep position');
  }
  const x = cx * CHUNK + clearCell[0];
  const z = cz * CHUNK + clearCell[1];
  const ground = terrainFor(fixtureSite, registry, scale, seed).surface!.height(
    x,
    z,
    terrainHeight(seed, terrainShapeOf(registry), scale, x, z),
  );
  const spawn: [number, number, number] = [x + 0.5, ground + 1.0001, z + 0.5];

  let opaqueCalls = 0;
  let callBudget = Number.POSITIVE_INFINITY;
  const runtime = createRuntime(undefined, true, [quietColumn], {
    start: DAYTIME,
    spawn,
    onOpaque: () => {
      opaqueCalls += 1;
      if (opaqueCalls > callBudget) {
        throw new Error('Sun-exposure opacity queries exceeded one column scan per source');
      }
    },
  });
  const activeLightCount = [...runtime.inventory.items()].filter(
    ({ item }) => item.on && registry.items.get(item.type)?.light !== undefined,
  ).length;
  expect(activeLightCount).toBeGreaterThan(0);
  callBudget = (1 + activeLightCount) * (scale.maxCy - scale.minCy + 1) * CHUNK;

  runtime.sim.paused = false;
  runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 60)));
  expect(opaqueCalls).toBeGreaterThan(0);
  opaqueCalls = 0;
  runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 60)));
  expect(opaqueCalls).toBe(0);
  expect(runtime.player.body.onGround).toBe(true);
  expect(startRest(runtime, 'sleep')).toBeUndefined();

  let reachedCap = false;
  for (let frame = 0; frame < 120; frame++) {
    opaqueCalls = 0;
    runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 60)));
    if (runtime.sim.compression.c === runtime.sim.compression.limits.cap) {
      reachedCap = true;
      break;
    }
  }

  expect(reachedCap).toBe(true);
});
