import { Worker } from 'node:worker_threads';
import { Streamer } from '@skelly/engine/internal/game/streamer.ts';
import { decodeColumn, type TerrainHandlers } from '@skelly/engine/internal/game/terrainProtocol.ts';
import {
  CanonicalTerrain,
  CHUNK,
  createTerrainEvaluator,
  createTerrainService,
  type FromTerrain,
  type TerrainPort,
  type ToTerrain,
  World,
} from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';
import { FIXTURE_BLOCK, workerPlanScale as scale, workerPlan } from './fixtures/terrainWorkerPlan.ts';

type ColumnReply = Extract<FromTerrain, { type: 'column' }>;

/** Runs the real worker service in-process, structured-cloning both ways, and holds its replies until delivered. */
class HeldTerrainPort implements TerrainPort {
  handlers: TerrainHandlers | undefined;
  readonly posted: ToTerrain[] = [];
  held: FromTerrain[] = [];
  terminated = false;
  private readonly serve = createTerrainService((reply, transfer) =>
    this.held.push(structuredClone(reply, { transfer })),
  );
  private readonly throwOn: ToTerrain['type'] | undefined;
  constructor(throwOn?: ToTerrain['type']) {
    this.throwOn = throwOn;
  }
  post(msg: ToTerrain): void {
    if (msg.type === this.throwOn) {
      throw new Error(`fixture ${msg.type} post`);
    }
    this.posted.push(msg);
    this.serve(structuredClone(msg));
  }
  listen(handlers: TerrainHandlers): void {
    this.handlers = handlers;
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Delivers every held reply other than columns, then the columns `pick` chooses, in its order; the rest are lost. */
  deliver(pick: (columns: ColumnReply[]) => FromTerrain[]): void {
    const held = this.held.splice(0);
    const columns = held.filter((column): column is ColumnReply => column.type === 'column');
    for (const reply of [...held.filter((other) => other.type !== 'column'), ...pick(columns)]) {
      this.handlers!.message(reply);
    }
  }
  get epoch(): number {
    return this.posted[0]!.epoch;
  }
  get generates() {
    return this.posted.filter((msg) => msg.type === 'generate');
  }
}

const POLICIES = {
  forward: (columns: ColumnReply[]) => columns,
  reversed: (columns: ColumnReply[]) => columns.reverse(),
  absent: () => [],
  partial: (columns: ColumnReply[]) => columns.filter((_, at) => at % 2 === 1).reverse(),
} satisfies Record<string, (columns: ColumnReply[]) => FromTerrain[]>;
type Policy = keyof typeof POLICIES;

/** Update centres in chunks: settle, step across a boundary, return, then jump far enough to unload. */
const CENTRES: [number, number][] = [
  ...Array.from({ length: 4 }, (): [number, number] => [0, 0]),
  [1, 0],
  [1, 0],
  [0, 0],
  [0, 0],
  ...Array.from({ length: 6 }, (): [number, number] => [5, 2]),
  ...Array.from({ length: 6 }, (): [number, number] => [0, 0]),
];

const harness = (workers?: {
  count: number;
  lookaheadColumns: number;
  maxOutstandingColumns: number;
  /** Posting this message type throws, as a port whose worker cannot take it does. */
  throwOn?: ToTerrain['type'];
}) => {
  const world = new World();
  const evaluator = createTerrainEvaluator(workerPlan());
  const counts = { main: 0, arrivals: 0 };
  const ports: HeldTerrainPort[] = [];
  const streamer = new Streamer({
    world,
    meshes: {
      keys: () => [].values(),
      set: () => undefined,
      remove: () => undefined,
      setRevealedColumns: () => undefined,
    },
    mesher: quietMesherSource(),
    terrain: {
      ...evaluator,
      generateColumn: (cx, cz) => {
        counts.main += 1;
        return evaluator.generateColumn(cx, cz);
      },
    },
    colors: new Uint8Array(256 * 3),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    radius: 2,
    preloadRings: 0,
    columnsPerFrame: 2,
    hysteresis: 0.5,
    ...(workers && {
      terrainWorkers: {
        ...workers,
        source: () => {
          const port = new HeldTerrainPort(workers.throwOn);
          ports.push(port);
          return port;
        },
      },
    }),
  });
  const trace: string[] = [];
  let step = 0;
  streamer.onColumn = (cx, cz) => {
    counts.arrivals += 1;
    trace.push(`${step}:${cx},${cz}`);
  };
  const update = ([cx, cz]: readonly [number, number]) => {
    streamer.update(cx * CHUNK + 0.5, cz * CHUNK + 0.5);
    step += 1;
  };
  return { world, evaluator, streamer, ports, trace, counts, update };
};

/** FNV-1a over a chunk's block array, compared only between runs of this file. */
const blocksDigest = (blocks: Readonly<Uint16Array> | undefined): number | undefined => {
  if (!blocks) {
    return undefined;
  }
  let hash = 0x81_1c_9d_c5;
  for (const id of blocks) {
    hash = Math.imul(hash ^ id, 0x01_00_01_93);
  }
  return hash >>> 0;
};

/** Every resident chunk: storage form, blocks and revision. */
const residentState = (world: World, streamer: Streamer) =>
  streamer.generatedColumns().flatMap(([cx, cz]) =>
    Array.from({ length: scale.maxCy - scale.minCy + 1 }, (_, at) => {
      const chunk = world.getChunk(cx, scale.minCy + at, cz)!;
      const { cy, uniformId: uniform, revision } = chunk;
      return { cx, cz, cy, uniform, revision, blocks: blocksDigest(chunk.raw()) };
    }),
  );

const run = (policy?: Policy, workers = { count: 2, lookaheadColumns: 6, maxOutstandingColumns: 8 }) => {
  const live = harness(policy && workers);
  for (const centre of CENTRES) {
    for (const port of live.ports) {
      port.deliver(POLICIES[policy ?? 'absent']);
    }
    live.update(centre);
  }
  return { ...live, state: residentState(live.world, live.streamer) };
};

describe('speculative terrain workers', () => {
  const reference = run();

  it.each(Object.keys(POLICIES) as Policy[])(
    'admits the same columns on the same updates as main-thread generation when replies are %s',
    (policy) => {
      const worked = run(policy);
      expect(worked.trace).toEqual(reference.trace);
      expect(worked.state).toEqual(reference.state);
      if (policy !== 'absent') {
        expect(worked.counts.main).toBeLessThan(worked.counts.arrivals);
      }
    },
  );

  it('stages a reply without admitting it until the next update', () => {
    const { world, ports, trace, update } = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 4 });
    ports[0]!.deliver(POLICIES.forward);
    update([0, 0]);
    const before = trace.length;
    const requested = ports[0]!.generates;
    expect(requested.length).toBeGreaterThan(0);
    ports[0]!.deliver(POLICIES.forward);
    expect(trace).toHaveLength(before);
    for (const { cx, cz } of requested) {
      expect(world.getChunk(cx, scale.minCy, cz)).toBeUndefined();
    }
  });

