import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import type { Chunk } from '../src/core/chunk.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SkySnapshot } from '../src/core/skySnapshot.ts';
import { buildSkyResult, type SkyResult } from '../src/core/skyTransport.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { Streamer } from '../src/game/streamer.ts';
import { Skylight } from '../src/render/skylight.ts';
import { baseTerrainShape } from './baseRegistry.ts';

class QuietWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(): void {
    // The test deliberately prevents worker execution.
  }
  terminate(): void {
    // The test worker owns no external resources.
  }
}

afterEach(() => vi.unstubAllGlobals());

it('reports real all-air arrivals and unloads so a padded top at 32 cannot retain missing-column darkness', () => {
  vi.stubGlobal('Worker', QuietWorker);
  const world = new World();
  const scale = makeScale(0.5);
  const { registry } = buildRegistry([
    {
      source: 'fixture.json',
      data: {
        blocks: ['grass', 'dirt', 'stone', 'sand'].map((id) => ({ id, name: id, color: '#888888', solid: true })),
      },
    },
  ]);
  const entities = new BlockEntities(registry);
  const scene = new Scene();
  let admit = false;
  const jobs: { input: SkySnapshot; receive: (result: SkyResult, ms: number) => void }[] = [];
  const sky = new Skylight(
    [{ min: [0, 20, 0], max: [8, 30, 8] }],
    { blockSize: 0.5, top: 96, viewRadiusM: 32 },
    {
      world,
      entities,
      registry,
      bottom: scale.minCy * CHUNK,
      clock: () => 0,
      submit: (input, receive) => {
        if (!admit) {
          return false;
        }
        jobs.push({ input, receive });
        return true;
      },
    },
  );
  const update = () => sky.update(scene, [4, 29, 4]);
  update();
  expect(sky.at([2, 14.5, 2])).toBeGreaterThan(0);
  expect(sky.at([2, 14.5, 2])).toBeLessThan(1);
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 4),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 0,
    surface: { height: () => 20, top: () => undefined },
  });
  const events: number[][] = [];
  const loaded: string[] = [];
  const unloaded: string[] = [];
  streamer.onColumn = (cx, cz) => loaded.push(`${cx},${cz}`);
  streamer.onColumnUnload = (cx, cz) => unloaded.push(`${cx},${cz}`);
  streamer.onDataChange = (origin) => {
    events.push(origin);
    sky.chunkChanged(origin);
  };
  for (let attempt = 0; attempt < 32 && !streamer.isReady(0, 0); attempt += 1) {
    streamer.update(0, 0);
  }
  expect(streamer.isReady(0, 0)).toBe(true);
  expect(loaded).toContain('0,0');
  expect(world.getChunk(0, 1, 0)?.isEmpty()).toBe(true);
  admit = true;
  update();
  expect(jobs.length).toBeGreaterThan(0);
  const job = jobs.shift()!;
  job.receive(buildSkyResult(job.input), 0);
  update();
  expect(sky.at([2, 14.5, 2])).toBe(1);
  expect(events).toContainEqual([0, 32, 0]);
  events.length = 0;
  streamer.update(20 * CHUNK, 20 * CHUNK);
  expect(unloaded).toContain('0,0');
  expect(world.getChunk(0, 1, 0)).toBeUndefined();
  expect(events).toContainEqual([0, 32, 0]);
  update();
  expect(sky.at([2, 14.5, 2])).toBe(1);
  expect(sky.inspect()[0]!.current).toBe(false);
});

it('reports generated-column transitions that match the generated-column snapshot', () => {
  vi.stubGlobal('Worker', QuietWorker);
  const world = new World();
  const scale = makeScale(0.5);
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 4),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 0,
  });
  const observedGenerated = new Set<string>();
  streamer.onColumn = (cx, cz) => observedGenerated.add(`${cx},${cz}`);
  streamer.onColumnUnload = (cx, cz) => observedGenerated.delete(`${cx},${cz}`);
  const reconcile = () => {
    const snapshot = new Set(streamer.generatedColumns().map(([cx, cz]) => `${cx},${cz}`));
    expect(observedGenerated).toEqual(snapshot);
  };

  for (let attempt = 0; attempt < 32 && !streamer.isReady(0, 0); attempt += 1) {
    streamer.update(0, 0);
    reconcile();
  }
  expect(streamer.isReady(0, 0)).toBe(true);
  streamer.update(20 * CHUNK, 20 * CHUNK);
  reconcile();
  expect(streamer.isReady(0, 0)).toBe(false);
});

it('lets replay drive terrain generation and unloading without live streaming side effects', () => {
  vi.stubGlobal('Worker', QuietWorker);
  const world = new World();
  const scale = makeScale(0.5);
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 4),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 0,
    surface: { height: () => 20, top: () => undefined },
  });
  const liveLoads = vi.fn();
  const liveUnloads = vi.fn();
  streamer.onColumn = liveLoads;
  streamer.onColumnUnload = liveUnloads;
  streamer.setReplayControlled();

  streamer.update(0, 0);
  expect(streamer.generatedColumns()).toEqual([]);
  expect(streamer.generateForReplay(0, 0)).toBe(true);
  expect(world.getChunk(0, scale.minCy, 0)).toBeDefined();
  expect(streamer.generateForReplay(2, 0)).toBe(false);
  streamer.update(20 * CHUNK, 20 * CHUNK);
  expect(streamer.generatedColumns()).toEqual([[0, 0]]);
  streamer.unloadForReplay(0, 0);

  expect(streamer.generatedColumns()).toEqual([]);
  expect(world.getChunk(0, scale.minCy, 0)).toBeUndefined();
  expect(liveLoads).not.toHaveBeenCalled();
  expect(liveUnloads).not.toHaveBeenCalled();
});

