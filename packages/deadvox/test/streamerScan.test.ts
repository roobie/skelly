import type { MesherHandlers } from '@skelly/engine/internal/game/mesherProtocol.ts';
import { Streamer } from '@skelly/engine/internal/game/streamer.ts';
import type { MesherPort, ToMesher } from '@skelly/engine/mesh';
import { CHUNK, createTerrainEvaluator, makeScale, World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseTerrainShape } from './baseRegistry.ts';

const RADIUS = 4;
const COLUMNS_PER_FRAME = 2;
/** One worker, so the streamer keeps two mesh requests in flight. */
const MAX_IN_FLIGHT = 2;

/** Holds mesh requests until `drain`, so the in-flight limit is reached and released on cue. */
class HoldingWorker implements MesherPort {
  handlers: MesherHandlers | undefined;
  readonly waiting: Extract<ToMesher, { type: 'mesh' }>[] = [];
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

const squaredDistance = ([x, z]: readonly [number, number], [cx, cz]: readonly [number, number]) =>
  (x - cx) ** 2 + (z - cz) ** 2;

/** Columns around `center` with a mesh-disc column among their eight neighbours or themselves. */
const ring = ([cx, cz]: readonly [number, number]): [number, number][] => {
  const columns: [number, number][] = [];
  for (let dz = -RADIUS - 1; dz <= RADIUS + 1; dz++) {
    for (let dx = -RADIUS - 1; dx <= RADIUS + 1; dx++) {
      if (Math.hypot(Math.max(Math.abs(dx) - 1, 0), Math.max(Math.abs(dz) - 1, 0)) <= RADIUS) {
        columns.push([cx + dx, cz + dz]);
      }
    }
  }
  return columns;
};

const harness = () => {
  const world = new World();
  const worker = new HoldingWorker();
  const drawn = new Set<string>();
  const meshes = {
    keys: () => drawn.values(),
    set: (key: string) => drawn.add(key),
    remove: (key: string) => drawn.delete(key),
    setRevealedColumns: () => undefined,
  };
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    mesher: { count: 1, create: () => worker },
    terrain: createTerrainEvaluator({
      seed: 17,
      blocks: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
      shape: { ...baseTerrainShape(), minHeightMetres: 2, maxHeightMetres: 2 },
      scale: { ...makeScale(0.5), minCy: 0, maxCy: 0 },
      site: { kind: 'natural' },
      structures: [],
    }),
    colors: new Uint8Array(256 * 3).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale: { ...makeScale(0.5), minCy: 0, maxCy: 0 },
    radius: RADIUS,
    preloadRings: 0,
    columnsPerFrame: COLUMNS_PER_FRAME,
    hysteresis: 1.5,
  });
  const generated = new Set<string>();
  const arrived: [number, number][] = [];
  streamer.onColumn = (cx, cz) => {
    generated.add(`${cx},${cz}`);
    arrived.push([cx, cz]);
  };
  streamer.onColumnUnload = (cx, cz) => generated.delete(`${cx},${cz}`);

  /** One update at column `center`: what it generated and requested, and what a full scan would still find. */
  const frame = (center: [number, number]) => {
    const missing = ring(center).filter(([x, z]) => !generated.has(`${x},${z}`));
    const posted = worker.waiting.length;
    arrived.length = 0;
    streamer.update((center[0] + 0.5) * CHUNK, (center[1] + 0.5) * CHUNK);
    const inFlight = new Set(worker.waiting.map(({ key }) => key));
    return {
      missing,
      arrived: [...arrived],
      stillMissing: missing.filter(([x, z]) => !generated.has(`${x},${z}`)),
      requested: worker.waiting.slice(posted).map(({ key }) => {
        const [x, , z] = key.split(',').map(Number) as [number, number, number];
        return [x, z] as [number, number];
      }),
      inFlight: inFlight.size,
      // Meshable disc columns with an unmeshed chunk that is not in flight.
      unrequested: ring(center).filter(
        ([x, z]) =>
          squaredDistance([x, z], center) <= RADIUS ** 2 &&
          streamer.isReady(x * CHUNK, z * CHUNK) &&
          streamer.unmeshedColumns(x * CHUNK, z * CHUNK, 0) > 0 &&
          !inFlight.has(`${x},0,${z}`),
      ),
    };
  };
  return { world, streamer, worker, frame };
};

it('generates and requests meshes nearest first across moves, unloads and edits, as a full scan would', () => {
  const { world, streamer, worker, frame } = harness();
  /** `taken` is in nearest-first order and no nearer than anything in `left`. */
  const expectNearestFirst = (
    taken: readonly [number, number][],
    left: readonly [number, number][],
    center: readonly [number, number],
  ) => {
    const distances = taken.map((column) => squaredDistance(column, center));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const nearestLeft = Math.min(...left.map((column) => squaredDistance(column, center)));
    expect(Math.max(...distances, 0)).toBeLessThanOrEqual(nearestLeft);
  };
  const stay = (center: [number, number], frames: number) => {
    for (let i = 0; i < frames; i++) {
      const seen = frame(center);
      expect(seen.arrived).toHaveLength(Math.min(COLUMNS_PER_FRAME, seen.missing.length));
      expectNearestFirst(seen.arrived, seen.stillMissing, center);
      if (seen.inFlight < MAX_IN_FLIGHT) {
        expect(seen.unrequested).toEqual([]);
      }
      expectNearestFirst(seen.requested, seen.unrequested, center);
      if (i % 3 !== 1) {
        worker.drain();
      }
    }
  };
  stay([0, 0], 60);
  // Far enough that the first columns unload, then back so they generate again.
  stay([9, 0], 60);
  stay([0, 0], 60);
  const edited = world.setBlock(CHUNK + 5, 20, 5, 1);
  expect(edited.length).toBeGreaterThan(0);
  streamer.markEdited(edited);
  stay([0, 0], 10);
  // One step: most of the ring stays generated while a new edge streams in.
  stay([1, 1], 60);
  expect(streamer.unmeshedColumns(1.5 * CHUNK, 1.5 * CHUNK, RADIUS)).toBe(0);
});