  it('drops replies for a window it has left, even at the same coordinates, while they hold capacity', () => {
    const limits = { count: 1, lookaheadColumns: 4, maxOutstandingColumns: 5 };
    const worked = harness(limits);
    const port = () => worked.ports[0]!;
    port().deliver(POLICIES.absent);
    for (let swing = 0; swing < 6; swing++) {
      worked.update([0, 0]);
      worked.update([3, 0]);
    }
    expect(port().generates.length).toBeLessThanOrEqual(limits.maxOutstandingColumns);
    worked.update([0, 0]);
    // A stale reply that was admitted would install this marker.
    port().deliver((columns) =>
      columns.map((reply) => ({
        ...reply,
        chunks: reply.chunks.map((chunk) => ({ ...chunk, uniform: 77, blocks: undefined })),
      })),
    );
    const baseline = harness();
    for (let swing = 0; swing < 6; swing++) {
      baseline.update([0, 0]);
      baseline.update([3, 0]);
    }
    baseline.update([0, 0]);
    for (let settle = 0; settle < 12; settle++) {
      port().deliver(POLICIES.forward);
      worked.update([0, 0]);
      baseline.update([0, 0]);
    }
    expect(worked.trace).toEqual(baseline.trace);
    expect(residentState(worked.world, worked.streamer)).toEqual(residentState(baseline.world, baseline.streamer));
  });

