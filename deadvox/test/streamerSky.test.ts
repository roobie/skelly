import { afterEach, expect, it, vi } from 'vitest';
import { buildMesh } from '../src/core/mesher.ts';
import { makeScale } from '../src/core/scale.ts';
import { buildSkyResult } from '../src/core/skyTransport.ts';
import { World } from '../src/core/world.ts';
import { Streamer } from '../src/game/streamer.ts';
import type { ToMesher } from '../src/worker/protocol.ts';
import { skyFixture } from './fixtures/sky.ts';

class OwnedWorker {
  static instances: OwnedWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | undefined;
  readonly waiting: Exclude<ToMesher, { type: 'init' }>[] = [];
  readonly posted: string[] = [];
  colors: Uint8Array = new Uint8Array();
  patterns: Uint8Array = new Uint8Array();
  weatherable: Uint8Array = new Uint8Array();
  constructor() {
    OwnedWorker.instances.push(this);
  }
  postMessage(message: ToMesher, transfer: ArrayBuffer[]) {
    const copy = structuredClone(message, { transfer });
    if (copy.type === 'init') {
      this.colors = copy.colors;
      this.patterns = copy.patterns;
      this.weatherable = copy.weatherable;
      return;
    }
    this.waiting.push(copy);
    this.posted.push(copy.type);
  }
  replyNext() {
    const message = this.waiting.shift();
    if (!message) {
      throw new Error('No worker request');
    }
    const data =
      message.type === 'mesh'
        ? {
            type: 'mesh',
            key: message.key,
            version: message.version,
            ms: 0,
            mesh: buildMesh(message.padded, this.colors, {
              patterns: this.patterns,
              wide: message.wide,
              weatherable: this.weatherable,
            }),
          }
        : { type: 'sky', result: buildSkyResult(message.input), workerRealMs: 0 };
    this.onmessage?.({ data });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  OwnedWorker.instances = [];
});

it('meshes a partial recorded ring without generating extra columns and repairs it when a neighbour arrives', () => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', OwnedWorker);
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 0 };
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn() };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    colors: new Uint8Array(256 * 4).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 1,
    surface: { height: () => 20, top: () => undefined },
  });
  streamer.setReplayControlled();
  streamer.update(0, 0);
  expect(streamer.generateForReplay(0, 0)).toBe(true);
  streamer.update(0, 0);
  const worker = OwnedWorker.instances[0]!;
  expect(worker.waiting).toHaveLength(1);
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(1);
  worker.replyNext();
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(0);
  expect(streamer.generatedColumns()).toEqual([[0, 0]]);
  expect(streamer.generateForReplay(1, 0)).toBe(true);
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(1);
  streamer.update(0, 0);
  worker.replyNext();
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(0);
  expect(meshes.set).toHaveBeenCalled();
  streamer.unloadForReplay(1, 0);
  expect(streamer.unmeshedRecordedColumns(0, 0, [[0, 0]])).toBe(1);
});

it('delivers the first mesh before sky and admits queued sky at the next completion despite mesh backlog', () => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', OwnedWorker);
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 0 };
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn() };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4 },
    colors: new Uint8Array(256 * 4).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 1,
    surface: { height: () => 20, top: () => undefined },
  });
  const receive = vi.fn();
  expect(streamer.requestSky(skyFixture().capture().input, receive)).toBe(true);
  const worker = OwnedWorker.instances[0]!;
  expect(worker.posted).toEqual([]);
  for (let step = 0; step < 32 && worker.waiting.length < 2; step++) {
    streamer.update(0, 0);
  }
  expect(worker.posted).toEqual(['mesh', 'mesh']);
  expect(streamer.pending).toBeGreaterThan(0);
  worker.replyNext();
  expect(meshes.set).toHaveBeenCalledTimes(1);
  expect(meshes.set.mock.calls[0]![2].indices.length).toBeGreaterThan(0);
  expect(receive).not.toHaveBeenCalled();
  expect(streamer.isReady(0, 0)).toBe(true);
  expect(worker.waiting.map((message) => message.type)).toEqual(['mesh', 'sky']);
  streamer.update(0, 0);
  expect(worker.posted).toEqual(['mesh', 'mesh', 'sky']);
  worker.replyNext();
  streamer.update(0, 0);
  expect(worker.waiting.map((message) => message.type)).toEqual(['sky', 'mesh']);
  worker.replyNext();
  expect(receive).toHaveBeenCalledTimes(1);
  worker.replyNext();
  expect(meshes.set.mock.calls.length).toBeGreaterThan(1);
});
