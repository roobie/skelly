import { describe, expect, it } from 'vitest';
import { paperMapBounds } from '../src/core/paperMap.ts';
import {
  type PaperMapCacheKey,
  PaperMapRenderCache,
  type PaperMapRenderConfig,
  samplePaperMapTerrain,
} from '../src/core/paperMapRender.ts';
import { makeScale } from '../src/core/scale.ts';
import type { TerrainShape } from '../src/core/worldgen.ts';

const shape: TerrainShape = {
  minHeightMetres: -3,
  maxHeightMetres: 17,
  beachBelowMetres: 0,
  dirtDepthMetres: 1,
  featureSizeMetres: 23,
  octaves: 3,
};
const terrain = { seed: 91, shape, scale: makeScale(1), surface: undefined };
const config: PaperMapRenderConfig = { cellMetres: 8, contourSpacingMetres: 4, revision: 'fixture-v1' };
const samples = (coverage: { x: number; z: number }) => samplePaperMapTerrain(terrain, coverage, config);

const edge = (map: ReturnType<typeof samples>, side: 'left' | 'right') =>
  Array.from({ length: map.width }, (_, row) => map.heights[(side === 'left' ? 0 : map.width - 1) + row * map.width]!);

it('reproduces terrain-only semantic output from restored generation inputs', () => {
  const original = samples({ x: -1, z: 2 });
  const restored = samplePaperMapTerrain(structuredClone(terrain), { x: -1, z: 2 }, structuredClone(config));
  expect(restored.heights).toEqual(original.heights);
  expect(restored.hillshade).toEqual(original.hillshade);
  expect(restored.contours).toEqual(original.contours);
});

it('prints only explicit public roads and tracks, independently of generation order', () => {
  const coverage = { x: 0, z: 0 };
  const bounds = paperMapBounds(coverage);
  const printable = [
    {
      kind: 'track' as const,
      points: [
        [bounds.x0 - 1, bounds.z0 + 4],
        [bounds.x1 + 1, bounds.z0 + 4],
      ] as const,
      width: 3,
    },
    {
      kind: 'road' as const,
      bounds: { x0: bounds.x0 + 8, z0: bounds.z0 + 8, x1: bounds.x0 + 16, z1: bounds.z0 + 16 },
    },
  ];
  const hiddenUnderground = { points: [[bounds.x0 + 2, bounds.z0 + 2]] };
  const first = samplePaperMapTerrain(terrain, coverage, config, printable);
  const second = samplePaperMapTerrain(terrain, coverage, config, [...printable].reverse());

  expect(first.publicFeatures).toEqual(second.publicFeatures);
  expect(first.publicFeatures).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'road' }), expect.objectContaining({ kind: 'track' })]),
  );
  expect(JSON.stringify(first.publicFeatures)).not.toContain(JSON.stringify(hiddenUnderground.points));
});

it('shares exact terrain and clipped contour endpoints at an adjacent cut', () => {
  const left = samples({ x: 0, z: 0 });
  const right = samples({ x: 1, z: 0 });
  expect(edge(left, 'right')).toEqual(edge(right, 'left'));
  expect(paperMapBounds(left.coverage).x1).toBe(paperMapBounds(right.coverage).x0);
  for (const map of [left, right]) {
    const bounds = paperMapBounds(map.coverage);
    for (const contour of map.contours) {
      for (let i = 0; i < contour.segments.length; i += 4) {
        expect(contour.segments[i]!).toBeGreaterThanOrEqual(bounds.x0);
        expect(contour.segments[i]!).toBeLessThanOrEqual(bounds.x1);
        expect(contour.segments[i + 1]!).toBeGreaterThanOrEqual(bounds.z0);
        expect(contour.segments[i + 1]!).toBeLessThanOrEqual(bounds.z1);
      }
    }
  }
});

it('samples baseline terrain without reading mutable generated terrain, visits, loot or simulation RNG', () => {
  const baseline = samples({ x: 0, z: -1 });
  const mutableWorld = {
    visited: new Set<string>(),
    loot: ['unrolled'],
    simulationRng: 17,
    terrain: new Map<string, number>(),
  };
  mutableWorld.visited.add('changed');
  mutableWorld.loot.push('rolled');
  mutableWorld.simulationRng += 1;
  mutableWorld.terrain.set('changed-column', 999);
  expect(samples({ x: 0, z: -1 })).toEqual(baseline);
  expect(mutableWorld).toEqual({
    visited: new Set(['changed']),
    loot: ['unrolled', 'rolled'],
    simulationRng: 18,
    terrain: new Map([['changed-column', 999]]),
  });
});

interface Task<T> {
  readonly key: PaperMapCacheKey;
  readonly signal: AbortSignal;
  resolve: (value: T) => void;
}

const controlledCache = <T>(capacity = 2) => {
  const tasks: Task<T>[] = [];
  const cache = new PaperMapRenderCache<T>(
    capacity,
    (cacheKey, signal) => new Promise<T>((resolve) => tasks.push({ key: cacheKey, signal, resolve })),
  );
  return { cache, tasks };
};

const key = (worldIdentity: string, x = 0): PaperMapCacheKey => ({
  worldIdentity,
  coverage: { x, z: 0 },
  renderRevision: config.revision,
});

describe('paper-map render cache', () => {
  it('deduplicates concurrent work and lets one reader cancel without cancelling another', async () => {
    const { cache, tasks } = controlledCache<string>();
    const first = cache.request(key('world-a'));
    const second = cache.request(key('world-a'));
    expect(tasks).toHaveLength(1);
    first.cancel();
    expect(tasks[0]!.signal.aborted).toBe(false);
    tasks[0]!.resolve('map-a');
    await expect(second.result).resolves.toBe('map-a');
    await expect(cache.request(key('world-a')).result).resolves.toBe('map-a');
    expect(tasks).toHaveLength(1);
  });

  it('cancels obsolete work after its last reader leaves and replaces it for a new reader', async () => {
    const { cache, tasks } = controlledCache<string>();
    const request = cache.request(key('world-a'));
    request.cancel();
    expect(tasks[0]!.signal.aborted).toBe(true);
    const replacement = cache.request(key('world-a'));
    expect(tasks).toHaveLength(2);
    tasks[1]!.resolve('fresh-map-a');
    await expect(replacement.result).resolves.toBe('fresh-map-a');
  });

  it('isolates same-region results from distinct worlds', async () => {
    const { cache, tasks } = controlledCache<string>();
    const first = cache.request(key('world-a'));
    const second = cache.request(key('world-b'));
    expect(tasks).toHaveLength(2);
    tasks[0]!.resolve('map-a');
    tasks[1]!.resolve('map-b');
    await expect(first.result).resolves.toBe('map-a');
    await expect(second.result).resolves.toBe('map-b');
  });

  it('evicts least-recently-used ready work within the session bound', async () => {
    const { cache, tasks } = controlledCache<string>(1);
    const first = cache.request(key('world-a'));
    tasks[0]!.resolve('map-a');
    await first.result;
    const second = cache.request(key('world-a', 1));
    tasks[1]!.resolve('map-b');
    await second.result;
    cache.request(key('world-a'));
    expect(tasks).toHaveLength(3);
  });
});