  it('keeps a gameplay edit made while its column is in flight, with one arrival and the same save', () => {
    let target: [number, number] | undefined;
    const saves = [{ count: 1, lookaheadColumns: 6, maxOutstandingColumns: 6 }, undefined].map((workers) => {
      const live = harness(workers);
      live.ports[0]?.deliver(POLICIES.forward);
      live.update([0, 0]);
      // The first column requested ahead of admission, edited at the same point in both runs.
      target ??= [live.ports[0]!.generates[0]!.cx, live.ports[0]!.generates[0]!.cz];
      const [cx, cz] = target;
      expect(live.streamer.hasGeneratedColumn(cx, cz)).toBe(false);
      new CanonicalTerrain(live.world, live.evaluator).ensureColumn(cx, cz);
      live.world.setBlock(cx * CHUNK + 1, 3, cz * CHUNK + 1, FIXTURE_BLOCK);
      for (let settle = 0; settle < 12; settle++) {
        live.ports[0]?.deliver(POLICIES.forward);
        live.update([0, 0]);
      }
      expect(live.world.getBlock(cx * CHUNK + 1, 3, cz * CHUNK + 1)).toBe(FIXTURE_BLOCK);
      expect(live.trace.filter((entry) => entry.endsWith(`:${cx},${cz}`))).toHaveLength(1);
      return { trace: live.trace, save: live.world.snapshotColumns(String) };
    });
    expect(saves[0]).toEqual(saves[1]);
  });

  it('refuses an incomplete touched column as main-thread generation does', () => {
    const failures = [undefined, { count: 1, lookaheadColumns: 6, maxOutstandingColumns: 6 }].map((workers) => {
      const live = harness(workers);
      const source = new World();
      for (const chunk of live.evaluator.generateColumn(0, 0)) {
        source.addChunk(chunk);
      }
      source.touchColumn(0, 0);
      // A malformed save: its touched column lacks one chunk.
      const saved = structuredClone(source.snapshotColumns(String)).map((column) => ({
        ...column,
        chunks: column.chunks.filter(({ cy }) => cy !== scale.minCy),
      }));
      live.world.restoreColumns(saved, Number);
      const errors: unknown[] = [];
      live.streamer.onGenerationError = (error) => errors.push(error);
      for (let settle = 0; settle < 4; settle++) {
        live.ports[0]?.deliver(POLICIES.forward);
        live.update([0, 0]);
      }
      expect(live.world.getChunk(0, scale.minCy, 0)).toBeUndefined();
      return { errors: errors.length, failure: live.streamer.failure, trace: live.trace };
    });
    expect(failures[0]!.failure).toContain('Incomplete touched column');
    expect(failures[1]).toEqual(failures[0]);
  });

  const faults: Record<string, (port: HeldTerrainPort) => void> = {
    'init failure': (port) => port.handlers!.message({ type: 'failed', epoch: port.epoch, reason: 'fixture init' }),
    'column failure': (port) =>
      port.handlers!.message({
        type: 'failed',
        epoch: port.epoch,
        ticket: port.generates[0]!.ticket,
        reason: 'fixture',
      }),
    crash: (port) => port.handlers!.failure('fixture crash'),
    'malformed reply': (port) => {
      const { ticket, cx, cz } = port.generates[0]!;
      port.handlers!.message({ type: 'column', epoch: port.epoch, ticket, cx, cz, chunks: [] });
    },
    'null reply': (port) => port.handlers!.message(null as never),
    'reply of an unknown type': (port) => {
      // A real column for a wanted ticket, apart from its type.
      const column = port.held.find((reply): reply is ColumnReply => reply.type === 'column')!;
      port.handlers!.message({ ...column, type: 'not-a-column' } as never);
    },
  };

