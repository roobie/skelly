import { CHUNK, makeScale, World } from '@skelly/engine/world';
import { afterEach, expect, it } from 'vitest';
import type { MesherHandlers, MesherPort, ToMesher } from '../src/game/mesherProtocol.ts';
import { Streamer } from '../src/game/streamer.ts';
import { baseTerrainShape } from './baseRegistry.ts';

/** Answers every mesh request with a non-empty mesh when `drain` runs. */
class AnsweringWorker implements MesherPort {
  static instances: AnsweringWorker[] = [];
  private handlers: MesherHandlers | undefined;
  private readonly waiting: Extract<ToMesher, { type: 'mesh' }>[] = [];
  constructor() {
    AnsweringWorker.instances.push(this);
  }
  listen(handlers: MesherHandlers): void {
    this.handlers = handlers;
  }
  post(message: ToMesher): void {
    if (message.type === 'mesh') {
      this.waiting.push(message);
    }
  }
  drain(): void {
    for (const { key, version } of this.waiting.splice(0)) {
      const mesh = { indices: new Uint32Array(3) };
      this.handlers?.message({ type: 'mesh', key, version, ms: 0, mesh } as never);
    }
  }
}

afterEach(() => {
  AnsweringWorker.instances = [];
});

const RADIUS = 4;
const HYSTERESIS = 1.5;
const distance = (key: string, [pcx, pcz]: readonly [number, number]) => {
  const [cx, , cz] = key.split(',').map(Number) as [number, number, number];
  return Math.hypot(cx - pcx, cz - pcz);
};

const liveStreamer = (preloadRings = 0) => {
  const drawn = new Map<string, unknown>();
  const reveal = { columns: new Set<string>() };
  const meshes = {
    keys: () => drawn.keys(),
    set: (key: string, _at: unknown, mesh: unknown) => drawn.set(key, mesh),
    remove: (key: string) => drawn.delete(key),
    setRevealedColumns: (columns: Set<string>) => {
      reveal.columns = columns;
    },
  };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    mesher: { count: 1, create: () => new AnsweringWorker() },
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 3).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale: { ...makeScale(0.5), minCy: 0, maxCy: 0 },
    structures: [],
    radius: RADIUS,
    preloadRings,
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
  return { streamer, drawn, reveal, settle };
};

it('requires the body column and every immediate neighbour to be generated before reporting ready', () => {
  const { streamer } = liveStreamer();
  streamer.setReplayControlled();
  streamer.update(0, 0);
  const neighbours: [number, number][] = [];
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      neighbours.push([x, z]);
      expect(streamer.generateForReplay(x, z)).toBe(true);
    }
  }
  expect(streamer.isReady(0, 0)).toBe(true);
  for (const [cx, cz] of neighbours) {
    streamer.unloadForReplay(cx, cz);
    expect(streamer.isReady(0, 0)).toBe(false);
    expect(streamer.generateForReplay(cx, cz)).toBe(true);
    expect(streamer.isReady(0, 0)).toBe(true);
  }
});

it.each([0, 1, 2])('keeps view-edge terrain revealed while loading %i extra sky rings', (preloadRings) => {
  const { streamer, drawn, reveal, settle } = liveStreamer(preloadRings);
  settle(0, 0);
  expect(streamer.unmeshedColumns(0.5 * CHUNK, 0.5 * CHUNK, RADIUS)).toBe(0);
  const outside = [...drawn.keys()].filter((key) => distance(key, [0, 0]) > RADIUS);
  expect(outside).toEqual([]);
  // Drawn columns are those inside the disc, which the hole count above found complete.
  const generated = streamer.generatedColumns().map(([cx, cz]) => `${cx},0,${cz}`);
  const inside = generated.filter((key) => distance(key, [0, 0]) <= RADIUS);
  expect(new Set(drawn.keys())).toEqual(new Set(inside));
  expect(inside.length).toBeGreaterThan(0);
  for (const key of inside) {
    const [cx, , cz] = key.split(',');
    expect(reveal.columns.has(`${cx},${cz}`)).toBe(true);
  }
  const loadedRadius = RADIUS + preloadRings;
  expect(generated.filter((key) => distance(key, [0, 0]) > loadedRadius + Math.SQRT2)).toEqual([]);
  const loaded = new Set(generated);
  for (let z = -loadedRadius; z <= loadedRadius; z++) {
    for (let x = -loadedRadius; x <= loadedRadius; x++) {
      if (Math.hypot(x, z) <= loadedRadius) {
        expect(loaded.has(`${x},0,${z}`)).toBe(true);
      }
    }
  }
  const ahead = generated.filter((key) => distance(key, [0, 0]) > RADIUS + Math.SQRT2);
  if (preloadRings > 0) {
    expect(ahead.length).toBeGreaterThan(0);
  }
  for (const key of ahead) {
    const [cx, , cz] = key.split(',');
    expect(reveal.columns.has(`${cx},${cz}`)).toBe(false);
  }
});

it.each([0, 1, 2])('keeps the sky margin resident across a border step with %i extra rings', (preloadRings) => {
  const { streamer, drawn, settle } = liveStreamer(preloadRings);
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
