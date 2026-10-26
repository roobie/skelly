import { afterEach, expect, it, vi } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { Streamer } from '../src/game/streamer.ts';
import type { FromMesher, ToMesher } from '../src/worker/protocol.ts';
import { baseTerrainShape } from './baseRegistry.ts';

/** Answers every mesh request with a non-empty mesh when `drain` runs. */
class AnsweringWorker {
  static instances: AnsweringWorker[] = [];
  onmessage: ((event: { data: FromMesher }) => void) | undefined;
  private readonly waiting: Extract<ToMesher, { type: 'mesh' }>[] = [];
  constructor() {
    AnsweringWorker.instances.push(this);
  }
  postMessage(message: ToMesher): void {
    if (message.type === 'mesh') {
      this.waiting.push(message);
    }
  }
  drain(): void {
    for (const { key, version } of this.waiting.splice(0)) {
      const mesh = { indices: new Uint32Array(3) };
      this.onmessage?.({ data: { type: 'mesh', key, version, ms: 0, mesh } as never });
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  AnsweringWorker.instances = [];
});

const RADIUS = 4;
const HYSTERESIS = 1.5;
const distance = (key: string, [pcx, pcz]: readonly [number, number]) => {
  const [cx, , cz] = key.split(',').map(Number) as [number, number, number];
  return Math.hypot(cx - pcx, cz - pcz);
};

const liveStreamer = () => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
  vi.stubGlobal('Worker', AnsweringWorker);
  const drawn = new Map<string, unknown>();
  const meshes = {
    keys: () => drawn.keys(),
    set: (key: string, _at: unknown, mesh: unknown) => drawn.set(key, mesh),
    remove: (key: string) => drawn.delete(key),
    setRevealedColumns: () => undefined,
  };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 3).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale: { ...makeScale(0.5), minCy: 0, maxCy: 0 },
    structures: [],
    radius: RADIUS,
    hysteresis: HYSTERESIS,
    surface: { height: () => 4, top: () => undefined },
  });
  /** Streams around column (cx, cz) until nothing more loads. */
  const settle = (cx: number, cz: number) => {
    for (let frame = 0; frame < 400; frame++) {
      streamer.update((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK);
      for (const worker of AnsweringWorker.instances) {
        worker.drain();
      }
    }
  };
  return { streamer, drawn, settle };
};

it('draws every column within the view radius and none beyond it, corners included', () => {
  const { streamer, drawn, settle } = liveStreamer();
  settle(0, 0);
  expect(streamer.unmeshedColumns(0.5 * CHUNK, 0.5 * CHUNK, RADIUS)).toBe(0);
  const outside = [...drawn.keys()].filter((key) => distance(key, [0, 0]) > RADIUS);
  expect(outside).toEqual([]);
  // Drawn columns are those inside the disc, which the hole count above found complete.
  const generated = streamer.generatedColumns().map(([cx, cz]) => `${cx},0,${cz}`);
  const inside = generated.filter((key) => distance(key, [0, 0]) <= RADIUS);
  expect(new Set(drawn.keys())).toEqual(new Set(inside));
  // Chunk data reaches only the neighbours meshing needs.
  expect(generated.filter((key) => distance(key, [0, 0]) > RADIUS + Math.SQRT2)).toEqual([]);
});

it('keeps an edge column loaded and drawn when the player steps back across a column border', () => {
  const { streamer, drawn, settle } = liveStreamer();
  settle(0, 0);
  settle(1, 0);
  const loaded = new Set(streamer.generatedColumns().map(([cx, cz]) => `${cx},${cz}`));
  const shown = new Set(drawn.keys());
  const arrived: string[] = [];
  streamer.onColumn = (cx, cz) => arrived.push(`${cx},${cz}`);
  settle(0, 0);
  settle(1, 0);
  expect(arrived).toEqual([]);
  expect(new Set(streamer.generatedColumns().map(([cx, cz]) => `${cx},${cz}`))).toEqual(loaded);
  expect(new Set(drawn.keys())).toEqual(shown);
});
