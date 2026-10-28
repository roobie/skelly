import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { makeScale } from '../src/core/scale.ts';
import { realTimestamp } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import type { Engine } from '../src/game/engine.ts';
import { Streamer } from '../src/game/streamer.ts';
import { WorldLoading } from '../src/game/worldLoading.ts';
import type { FromMesher, ToMesher } from '../src/worker/protocol.ts';
import { baseTerrainShape } from './baseRegistry.ts';

const replies: FromMesher[] = [];
let workerHandler: (event: { data: ToMesher }) => void;

beforeAll(async () => {
  await import('../src/worker/mesh.worker.ts');
  workerHandler = globalThis.onmessage as never;
});

/** Runs each posted request through the real mesh worker handler when `run` is called. */
class RelayWorker {
  static instances: RelayWorker[] = [];
  onmessage: ((event: { data: FromMesher }) => void) | undefined;
  onerror: ((event: { message: string }) => void) | undefined;
  onmessageerror: (() => void) | undefined;
  private readonly waiting: ToMesher[] = [];
  constructor() {
    RelayWorker.instances.push(this);
  }
  postMessage(message: ToMesher, transfer: ArrayBuffer[]): void {
    this.waiting.push(structuredClone(message, { transfer }));
  }
  run(alter: (message: ToMesher) => ToMesher = (message) => message): void {
    for (const message of this.waiting.splice(0)) {
      workerHandler({ data: alter(message) });
      for (const reply of replies.splice(0)) {
        this.onmessage?.({ data: reply });
      }
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  RelayWorker.instances = [];
});

/** A streamer whose world loading has turned ready, with its one worker. */
const loadedStreamer = () => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', RelayWorker);
  vi.stubGlobal('postMessage', (reply: FromMesher) => replies.push(reply));
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 0 };
  const world = new World();
  const streamer = new Streamer({
    world,
    meshes: { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() } as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 3).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 1,
    hysteresis: 1,
    surface: { height: () => 4, top: () => undefined },
  });
  const engine = { streamer, skylight: undefined, config: { readyRadiusChunks: 1, scale } };
  const loading = new WorldLoading(engine as unknown as Engine);
  const [worker] = RelayWorker.instances;
  for (let frame = 0; frame < 64 && !loading.ready; frame++) {
    streamer.update(0, 0);
    worker!.run();
    loading.check([0, 0, 0], realTimestamp(0));
  }
  return { streamer, loading, world, worker: worker! };
};

it('throws a worker reply decode failure after load out of update, so it reaches the error report', () => {
  const { streamer, loading, worker } = loadedStreamer();
  expect(loading.ready).toBe(true);
  worker.onmessageerror!();
  expect(() => streamer.update(0, 0)).toThrow('World mesh worker reply could not be decoded');
  expect(loading.ready).toBe(true);
});

it('returns the key of a mesh build that throws in the worker and fails streaming', () => {
  const { streamer, loading, world, worker } = loadedStreamer();
  expect(loading.ready).toBe(true);
  streamer.markEdited(world.setBlock(1, 4, 1, 2));
  streamer.update(0, 0);
  const waiting = streamer.pending;
  worker.run((message) =>
    message.type === 'mesh' && message.key === '0,0,0' ? { ...message, padded: undefined as never } : message,
  );
  expect(streamer.pending).toBe(waiting + 1);
  expect(() => streamer.update(0, 0)).toThrow('World mesh worker failed on chunk 0,0,0');
});