  it.each(Object.keys(faults))(
    'fails generation on worker %s instead of covering it with main-thread work',
    (fault) => {
      const live = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 4 });
      const errors: unknown[] = [];
      live.streamer.onGenerationError = (error) => errors.push(error);
      live.ports[0]!.deliver(POLICIES.absent);
      live.update([0, 0]);
      const arrived = live.trace.length;
      faults[fault]!(live.ports[0]!);
      live.update([0, 0]);
      live.update([0, 0]);
      expect(errors).toHaveLength(1);
      expect(live.streamer.failure).toContain('Terrain worker failed');
      expect(live.trace).toHaveLength(arrived);
      expect(live.ports[0]!.terminated).toBe(true);
    },
  );

  it.each(['init', 'generate'] as const)(
    'fails generation in the same update when posting %s throws, and ends the workers',
    (throwOn) => {
      const live = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 4, throwOn });
      const errors: unknown[] = [];
      live.streamer.onGenerationError = (error) => errors.push(error);
      live.ports[0]!.deliver(POLICIES.absent);
      live.update([0, 0]);
      expect(errors).toHaveLength(1);
      expect(live.streamer.failure).toContain(`fixture ${throwOn} post`);
      expect(live.ports[0]!.terminated).toBe(true);
      const arrived = live.trace.length;
      live.update([0, 0]);
      expect(live.trace).toHaveLength(arrived);
    },
  );

  it('throws a worker failure from update when nothing handles generation errors', () => {
    const live = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 4 });
    live.ports[0]!.handlers!.failure('fixture crash');
    expect(() => live.update([0, 0])).toThrow('Terrain worker failed: fixture crash');
  });

  it('gets from the real terrain module worker the column main generates', async () => {
    const thread = new Worker(new URL('./fixtures/moduleWorkerThread.mjs', import.meta.url), {
      workerData: { entry: new URL('../../presentation/src/worker/terrain.worker.ts', import.meta.url).href },
    });
    const next = () =>
      new Promise<FromTerrain>((resolve, reject) => {
        thread.once('message', resolve);
        thread.once('error', reject);
      });
    try {
      const plan = workerPlan();
      thread.postMessage({ type: 'init', epoch: 1, plan } satisfies ToTerrain);
      expect(await next()).toEqual({ type: 'ready', epoch: 1 });
      thread.postMessage({ type: 'generate', epoch: 1, ticket: 0, cx: 0, cz: 0 } satisfies ToTerrain);
      const reply = await next();
      expect(reply.type).toBe('column');
      const column = decodeColumn((reply as ColumnReply).chunks, 0, 0, scale);
      const main = createTerrainEvaluator(plan).generateColumn(0, 0);
      expect(column.map((chunk) => [chunk.uniformId, chunk.revision, blocksDigest(chunk.raw())])).toEqual(
        main.map((chunk) => [chunk.uniformId, chunk.revision, blocksDigest(chunk.raw())]),
      );
    } finally {
      await thread.terminate();
    }
  });

  it('ends speculative work when replay takes over arrivals', () => {
    const live = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 4 });
    live.ports[0]!.deliver(POLICIES.absent);
    live.update([0, 0]);
    const { cx, cz } = live.ports[0]!.generates[0]!;
    live.streamer.setReplayControlled();
    expect(live.ports[0]!.terminated).toBe(true);
    live.ports[0]!.deliver(POLICIES.forward);
    const arrived = live.trace.length;
    expect(live.streamer.generateForReplay(cx, cz)).toBe(true);
    expect(live.trace).toHaveLength(arrived);
    expect(live.world.getChunk(cx, scale.minCy, cz)!.toArray()).toEqual(
      live.evaluator.generateColumn(cx, cz)[0]!.toArray(),
    );
  });
});
