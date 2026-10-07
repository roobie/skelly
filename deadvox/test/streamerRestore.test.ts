import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { Streamer } from '../src/game/streamer.ts';
import { Skylight } from '../src/render/skylight.ts';

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
  const { registry } = buildRegistry([]);
  const entities = new BlockEntities(registry);
  const scene = new Scene();
  const sky = new Skylight([{ min: [0, 20, 0], max: [8, 30, 8] }], 0.5, 96, 32);
  const opaque = (x: number, y: number, z: number) =>
    !world.getChunk(toChunk(x), toChunk(y), toChunk(z)) || world.getBlock(x, y, z) !== 0;
  const update = () => sky.update(scene, [4, 29, 4], { entities }, opaque);
  update();
  expect(sky.at([2, 14.5, 2])).toBe(0);
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn() };
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, stone: 3, sand: 4 },
    colors: new Uint8Array(256 * 4),
    patterns: new Uint8Array(256),
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
  streamer.update(0, 0);
  expect(loaded).toContain('0,0');
  expect(world.getChunk(0, 1, 0)?.isEmpty()).toBe(true);
  update();
  expect(sky.at([2, 14.5, 2])).toBe(1);
  expect(events).toContainEqual([0, 32, 0]);
  events.length = 0;
  streamer.update(20 * CHUNK, 20 * CHUNK);
  expect(unloaded).toContain('0,0');
  expect(world.getChunk(0, 1, 0)).toBeUndefined();
  expect(events).toContainEqual([0, 32, 0]);
  update();
  expect(sky.at([2, 14.5, 2])).toBe(0);
});

it('reports only readiness transitions and snapshots the ready columns', () => {
  vi.stubGlobal('Worker', QuietWorker);
  const world = new World();
  const scale = makeScale(0.5);
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn() };
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, stone: 3, sand: 4 },
    colors: new Uint8Array(256 * 4),
    patterns: new Uint8Array(256),
    scale,
    structures: [],
    radius: 0,
  });
  const observedReady = new Set<string>();
  const changes: [number, number, boolean][] = [];
  let consumed = 0;
  streamer.onReadinessChange = (cx, cz, ready) => changes.push([cx, cz, ready]);
  const reconcile = () => {
    for (const [cx, cz, ready] of changes.slice(consumed)) {
      const key = `${cx},${cz}`;
      if (ready) {
        observedReady.add(key);
      } else {
        observedReady.delete(key);
      }
    }
    consumed = changes.length;
    const snapshot = new Set(streamer.readyColumns().map(([cx, cz]) => `${cx},${cz}`));
    expect(observedReady).toEqual(snapshot);
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

describe('lazy restored world diffs', () => {
  it('turns a generated-base mismatch into a refusal callback instead of throwing from Streamer.update', () => {
    vi.stubGlobal('Worker', QuietWorker);
    const scale = makeScale(0.5);
    const terrain = { grass: 1, dirt: 2, stone: 3, sand: 4 };
    const generated = generateColumn({ seed: 17, blocks: terrain, scale }, 0, 0, [])[0]!;
    const actualBase = generated.at(0);
    const wrongBase = actualBase === 0xff_ff ? 0xff_fe : 0xff_ff;
    const world = new World();
    world.restoreDiffs(
      {
        chunks: [{ cx: 0, cy: scale.minCy, cz: 0, cells: [{ index: 0, base: 'base', id: 'changed' }] }],
      },
      (id) => (id === 'base' ? wrongBase : 0),
    );
    const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn() };
    const streamer = new Streamer({
      world,
      meshes: meshes as never,
      seed: 17,
      terrain,
      colors: new Uint8Array(256 * 4),
      patterns: new Uint8Array(256),
      scale,
      structures: [],
      radius: 0,
    });
    const failures: unknown[] = [];
    const title = { continueEnabled: true, status: '' };
    streamer.onGenerationError = (error) => {
      failures.push(error);
      title.continueEnabled = false;
      title.status = `Saved world unreadable: ${error instanceof Error ? error.message : String(error)}`;
    };

    expect(() => streamer.update(0, 0)).not.toThrow();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ message: expect.stringContaining('Generated base mismatch') });
    expect(title).toEqual({
      continueEnabled: false,
      status: expect.stringContaining('Saved world unreadable: Generated base mismatch'),
    });
    expect(world.snapshotDiffs((id) => String(id)).chunks).toHaveLength(1);
    expect(() => streamer.update(0, 0)).not.toThrow();
    expect(failures).toHaveLength(1);
  });
});
