import { expect, it } from 'vitest';
import { parseTimeOfDay } from '../src/core/clock.ts';
import { COMPRESSION } from '../src/core/compression.ts';
import { CHUNK } from '../src/core/coords.ts';
import { SunExposureCache, sunExposedAt } from '../src/core/lights.ts';
import { realSeconds } from '../src/core/time.ts';
import { terrainHeight } from '../src/core/worldgen.ts';
import { planRealFrame } from '../src/game/frameDriver.ts';
import {
  createRuntime,
  fixtureColumns,
  fixtureHamlet,
  registry,
  scale,
  seed,
  startRest,
} from './snapshotTestSupport.ts';

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
    expect(cache.isExposedAt(position, 12)).toBe(sunExposedAt({ position, gameHours: 12, skyTop: 15, isOpaque }));
    if (index === 0) {
      firstColumnQueries = cacheQueries;
      expect(firstColumnQueries).toBeGreaterThan(0);
    } else {
      expect(cacheQueries).toBe(firstColumnQueries);
    }
  }
});

it('bounds daytime opacity queries to one column scan per source in a compressed frame', () => {
  const quietColumn = fixtureColumns.find(
    ([columnX, columnZ]) =>
      fixtureHamlet.zombiesIn(columnX, columnZ).length === 0 &&
      (fixtureHamlet.hordesIn?.(columnX, columnZ).length ?? 0) === 0,
  );
  if (!quietColumn) {
    throw new Error('Snapshot fixture has no unoccupied column for daytime sleep');
  }
  const [cx, cz] = quietColumn;
  const furniture = fixtureHamlet.furnitureIn(cx, cz).map(({ spec }) => spec);
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
  const ground = fixtureHamlet.surface.height(x, z, terrainHeight(seed, scale, x, z));
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
  // Two extra calls allow for the source and sky boundary samples.
  callBudget = (1 + activeLightCount) * ((scale.maxCy - scale.minCy + 1) * CHUNK + 2);

  runtime.sim.paused = false;
  runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 60)));
  expect(runtime.player.body.onGround).toBe(true);
  expect(startRest(runtime, 'sleep')).toBeUndefined();

  let compressedFrameCalls = 0;
  for (let frame = 0; frame < 120; frame++) {
    opaqueCalls = 0;
    runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 60)));
    if (runtime.sim.compression.c === COMPRESSION.cap && opaqueCalls > 0) {
      compressedFrameCalls = opaqueCalls;
      break;
    }
  }

  expect(compressedFrameCalls).toBeGreaterThan(0);
  expect(compressedFrameCalls).toBeLessThanOrEqual(callBudget);
});