describe('saved columns', () => {
  const scale = makeScale(0.5);
  const terrain = { grass: 1, dirt: 2, rock: 3, sand: 4 };
  const generate = (cx: number, cz: number) =>
    generateColumn({ seed: 17, blocks: terrain, shape: baseTerrainShape(), scale }, cx, cz, []);
  const streamerFor = (world: World, stamp: (chunk: Chunk) => void) => {
    vi.stubGlobal('Worker', QuietWorker);
    const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
    return new Streamer({
      world,
      meshes: meshes as never,
      seed: 17,
      terrain,
      shape: baseTerrainShape(),
      colors: new Uint8Array(256 * 4),
      patterns: new Uint8Array(256),
      weatherable: new Uint8Array(256),
      scale,
      structures: [],
      radius: 0,
      stamp,
    });
  };
  // Column 0,0 with one changed cell, saved and restored into a fresh world.
  const restoredWorld = () => {
    const source = new World();
    for (const chunk of generate(0, 0)) {
      source.addChunk(chunk);
    }
    const y = scale.minCy * CHUNK + 1;
    source.setBlock(1, y, 1, source.getBlock(1, y, 1) === terrain.sand ? terrain.rock : terrain.sand);
    const world = new World();
    world.restoreColumns(structuredClone(source.snapshotColumns(String)), Number);
    return { source, world };
  };
  const stampedColumns = () => {
    const columns = new Set<string>();
    return { columns, stamp: (chunk: Chunk) => columns.add(`${chunk.cx},${chunk.cz}`) };
  };
  const streamUntilReady = (streamer: Streamer): boolean => {
    for (let attempt = 0; attempt < 32 && !streamer.isReady(0, 0); attempt += 1) {
      streamer.update(0, 0);
    }
    return streamer.isReady(0, 0);
  };
  const cellsOfColumn00 = (world: World) => {
    const cells: (Uint16Array | undefined)[] = [];
    for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
      cells.push(world.getChunk(0, cy, 0)?.toArray());
    }
    return cells;
  };

  it('installs a saved column with its saved cells instead of generating it', () => {
    const { source, world } = restoredWorld();
    const { columns, stamp } = stampedColumns();
    expect(streamUntilReady(streamerFor(world, stamp))).toBe(true);
    expect(columns).toContain('1,0');
    expect(columns).not.toContain('0,0');
    expect(cellsOfColumn00(world)).toEqual(cellsOfColumn00(source));
  });

  it('leaves an untouched column out of the save and regenerates it equal to a fresh generation', () => {
    const { world } = restoredWorld();
    expect(streamUntilReady(streamerFor(world, () => undefined))).toBe(true);
    expect(world.snapshotColumns(String).map(({ cx, cz }) => [cx, cz])).toEqual([[0, 0]]);
    for (const chunk of generate(1, 0)) {
      expect(world.getChunk(1, chunk.cy, 0)!.toArray()).toEqual(chunk.toArray());
    }
  });

  it("keeps a touched column's chunks in memory after the player moves out of range", () => {
    const { source, world } = restoredWorld();
    const streamer = streamerFor(world, () => undefined);
    expect(streamUntilReady(streamer)).toBe(true);
    streamer.update(20 * CHUNK, 20 * CHUNK);
    expect(streamer.hasGeneratedColumn(0, 0)).toBe(false);
    expect(world.getChunk(1, scale.minCy, 0)).toBeUndefined();
    expect(cellsOfColumn00(world)).toEqual(cellsOfColumn00(source));
  });

  it('reads the saved column when replay drives a touched column in and out', () => {
    const { source, world } = restoredWorld();
    const { columns, stamp } = stampedColumns();
    const streamer = streamerFor(world, stamp);
    streamer.setReplayControlled();
    streamer.update(0, 0);
    expect(streamer.generateForReplay(0, 0)).toBe(true);
    expect(columns).not.toContain('0,0');
    streamer.unloadForReplay(0, 0);
    expect(cellsOfColumn00(world)).toEqual(cellsOfColumn00(source));
  });

  it('turns a generation failure into a refusal callback instead of throwing from Streamer.update', () => {
    const streamer = streamerFor(new World(), () => {
      throw new Error('fixture generation failure');
    });
    const failures: unknown[] = [];
    streamer.onGenerationError = (error) => failures.push(error);

    expect(() => streamer.update(0, 0)).not.toThrow();
    expect(failures).toHaveLength(1);
    expect(streamer.failure).toContain('fixture generation failure');
    expect(() => streamer.update(0, 0)).not.toThrow();
    expect(failures).toHaveLength(1);
  });
});
