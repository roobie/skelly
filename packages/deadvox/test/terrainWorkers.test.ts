import { Worker } from 'node:worker_threads';
import { SimulationTerrain } from '@skelly/engine/internal/core/simulationTerrain.ts';
import { NOT_LOADED } from '@skelly/engine/internal/core/terrainRead.ts';
import { Streamer } from '@skelly/engine/internal/game/streamer.ts';
import { decodeColumn, type TerrainHandlers } from '@skelly/engine/internal/game/terrainProtocol.ts';
import { createSession, IDLE } from '@skelly/engine/session';
import {
  BlockEntities,
  CanonicalTerrain,
  CHUNK,
  createTerrainEvaluator,
  createTerrainService,
  type FromTerrain,
  type TerrainPlan,
  type TerrainPort,
  type ToTerrain,
  World,
  worldSolid,
} from '@skelly/engine/world';
import { beforeAll, describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
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
  /** Delivers chosen columns in that order; unchosen replies remain held. */
  deliver(pick: (columns: ColumnReply[]) => FromTerrain[]): void {
    const held = this.held.splice(0);
    const columns = held.filter((column): column is ColumnReply => column.type === 'column');
    const chosen = pick(columns);
    const tickets = new Set(
      chosen.filter((reply): reply is ColumnReply => reply.type === 'column').map((reply) => reply.ticket),
    );
    this.held.push(...columns.filter((reply) => !tickets.has(reply.ticket)));
    for (const reply of [...held.filter((other) => other.type !== 'column'), ...chosen]) {
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

const harness = (
  workers?: {
    count: number;
    lookaheadColumns: number;
    maxOutstandingColumns: number;
    /** Posting this message type throws, as a port whose worker cannot take it does. */
    throwOn?: ToTerrain['type'];
  },
  plan = workerPlan(),
) => {
  const world = new World();
  const evaluator = createTerrainEvaluator(plan);
  const simulationWorld = new SimulationTerrain(evaluator);
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
    publication: simulationWorld,
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
  return { world, simulationWorld, evaluator, streamer, ports, trace, counts, update };
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

const run = (policy?: Policy, workers = { count: 2, lookaheadColumns: 6, maxOutstandingColumns: 8 }) => {
  const live = harness(policy && workers);
  for (const centre of CENTRES) {
    for (const port of live.ports) {
      port.deliver(POLICIES[policy ?? 'absent']);
    }
    live.update(centre);
  }
  return live;
};

describe('asynchronous terrain admission', () => {
  const reference = run();

  it.each(Object.keys(POLICIES) as Policy[])(
    'publishes on the same updates without main-thread render generation when replies are %s',
    (policy) => {
      const worked = run(policy);
      expect(worked.trace).toEqual(reference.trace);
      expect(worked.counts.main).toBe(0);
      if (policy === 'absent') {
        expect(worked.world.chunks.size).toBe(0);
      } else if (policy === 'forward' || policy === 'reversed') {
        expect(worked.world.chunks.size).toBeGreaterThan(0);
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

  it('retains both staged overlap and a still-needed running ticket when the centre moves', () => {
    const live = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 5 });
    const port = live.ports[0]!;
    port.deliver(POLICIES.absent);
    live.update([0, 0]);
    const running = port.generates.find((reply) => reply.cx === 1 && reply.cz === 0)!;
    const staged = port.generates.find((reply) => reply.cx === 0 && reply.cz === 0)!;
    expect(running).toBeDefined();
    expect(staged).toBeDefined();
    port.deliver((columns) => columns.filter((reply) => reply.ticket !== running.ticket));
    live.update([1, 0]);
    const requestsAt = (cx: number, cz: number) => port.generates.filter((reply) => reply.cx === cx && reply.cz === cz);
    expect(requestsAt(running.cx, running.cz)).toHaveLength(1);
    expect(live.streamer.hasGeneratedColumn(running.cx, running.cz)).toBe(false);
    port.deliver(POLICIES.forward);
    for (let frame = 0; frame < 3; frame++) {
      live.update([1, 0]);
    }
    expect(live.streamer.hasGeneratedColumn(running.cx, running.cz)).toBe(true);
    expect(live.streamer.hasGeneratedColumn(staged.cx, staged.cz)).toBe(true);
    expect(requestsAt(staged.cx, staged.cz)).toHaveLength(1);
    expect(live.counts.main).toBe(0);
  });

  it('drops replies for a window it has left, even at the same coordinates, while they hold capacity', () => {
    const limits = { count: 1, lookaheadColumns: 4, maxOutstandingColumns: 5 };
    const worked = harness(limits);
    const port = () => worked.ports[0]!;
    port().deliver(POLICIES.absent);
    for (let swing = 0; swing < 6; swing++) {
      worked.update([0, 0]);
      worked.update([20, 0]);
    }
    expect(port().generates.length).toBeLessThanOrEqual(limits.maxOutstandingColumns);
    worked.update([0, 0]);
    // Retired requests must not install even if those coordinates are wanted again.
    port().deliver((columns) =>
      columns.map((reply) => ({
        ...reply,
        chunks: reply.chunks.map((chunk) => ({ ...chunk, uniform: 77, blocks: undefined })),
      })),
    );
    expect(worked.world.chunks.size).toBe(0);
    for (let settle = 0; settle < 4; settle++) {
      port().deliver(POLICIES.forward);
      worked.update([0, 0]);
    }
    expect(worked.streamer.hasGeneratedColumn(0, 0)).toBe(true);
    expect([...worked.world.chunks.values()].every((chunk) => chunk.uniformId !== 77)).toBe(true);
    expect(worked.counts.main).toBe(0);
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
      if (workers) {
        expect(live.streamer.hasGeneratedColumn(cx, cz)).toBe(false);
      }
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

  describe('moving input with asynchronous render residency', () => {
    const registry = baseRegistry();
    const solidId = registry.blocks.findIndex((block, id) => id > 0 && block.solid);
    const basePlan = workerPlan();
    const plan: TerrainPlan = {
      ...basePlan,
      site: { kind: 'natural' },
      shape: { ...basePlan.shape, minHeightMetres: 2, maxHeightMetres: 2 },
      blocks: { grass: solidId, dirt: solidId, rock: solidId, sand: solidId, water: 0 },
    };
    const figures = stackActorFigureFiles(registry);
    const actorType = registry.actors.keys().next().value!;
    const ground = createTerrainEvaluator(plan).groundAt(0, 0) / scale.blockSize;
    const source = {
      furnitureIn: () => [],
      lootPointsIn: () => [],
      supplySourcesIn: () => [],
      actorsIn: (cx: number, cz: number) => [
        { type: actorType, pos: [cx * CHUNK + CHUNK / 2, ground, cz * CHUNK + CHUNK / 2] as [number, number, number] },
      ],
    };
    const exercise = (policy?: (columns: ColumnReply[]) => FromTerrain[]) => {
      const live = harness(policy && { count: 1, lookaheadColumns: 4, maxOutstandingColumns: 5 }, plan);
      // The standalone resident source is the in-time, pre-split reference.
      const world = policy ? live.simulationWorld : live.world;
      const solid = worldSolid(world, registry, new BlockEntities(registry));
      const ready = (x: number, z: number) => (policy ? live.simulationWorld.ready(x, z) : live.streamer.isReady(x, z));
      const sounds: string[] = [];
      const runtime = createSession({
        registry,
        actorFigureFiles: figures,
        world,
        isSolid: solid,
        isOpaque: solid,
        scale,
        seed: plan.seed,
        start: 43_200,
        spawn: [CHUNK - 1, ground, 1],
        ready,
        controls: {
          active: () => true,
          intent: () => ({ ...IDLE, forward: 1, walk: true }),
          yaw: () => -Math.PI / 2,
          pitch: () => 0,
          walking: () => true,
          descending: () => false,
        },
        audio: { play: ({ event }) => sounds.push(event) },
        notice: () => undefined,
        onRead: () => undefined,
      });
      const publish = live.streamer.onColumn;
      live.streamer.onColumn = (cx, cz) => {
        publish(cx, cz);
        runtime.onColumn(cx, cz, source);
      };
      live.streamer.onColumnUnload = (cx, cz) => runtime.onColumnUnload(cx, cz);
      const update = () => {
        for (const port of live.ports) {
          port.deliver(policy ?? POLICIES.absent);
        }
        const [x, , z] = runtime.body.pos;
        live.update([Math.floor(x / CHUNK), Math.floor(z / CHUNK)]);
      };
      for (let frame = 0; frame < 32; frame++) {
        update();
      }
      runtime.sim.paused = false;
      for (let frame = 0; frame < 120; frame++) {
        update();
        runtime.frame(1 / 60);
      }
      const snapshot = runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
      return {
        result: { snapshot, sounds, publications: live.trace },
        main: live.counts.main,
        residentChunks: live.world.chunks.size,
      };
    };
    let expected: ReturnType<typeof exercise>['result'];
    beforeAll(() => {
      expected = exercise().result;
    });
    it.each(['forward', 'reversed', 'delayed', 'absent'] as const)(
      'matches the in-time simulation snapshot and audio with %s render replies',
      (policyName) => {
        let deliveryTick = 0;
        const deliveries: boolean[] = [];
        const delayed = (columns: ColumnReply[]) => {
          deliveryTick += 1;
          const release = deliveryTick % 8 === 0;
          if (columns.length > 0) {
            deliveries.push(release);
          }
          return release ? columns : [];
        };
        expect(solidId).toBeGreaterThan(0);
        const policy = policyName === 'delayed' ? delayed : POLICIES[policyName];
        const actual = exercise(policy);
        expect(actual.result.snapshot.character.player.body.pos[0]).toBeGreaterThan(CHUNK);
        expect(actual.result.snapshot.character.playerAudio.footstepClock.stepIndex).toBeGreaterThan(0);
        expect(actual.result.snapshot.world.actors.actors.length).toBeGreaterThan(0);
        expect(actual.result).toEqual(expected);
        expect(actual.main).toBe(0);
        if (policyName === 'absent') {
          expect(actual.residentChunks).toBe(0);
        }
        if (policyName === 'delayed') {
          expect(deliveries).toContain(false);
          expect(deliveries).toContain(true);
        }
      },
    );
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
      port.handlers!.message({ type: 'column', epoch: port.epoch, ticket, cx, cz, chunks: [], workerRealMs: 0 });
    },
    'null reply': (port) => port.handlers!.message(null as never),
    'failed reply whose reason is not text': (port) =>
      port.handlers!.message({ type: 'failed', epoch: port.epoch, reason: { toString: 0 } } as never),
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
      expect((reply as ColumnReply).workerRealMs).toBeGreaterThanOrEqual(0);
      const column = decodeColumn((reply as ColumnReply).chunks, 0, 0, scale);
      const main = createTerrainEvaluator(plan).generateColumn(0, 0);
      expect(column.map((chunk) => [chunk.uniformId, chunk.revision, blocksDigest(chunk.raw())])).toEqual(
        main.map((chunk) => [chunk.uniformId, chunk.revision, blocksDigest(chunk.raw())]),
      );
    } finally {
      await thread.terminate();
    }
  });

  it('publishes replay terrain immediately while its drawing waits for a worker', () => {
    const live = harness({ count: 1, lookaheadColumns: 4, maxOutstandingColumns: 4 });
    live.ports[0]!.deliver(POLICIES.absent);
    live.streamer.setReplayControlled();
    live.update([0, 0]);
    expect(live.streamer.publishReplayColumn(0, 0)).toBe(true);
    expect(live.streamer.generatedColumns()).toEqual([[0, 0]]);
    expect(live.simulationWorld.getBlock(1, 1, 1)).not.toBe(NOT_LOADED);
    expect(live.world.chunks.size).toBe(0);
    live.update([0, 0]);
    live.ports[0]!.deliver(POLICIES.forward);
    expect(live.world.chunks.size).toBe(0);
    live.update([0, 0]);
    expect(live.world.getChunk(0, scale.minCy, 0)!.toArray()).toEqual(
      live.evaluator.generateColumn(0, 0)[0]!.toArray(),
    );
    expect(live.trace).toEqual([]);
    expect(live.counts.main).toBe(0);
    expect(live.ports[0]!.terminated).toBe(false);
    expect(live.streamer.publishReplayColumn(20, 0)).toBe(true);
    expect(live.simulationWorld.getBlock(20 * CHUNK, 1, 1)).not.toBe(NOT_LOADED);
    live.update([0, 0]);
    live.streamer.unloadForReplay(20, 0);
    expect(live.simulationWorld.getBlock(20 * CHUNK, 1, 1)).toBe(NOT_LOADED);
    live.ports[0]!.deliver(POLICIES.forward);
    live.update([0, 0]);
    expect(live.world.getChunk(20, scale.minCy, 0)).toBeUndefined();
  });
});
