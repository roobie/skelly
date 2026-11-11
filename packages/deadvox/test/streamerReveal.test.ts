import { revealedColumns } from '@skelly/engine/internal/core/columnReveal.ts';
import type { MesherHandlers } from '@skelly/engine/internal/game/mesherProtocol.ts';
import { Streamer } from '@skelly/engine/internal/game/streamer.ts';
import type { MesherPort, ToMesher } from '@skelly/engine/mesh';
import { CHUNK, makeScale, World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { fixtureTerrain } from './fixtures/terrain.ts';

const RADIUS = 4;
const HYSTERESIS = 1.5;

/** Holds mesh requests until `drain`, so a column stays unmeshed for a chosen number of frames. */
class HoldingWorker implements MesherPort {
  handlers: MesherHandlers | undefined;
  private readonly waiting: Extract<ToMesher, { type: 'mesh' }>[] = [];
  listen(handlers: MesherHandlers): void {
    this.handlers = handlers;
  }
  post(message: ToMesher): void {
    if (message.type === 'mesh') {
      this.waiting.push(message);
    }
  }
  drain(): void {
    while (this.deliverOne()) {
      // Each delivery is its own reveal refresh.
    }
  }
  /** Answers the oldest held request; false when none is held. */
  deliverOne(): boolean {
    const request = this.waiting.shift();
    if (!request) {
      return false;
    }
    const mesh = { indices: new Uint32Array(3) };
    this.handlers?.message({ type: 'mesh', key: request.key, version: request.version, ms: 0, mesh } as never);
    return true;
  }
}

const harness = () => {
  const worker = new HoldingWorker();
  const drawn = new Set<string>();
  const reveal = { columns: new Set<string>() };
  const meshes = {
    keys: () => drawn.values(),
    set: (key: string) => drawn.add(key),
    remove: (key: string) => drawn.delete(key),
    setRevealedColumns: (columns: Set<string>) => {
      reveal.columns = columns;
    },
  };
  const streamer = new Streamer({
    world: new World(),
    meshes: meshes as never,
    mesher: { count: 1, create: () => worker },
    terrain: fixtureTerrain({ scale: { ...makeScale(0.5), minCy: 0, maxCy: 0 }, floor: 4 }),
    colors: new Uint8Array(256 * 3).fill(255),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale: { ...makeScale(0.5), minCy: 0, maxCy: 0 },
    radius: RADIUS,
    preloadRings: 0,
    columnsPerFrame: 2,
    hysteresis: HYSTERESIS,
  });
  return { streamer, worker, reveal };
};

/** The reveal rule as a full scan every frame, from the streamer's public meshed-column answer. */
const fullScanModel = () => {
  const complete = new Set<string>();
  const window: [number, number][] = [];
  let center: [number, number] = [Number.NaN, Number.NaN];
  for (let dz = -RADIUS - 1; dz <= RADIUS + 1; dz++) {
    for (let dx = -RADIUS - 1; dx <= RADIUS + 1; dx++) {
      const nearest = Math.hypot(Math.max(Math.abs(dx) - 1, 0), Math.max(Math.abs(dz) - 1, 0));
      if (nearest <= RADIUS) {
        window.push([dx, dz]);
      }
    }
  }
  window.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
  return {
    unloaded: (cx: number, cz: number): void => {
      complete.delete(`${cx},${cz}`);
    },
    frame: (streamer: Streamer, cx: number, cz: number): Set<string> => {
      const moved = cx !== center[0] || cz !== center[1];
      center = [cx, cz];
      for (const key of [...complete]) {
        const [x, z] = key.split(',').map(Number) as [number, number];
        const outOfRange = moved && Math.hypot(x - cx, z - cz) > RADIUS + HYSTERESIS;
        if (outOfRange || !streamer.hasGeneratedColumn(x, z)) {
          complete.delete(key);
        }
      }
      for (const [dx, dz] of window) {
        const x = cx + dx;
        const z = cz + dz;
        if (streamer.unmeshedColumns(x * CHUNK, z * CHUNK, 0) === 0) {
          complete.add(`${x},${z}`);
        }
      }
      return revealedColumns(center, window, (x, z) => complete.has(`${x},${z}`));
    },
  };
};

it('hides an unloaded replay column until it is regenerated and meshed again', () => {
  const { streamer, worker, reveal } = harness();
  streamer.setReplayControlled();
  const model = fullScanModel();
  const around: [number, number][] = [];
  for (let z = -3; z <= 3; z++) {
    for (let x = -3; x <= 3; x++) {
      around.push([x, z]);
    }
  }
  const frame = () => {
    streamer.update(0.5 * CHUNK, 0.5 * CHUNK);
    expect(reveal.columns).toEqual(model.frame(streamer, 0, 0));
  };
  streamer.update(0.5 * CHUNK, 0.5 * CHUNK); // sets the centre, which gates replay generation
  for (const [x, z] of around) {
    streamer.generateForReplay(x, z);
  }
  for (let i = 0; i < 20; i++) {
    frame();
    worker.drain();
  }
  expect(reveal.columns.has('0,0')).toBe(true);
  streamer.unloadForReplay(0, 0);
  model.unloaded(0, 0);
  expect(streamer.generateForReplay(0, 0)).toBe(true);
  // Regenerated but not yet meshed: the full scan hides it.
  frame();
  expect(reveal.columns.has('0,0')).toBe(false);
  for (let i = 0; i < 20; i++) {
    frame();
    worker.drain();
  }
  expect(reveal.columns.has('0,0')).toBe(true);
});

it('reveals the same columns, announced in the same order, as a full scan through load, mesh, unload and reload', () => {
  const { streamer, worker, reveal } = harness();
  const model = fullScanModel();
  const announced: string[] = [];
  streamer.onBeforeReveal = (cx, cz) => announced.push(`${cx},${cz}`);
  let modelRevealed = new Set<string>();
  const route: [number, number][] = [
    [0, 0],
    [0, 0],
    [6, 0],
    [6, 0],
    [0, 0],
    [0, 0],
  ];
  const revealedAtEnd: Set<string>[] = [];
  for (const [cx, cz] of route) {
    // Meshes arrive every third frame, so columns spend frames generated but unmeshed.
    const check = () => {
      const expected = model.frame(streamer, cx, cz);
      expect(reveal.columns).toEqual(expected);
      expect(announced.splice(0)).toEqual([...expected].filter((key) => !modelRevealed.has(key)));
      modelRevealed = expected;
    };
    for (let frame = 0; frame < 120; frame++) {
      streamer.update((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK);
      check();
      while (frame % 3 === 2 && worker.deliverOne()) {
        check();
      }
    }
    revealedAtEnd.push(reveal.columns);
  }
  // The route unloaded column (-RADIUS, 0) and brought it back: it must be revealed again.
  expect(revealedAtEnd.at(-1)?.has(`${-RADIUS},0`)).toBe(true);
});
