// Neighbours must exist before meshing so border faces and wide AO never need a corrective second pass.

import { installColumn } from '../core/canonicalTerrain.ts';
import type { Chunk } from '../core/chunk.ts';
import { RevealWindow } from '../core/columnReveal.ts';
import { CHUNK, chunkKey, toChunk, type Vec3 } from '../core/coords.ts';
import type { FencePostDefs } from '../core/fencePosts.ts';
import type { MeshData } from '../core/mesher.ts';
import type { Scale } from '../core/scale.ts';
import type { SkySnapshot } from '../core/skySnapshot.ts';
import type { SkyResult } from '../core/skyTransport.ts';
import type { TerrainEvaluator } from '../core/terrainEvaluator.ts';
import type { WireMeshes } from '../core/wireMesh.ts';
import type { World } from '../core/world.ts';
import { isEnclosed } from '../core/world.ts';
import { DirtyChunks } from './dirtyChunks.ts';
import type { FromMesher, MesherPort, MesherSource, ToMesher } from './mesherProtocol.ts';
import { SentChunks } from './sentChunks.ts';
import { TerrainJobs, type TerrainWorkerOptions } from './terrainJobs.ts';

/** True when a column `dx, dz` columns from the centre column lies within `radius` of it, centre to centre. */
const withinRadius = (dx: number, dz: number, radius: number): boolean => dx * dx + dz * dz <= radius * radius;

/** Column offsets within `radius` of the centre column, nearest first. */
const discOffsets = (radius: number): [number, number][] => {
  const offsets: [number, number][] = [];
  const r = Math.floor(radius);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (withinRadius(dx, dz, radius)) {
        offsets.push([dx, dz]);
      }
    }
  }
  return offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
};

/** `disc` and every column touching it, so each disc column has all eight neighbours; nearest first. */
const grownOffsets = (disc: readonly (readonly [number, number])[]): [number, number][] => {
  const grown = new Map<string, [number, number]>();
  for (const [x, z] of disc) {
    for (let dz = z - 1; dz <= z + 1; dz++) {
      for (let dx = x - 1; dx <= x + 1; dx++) {
        grown.set(`${dx},${dz}`, [dx, dz]);
      }
    }
  }
  return [...grown.values()].sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
};

/** Column keys ("cx,cz") farther than `keep` columns from the centre column. */
export const farColumns = (columns: Iterable<string>, [pcx, pcz]: readonly [number, number], keep: number): string[] =>
  [...columns].filter((col) => {
    const [cx, cz] = col.split(',').map(Number) as [number, number];
    return !withinRadius(cx - pcx, cz - pcz, keep);
  });

/** Where finished chunk meshes go, and which columns may be drawn. */
export interface ChunkMeshSink {
  setRevealedColumns: (columns: ReadonlySet<string>) => void;
  keys: () => IterableIterator<string>;
  set: (key: string, origin: [number, number, number], data: MeshData) => void;
  remove: (key: string) => void;
}

export interface StreamerOptions {
  world: World;
  meshes: ChunkMeshSink;
  mesher: MesherSource;
  terrain: TerrainEvaluator;
  publication?: {
    arrive: (cx: number, cz: number) => void;
    unload: (cx: number, cz: number) => void;
    cacheColumn: (column: readonly Chunk[]) => void;
  };
  colors: Uint8Array;
  /** Surface pattern id per block id, for the mesher. */
  patterns: Uint8Array;
  /** Content-owned render-weathering flag per block id. */
  weatherable: Uint8Array;
  wireMeshes?: WireMeshes;
  /** Liquid flag per block id (`blockLiquids`). */
  liquids?: Uint8Array;
  fencePosts?: FencePostDefs;
  scale: Scale;
  /** Mesh radius in chunks (a disc). Terrain is generated for every neighbour of a meshed column. */
  radius: number;
  /** Terrain columns generated per frame while streaming; from graphics tuning. */
  columnsPerFrame: number;
  /** Extra terrain rings for sky prebuilding, without expanding mesh/reveal admission. */
  preloadRings: number;
  /** Chunks beyond the rings that meshes and chunk data stay, so a column on the edge does not churn. */
  hysteresis: number;
  /** When given, per-column and per-chunk timings are appended here. */
  stats?: StreamerStats;
  /** Workers computing columns ahead of admission; without them every column is evaluated at admission. */
  terrainWorkers?: TerrainWorkerOptions | undefined;
  /** Emits startup streaming diagnostics only for a debug session. */
  debug?: boolean;
}

export interface StreamerStats {
  /** Main-thread milliseconds to admit each column, including any generation main does itself. */
  genMs: number[];
  /** Worker milliseconds to mesh each chunk. */
  meshMs: number[];
  /** Triangles in each chunk mesh that wasn't empty. */
  triangles: number[];
}

export class Streamer {
  private readonly opts: StreamerOptions;
  private readonly occluders: Uint8Array;
  private readonly generated = new Set<string>(); // resident column keys "cx,cz"
  private readonly published = new Set<string>();
  private publishedPrefix = 0;
  // An edit replaces an existing mesh; it must not close a column that already has its occluders drawn.
  private readonly completeColumns = new Set<string>();
  private readonly dirty = new DirtyChunks();
  private readonly versions = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly workers: MesherPort[] = [];
  private readonly sentChunks = new Map<MesherPort, SentChunks>();
  private readonly maxInFlight: number;
  private readonly jobs: TerrainJobs | undefined;
  private generationFailed = false;
  failure: string | undefined;

  get loadingWorkUnits(): number {
    return this.offsets.length + this.meshOffsets.length * (this.opts.scale.maxCy - this.opts.scale.minCy + 1);
  }
  private replayControlled = false;
  /**
   * The last `update` found nothing to load, mesh or unload, and nothing since has changed that
   * (every mutation outside `update` clears it), so the next `update` in the same column skips the full pass.
   */
  private settled = false;
  /** The generated ring, nearest first. */
  private readonly offsets: [number, number][];
  /**
   * Every column of `offsets` before this index is generated around the scan centre, so the scan resumes here;
   * a move or an unload resets it.
   */
  private generatedPrefix = 0;
  private readonly offsetKeys: Set<string>;
  /** The meshed disc, nearest first. */
  private readonly meshOffsets: [number, number][];
  private readonly revealOffsets: [number, number][];
  private readonly discs = new Map<number, [number, number][]>();
  private nextWorker = 0;
  private nextSkyId = 0;
  private readonly skyReplies = new Map<number, (result: SkyResult, ms: number) => void>();
  private readonly pendingSky: { id: number; input: SkySnapshot }[] = [];
  /** Prebuild after terrain arrives, before refilling the mesh queue. */
  onTerrainReady: ((x: number, z: number) => void) | undefined;
  /** Admission seam for lighting; neighbour residency policy is separate. */
  onBeforeReveal: ((cx: number, cz: number) => void) | undefined;
  private revealed = new Set<string>();
  private readonly reveal: RevealWindow;
  /** Columns whose meshed state may have just turned true, awaiting `refreshReveal`. */
  private readonly recheck = new Set<string>();
  private centerChanged = true;
  private firstMeshDelivered = false;
  private readonly workerLoads = new Map<MesherPort, number>();
  private readonly debugStageRealMs = new Map<string, number[]>();
  private debugIdleStarted: number | undefined;
  private debugIdleRealMs = 0;
  private debugReported = false;
  onSkyService: ((realMs: number) => void) | undefined;

  /** Copied requests await admission without occupying startup mesh slots. */
  requestSky(input: SkySnapshot, receive: (result: SkyResult, ms: number) => void): boolean {
    if (this.skyReplies.size >= this.maxInFlight) {
      return false;
    }
    const id = this.nextSkyId;
    this.nextSkyId += 1;
    this.skyReplies.set(id, receive);
    this.pendingSky.push({ id, input });
    this.dispatchSky();
    return true;
  }

  private dispatchSky(): void {
    if (!(this.pendingSky.length > 0 && this.firstMeshDelivered) || this.occupied >= this.maxInFlight) {
      return;
    }
    const worker = this.workers.reduce((least, candidate) =>
      (this.workerLoads.get(candidate) ?? 0) < (this.workerLoads.get(least) ?? 0) ? candidate : least,
    );
    const { id, input } = this.pendingSky.shift()!;
    const startedRealMs = this.onSkyService ? performance.now() : undefined;
    this.send(worker, { type: 'sky', id, input });
    if (startedRealMs !== undefined) {
      this.onSkyService?.(performance.now() - startedRealMs);
    }
  }

  private get occupied(): number {
    return this.inFlight.size + this.skyReplies.size - this.pendingSky.length;
  }
  private center: [number, number] = [Number.NaN, Number.NaN];
  /** Publishes simulation supply and spawns on the fixed update schedule, independently of render work. */
  onColumn: (cx: number, cz: number) => void = () => undefined;
  /** Removes simulation residency on the fixed retention boundary, independently of render work. */
  onColumnUnload: (cx: number, cz: number) => void = () => undefined;
  /** Handles a deterministic generation failure, so a restored save is refused instead of overwritten. */
  onGenerationError: ((error: unknown) => void) | undefined;

  constructor(opts: StreamerOptions) {
    this.opts = opts;
    opts.meshes.setRevealedColumns(new Set());
    this.occluders = Uint8Array.from({ length: opts.colors.length / 3 }, (_, id) =>
      Number(id !== 0 && !opts.wireMeshes?.[id] && !opts.liquids?.[id]),
    );
    const { count } = opts.mesher;
    for (let i = 0; i < count; i++) {
      const worker = opts.mesher.create();
      worker.listen({
        message: (reply) => this.receive(worker, reply),
        failure: (reason) => {
          this.failure ??= reason;
        },
      });
      this.send(worker, {
        type: 'init',
        colors: opts.colors,
        patterns: opts.patterns,
        weatherable: opts.weatherable,
        wireMeshes: opts.wireMeshes ?? [],
        liquids: opts.liquids ?? new Uint8Array(0),
        fencePosts: opts.fencePosts ?? [],
        occluders: this.occluders,
      });
      this.workers.push(worker);
      this.sentChunks.set(worker, new SentChunks());
    }
    this.maxInFlight = count * 2;
    if (opts.terrainWorkers) {
      this.jobs = new TerrainJobs(opts.terrainWorkers, opts.terrain.plan, opts.scale, {
        onTiming: (cx, cz, workerRealMs) => this.debugDuration('terrain data worker', `${cx},${cz}`, workerRealMs),
        onColumn: (column) => opts.publication?.cacheColumn(column),
      });
    }

    this.meshOffsets = discOffsets(opts.radius);
    this.revealOffsets = grownOffsets(this.meshOffsets);
    this.reveal = new RevealWindow(this.revealOffsets);
    this.offsets = grownOffsets(discOffsets(opts.radius + opts.preloadRings));
    this.offsetKeys = new Set(this.offsets.map(([dx, dz]) => `${dx},${dz}`));
  }

  get pending(): number {
    return this.dirty.size;
  }

  /** Logs the startup stream's work and the condition that released the loading mask. */
  reportLoadReady(condition: string): void {
    if (!(this.opts.debug && !this.debugReported)) {
      return;
    }
    this.debugReported = true;
    this.noteWorkerLoad();
    const stages = Object.fromEntries(
      [...this.debugStageRealMs].map(([stage, samples]) => [
        stage,
        { count: samples.length, sumRealMs: sum(samples), maxRealMs: Math.max(0, ...samples) },
      ]),
    );
    // biome-ignore lint/suspicious/noConsole: debug load diagnostics are intentionally console-only.
    console.info(
      `deadvox load: streamer ready ${JSON.stringify({
        chunks: this.generated.size,
        workers: this.workers.length,
        gapsWithoutBusyWorkerRealMs: this.debugIdleRealMs,
        readyCondition: condition,
        stages,
      })}`,
    );
  }

  /** True once the player's column and its neighbours exist, so physics has ground to stand on. */
  isReady(x: number, z: number): boolean {
    return this.neighboursGenerated(toChunk(Math.floor(x)), toChunk(Math.floor(z)));
  }

  setReplayControlled(): void {
    this.settled = false;
    this.replayControlled = true;
    this.jobs?.retain((cx, cz) => this.published.has(`${cx},${cz}`));
  }

  /** Published simulation columns at a replay recording boundary. */
  generatedColumns(): [number, number][] {
    return [...this.published]
      .map((key) => key.split(',').map(Number) as [number, number])
      .sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
  }

  hasGeneratedColumn(cx: number, cz: number): boolean {
    return this.generated.has(`${cx},${cz}`);
  }

  /** Accepts a recorded publication, without waiting for drawing or rolling its supply. */
  publishReplayColumn(cx: number, cz: number): boolean {
    if (!this.replayControlled || this.generationFailed) {
      return false;
    }
    const key = `${cx},${cz}`;
    if (this.published.has(key)) {
      return true;
    }
    if (!(Number.isSafeInteger(cx) && Number.isSafeInteger(cz))) {
      return false;
    }
    this.settled = false;
    this.published.add(key);
    this.publishFacts(cx, cz);
    if (!this.jobs) {
      this.generate(cx, cz);
    }
    return !this.generationFailed;
  }

  /** Removes replay-unloaded terrain without applying its unload-time simulation effects. */
  unloadForReplay(cx: number, cz: number): void {
    this.settled = false;
    const col = `${cx},${cz}`;
    if (!this.replayControlled) {
      return;
    }
    const published = this.published.delete(col);
    const generated = this.ungenerate(col);
    if (!(published || generated)) {
      return;
    }
    this.jobs?.discard(cx, cz);
    this.opts.publication?.unload(cx, cz);
    const { world, scale, meshes } = this.opts;
    this.forgetComplete(cx, cz);
    this.dirtyReplayNeighbours(cx, cz);
    const pinned = world.isTouched(cx, cz);
    for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
      meshes.remove(chunkKey(cx, cy, cz));
      if (!pinned) {
        this.removeChunk(cx, cy, cz);
      }
    }
    this.refreshReveal();
  }

  /**
   * Columns within `within` chunks of (x, z)'s column that aren't fully meshed yet:
   * not generated, or with a chunk waiting for or being meshed. Zero means no holes.
   */
  unmeshedColumns(x: number, z: number, within: number): number {
    return this.columnsMissing(x, z, within, (cx, cz) => this.columnMeshed(cx, cz));
  }

  /** Columns within `within` chunks of (x, z) whose terrain is not generated yet. */
  ungeneratedColumns(x: number, z: number, within: number): number {
    return this.columnsMissing(x, z, within, (cx, cz) => this.generated.has(`${cx},${cz}`));
  }

  private columnsMissing(x: number, z: number, within: number, has: (cx: number, cz: number) => boolean): number {
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    let disc = this.discs.get(within);
    if (!disc) {
      disc = discOffsets(within);
      this.discs.set(within, disc);
    }
    return disc.filter(([dx, dz]) => !has(pcx + dx, pcz + dz)).length;
  }

  private columnMeshed(cx: number, cz: number): boolean {
    if (!this.generated.has(`${cx},${cz}`)) {
      return false;
    }
    for (let cy = this.opts.scale.minCy; cy <= this.opts.scale.maxCy; cy++) {
      const key = chunkKey(cx, cy, cz);
      if (this.dirty.has(key) || this.inFlight.has(key)) {
        return false;
      }
    }
    return true;
  }

  unmeshedRecordedColumns(
    x: number,
    z: number,
    columns: readonly (readonly [number, number])[],
    within = this.opts.radius,
  ): number {
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    return columns.filter(([cx, cz]) => withinRadius(cx - pcx, cz - pcz, within) && !this.columnMeshed(cx, cz)).length;
  }

  // Replay may start with a partial ring: mesh the recorded boundary without inventing terrain,
  // then repair its border AO/faces when a recorded neighbour arrives or leaves.
  private dirtyReplayNeighbours(cx: number, cz: number): void {
    for (let z = cz - 1; z <= cz + 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let y = this.opts.scale.minCy; y <= this.opts.scale.maxCy; y++) {
          const chunk = this.opts.world.getChunk(x, y, z);
          if (chunk && !chunk.isEmpty()) {
            const key = chunkKey(x, y, z);
            this.dirty.add(x, y, z);
            this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  /** Call after editing blocks with the chunks World.setBlock returned. */
  markEdited(chunks: Vec3[]): void {
    this.settled = false;
    for (const [cx, cy, cz] of chunks) {
      const key = chunkKey(cx, cy, cz);
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
      this.dirty.add(cx, cy, cz);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
  update(x: number, z: number): void {
    if (this.generationFailed) {
      return;
    }
    if (this.failure) {
      // Escapes the frame like an unhandled generation failure: the loading mask during load, the error report after.
      throw new Error(this.failure);
    }
    if (this.jobs?.failure) {
      // Decided here, not in the worker's message handler, and before admission could cover it with main-thread work.
      this.failGeneration(new Error(this.jobs.failure));
      return;
    }
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    const moved = pcx !== this.center[0] || pcz !== this.center[1];

    // Sky prebuild depends on state outside the streamer, so it runs even when the streamer is settled.
    if (this.settled && !moved) {
      this.onTerrainReady?.(x, z);
      this.dispatchSky();
      return;
    }

    if (moved) {
      this.generatedPrefix = 0;
      this.publishedPrefix = 0;
      this.jobs?.retain((cx, cz) =>
        this.replayControlled ? this.published.has(`${cx},${cz}`) : this.offsetKeys.has(`${cx - pcx},${cz - pcz}`),
      );
    }
    const published = this.publishNearest(pcx, pcz);
    this.prefetch(pcx, pcz);
    let worked = this.generateNearest(pcx, pcz) || published || moved;
    if (this.generationFailed) {
      return;
    }
    this.prefetch(pcx, pcz);
    if (this.jobs?.failure) {
      // A request that could not be sent fails this update, so no later admission covers it.
      this.failGeneration(new Error(this.jobs.failure));
      return;
    }
    this.onTerrainReady?.(x, z);
    this.dispatchSky();
    for (const [dx, dz] of this.meshOffsets) {
      if (this.occupied >= this.maxInFlight) {
        worked = true; // dirty chunks may remain
        break;
      }
      const cx = pcx + dx;
      const cz = pcz + dz;
      if (!(this.dirty.inColumn(cx, cz) && (this.replayControlled || this.neighboursGenerated(cx, cz)))) {
        continue;
      }
      for (let cy = this.opts.scale.minCy; cy <= this.opts.scale.maxCy && this.occupied < this.maxInFlight; cy++) {
        const key = chunkKey(cx, cy, cz);
        if (this.dirty.has(key) && !this.inFlight.has(key)) {
          this.requestMesh(key, cx, cy, cz);
          worked = true;
        }
      }
    }

    if (moved) {
      this.center = [pcx, pcz];
      this.centerChanged = true;
      for (const key of [...this.opts.meshes.keys()]) {
        const [cx, cy, cz] = key.split(',').map(Number) as Vec3;
        if (!this.inRange(cx, cz)) {
          this.opts.meshes.remove(key);
          this.forgetComplete(cx, cz);
          this.dirty.add(cx, cy, cz); // remesh when we come back
        }
      }
      if (!this.replayControlled) {
        this.unloadFar();
      }
    }
    this.refreshReveal();
    this.settled = !worked;
  }

  private publishFacts(cx: number, cz: number): void {
    this.opts.publication?.arrive(cx, cz);
    const staged = this.jobs?.peek(cx, cz);
    if (staged) {
      this.opts.publication?.cacheColumn(staged);
    }
  }

  private publishNearest(pcx: number, pcz: number): boolean {
    if (this.replayControlled) {
      return false;
    }
    let budget = this.opts.columnsPerFrame;
    let worked = false;
    for (; this.publishedPrefix < this.offsets.length; this.publishedPrefix++) {
      if (budget === 0) {
        return true;
      }
      const [dx, dz] = this.offsets[this.publishedPrefix]!;
      const cx = pcx + dx;
      const cz = pcz + dz;
      const key = `${cx},${cz}`;
      if (this.published.has(key)) {
        continue;
      }
      try {
        this.publishFacts(cx, cz);
        this.onColumn(cx, cz);
      } catch (error) {
        this.failGeneration(error);
        return true;
      }
      this.published.add(key);
      budget -= 1;
      worked = true;
    }
    return worked;
  }

  /** Generates the nearest missing columns within the frame budget; true when it generated any or some may remain. */
  private generateNearest(pcx: number, pcz: number): boolean {
    if (this.replayControlled) {
      return this.admitReplayNearest(pcx, pcz);
    }
    let budget = this.opts.columnsPerFrame;
    let worked = false;
    for (; this.generatedPrefix < this.offsets.length; this.generatedPrefix++) {
      if (budget === 0) {
        return true; // columns may remain
      }
      const [dx, dz] = this.offsets[this.generatedPrefix]!;
      const [cx, cz] = [pcx + dx, pcz + dz];
      if (!this.generated.has(`${cx},${cz}`)) {
        if (!this.generate(cx, cz)) {
          return true;
        }
        budget -= 1;
        worked = true;
      }
      if (this.generationFailed) {
        return true;
      }
    }
    return worked;
  }

  private pendingReplay(pcx: number, pcz: number): [number, number][] {
    return [...this.published]
      .filter((key) => !this.generated.has(key))
      .map((key) => key.split(',').map(Number) as [number, number])
      .sort(([ax, az], [bx, bz]) => (ax - pcx) ** 2 + (az - pcz) ** 2 - (bx - pcx) ** 2 - (bz - pcz) ** 2);
  }

  private admitReplayNearest(pcx: number, pcz: number): boolean {
    const pending = this.pendingReplay(pcx, pcz);
    for (const [cx, cz] of pending.slice(0, this.opts.columnsPerFrame)) {
      if (!this.generate(cx, cz) || this.generationFailed) {
        return true;
      }
    }
    return pending.length > 0;
  }

  private *renderCandidates(pcx: number, pcz: number): Generator<[number, number]> {
    if (this.replayControlled) {
      yield* this.pendingReplay(pcx, pcz);
      return;
    }
    for (let at = this.generatedPrefix; at < this.offsets.length; at++) {
      const [dx, dz] = this.offsets[at]!;
      yield [pcx + dx, pcz + dz];
    }
  }

  /** Asks the workers for the next missing columns in admission order; never admits one. */
  private prefetch(pcx: number, pcz: number): void {
    const { jobs } = this;
    if (!jobs) {
      return;
    }
    const wanted: [number, number][] = [];
    for (const [cx, cz] of this.renderCandidates(pcx, pcz)) {
      if (wanted.length >= jobs.lookahead) {
        break;
      }
      // A touched column arrives from its resident chunks, so computing it would be wasted.
      if (!(this.generated.has(`${cx},${cz}`) || this.opts.world.isTouched(cx, cz))) {
        this.debugMark('generation submit', `${cx},${cz}`);
        wanted.push([cx, cz]);
      }
    }
    jobs.want(wanted);
  }

  private ungenerate(col: string): boolean {
    const removed = this.generated.delete(col);
    if (removed) {
      this.generatedPrefix = 0;
    }
    return removed;
  }

  private forgetComplete(cx: number, cz: number): void {
    if (this.completeColumns.delete(`${cx},${cz}`)) {
      this.reveal.touch(cx, cz);
    }
  }

  private markComplete(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    if (!this.completeColumns.has(key) && this.columnMeshed(cx, cz)) {
      this.completeColumns.add(key);
      this.reveal.touch(cx, cz);
    }
  }

  /**
   * Only a column event (generated, meshed, unloaded) or a move changes which columns are complete,
   * so the window is rescanned after a move and otherwise only the columns an event touched.
   */
  private refreshReveal(): void {
    if (this.centerChanged) {
      this.centerChanged = false;
      this.recheck.clear();
      this.reveal.recenter(this.center);
      for (const [dx, dz] of this.revealOffsets) {
        this.markComplete(this.center[0] + dx, this.center[1] + dz);
      }
    } else {
      for (const key of this.recheck) {
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        if (this.reveal.contains(cx, cz)) {
          this.markComplete(cx, cz);
        }
      }
      this.recheck.clear();
    }
    const change = this.reveal.settle((cx, cz) => this.completeColumns.has(`${cx},${cz}`));
    if (!change) {
      return;
    }
    for (const [cx, cz] of change.added) {
      if (!this.revealed.has(`${cx},${cz}`)) {
        this.onBeforeReveal?.(cx, cz);
      }
    }
    this.revealed = change.columns;
    this.opts.meshes.setRevealedColumns(change.columns);
  }

  /**
   * Drops chunk data far out of range. Untouched columns regenerate from the seed when
   * the player returns; touched ones stay in memory for the session (`packages/deadvox/DESIGN.md`, "Edits persist").
   */
  private unloadFar(): void {
    const { world, scale, radius, preloadRings, hysteresis } = this.opts;
    // The meshing dependency shell reaches less than a diagonal step past the preload disc.
    const keep = radius + preloadRings + Math.SQRT2 + hysteresis;
    for (const col of farColumns(this.published, this.center, keep)) {
      const [cx, cz] = col.split(',').map(Number) as [number, number];
      this.published.delete(col);
      this.publishedPrefix = 0;
      this.opts.publication?.unload(cx, cz);
      this.onColumnUnload(cx, cz);
    }
    for (const col of farColumns(this.generated, this.center, keep)) {
      const [cx, cz] = col.split(',').map(Number) as [number, number];
      if (!world.isTouched(cx, cz)) {
        for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
          this.removeChunk(cx, cy, cz);
        }
      }
      this.ungenerate(col);
      this.forgetComplete(cx, cz);
    }
  }

  private removeChunk(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    this.opts.world.removeChunk(cx, cy, cz);
    this.dirty.delete(cx, cy, cz);
    this.versions.delete(key);
    for (const sent of this.sentChunks.values()) {
      sent.drop(key);
    }
  }

  /** Whether a column's meshes stay drawn. */
  private inRange(cx: number, cz: number): boolean {
    return withinRadius(cx - this.center[0], cz - this.center[1], this.opts.radius + this.opts.hysteresis);
  }

  private neighboursGenerated(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.generated.has(`${cx + dx},${cz + dz}`)) {
          return false;
        }
      }
    }
    return true;
  }

  /** Generates a column, or installs its saved chunks, if it isn't streamed in yet. Returns true if it did work. */
  private generate(cx: number, cz: number): boolean {
    if (this.generationFailed) {
      return false;
    }
    const col = `${cx},${cz}`;
    if (this.generated.has(col)) {
      return false;
    }
    const start = performance.now();
    try {
      if (this.jobs?.failure) {
        throw new Error(this.jobs.failure);
      }
      const touched = this.residentTouchedColumn(cx, cz);
      if (touched) {
        this.jobs?.discard(cx, cz);
      }
      const staged = touched ? undefined : this.jobs?.take(cx, cz);
      if (this.jobs && !touched && !staged) {
        return false;
      }
      this.debugMark('generation admit', col);
      const arrived = touched ?? this.addGenerated(cx, cz, staged);
      this.opts.stats?.genMs.push(performance.now() - start);
      this.debugMeasure('generation', col, start);
      for (const chunk of arrived) {
        if (!chunk.isEmpty()) {
          this.dirty.add(chunk.cx, chunk.cy, chunk.cz);
        }
      }
      this.generated.add(col);
      if (this.replayControlled) {
        this.dirtyReplayNeighbours(cx, cz);
      }
      this.recheck.add(col);
      return true;
    } catch (error) {
      this.failGeneration(error);
      return true;
    }
  }

  private failGeneration(error: unknown): void {
    this.generationFailed = true;
    this.failure = (error instanceof Error ? error.message : String(error)) || 'World generation failed';
    this.jobs?.dispose();
    if (!this.onGenerationError) {
      throw error;
    }
    this.onGenerationError(error);
  }

  /** Standalone sources have no worker; never cover a live worker's missing result here. */
  private addGenerated(cx: number, cz: number, staged: Chunk[] | undefined): Chunk[] {
    const { world, terrain } = this.opts;
    let column = staged;
    if (!column) {
      if (this.jobs) {
        throw new Error('Terrain worker result required for render admission');
      }
      const start = performance.now();
      column = terrain.generateColumn(cx, cz);
      this.debugMeasure('terrain data main', `${cx},${cz}`, start);
    }
    this.opts.publication?.cacheColumn(column);
    return installColumn(world, column);
  }

  /** A touched column's chunks when every one is resident, so it is installed instead of generated. */
  private residentTouchedColumn(cx: number, cz: number): Chunk[] | undefined {
    const { world, scale } = this.opts;
    if (!world.isTouched(cx, cz)) {
      return undefined;
    }
    const chunks: Chunk[] = [];
    for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
      const chunk = world.getChunk(cx, cy, cz);
      if (!chunk) {
        throw new Error(`Incomplete touched column ${cx},${cz}`);
      }
      chunks.push(chunk);
    }
    return chunks;
  }

  private recheckChunkColumn(chunkKeyText: string): void {
    const [cx, , cz] = chunkKeyText.split(',');
    this.recheck.add(`${cx},${cz}`);
  }

  private requestMesh(key: string, cx: number, cy: number, cz: number): void {
    this.dirty.delete(cx, cy, cz);
    const { world, scale, meshes } = this.opts;
    if (isEnclosed(world, [cx, cy, cz], scale.minCy, this.occluders)) {
      meshes.remove(key); // nothing visible; skip the worker entirely
      this.recheckChunkColumn(key);
      return;
    }
    this.inFlight.add(key);
    this.debugMark('mesh submit', key);
    const worker = this.workers[this.nextWorker % this.workers.length]!;
    this.nextWorker += 1;
    // The worker builds the padded and wide arrays; the main thread only copies the chunks they read that it lacks.
    const [neighbourhood, transfer] = this.sentChunks.get(worker)!.send(world, [cx, cy, cz], scale.minCy);
    this.send(worker, { type: 'mesh', key, version: this.versions.get(key) ?? 0, neighbourhood }, transfer);
  }

  private receive(worker: MesherPort, msg: FromMesher): void {
    this.settled = false;
    this.workerLoads.set(worker, (this.workerLoads.get(worker) ?? 1) - 1);
    this.noteWorkerLoad();
    if (msg.type === 'sky') {
      const callback = this.skyReplies.get(msg.id);
      this.skyReplies.delete(msg.id);
      callback?.(msg.result, msg.workerRealMs);
      this.dispatchSky();
      return;
    }
    if (msg.type === 'meshFailed') {
      this.inFlight.delete(msg.key);
      const [cx, cy, cz] = msg.key.split(',').map(Number) as Vec3;
      this.dirty.add(cx, cy, cz);
      this.failure ??= `World mesh worker failed on chunk ${msg.key}: ${msg.message}`;
      return;
    }
    this.receiveMesh(msg);
    this.dispatchSky();
  }

  private receiveMesh(msg: Extract<FromMesher, { type: 'mesh' }>): void {
    const received = performance.now();
    this.inFlight.delete(msg.key);
    this.debugDuration('mesh', msg.key, msg.ms);
    this.debugMark('main-thread receive', msg.key);
    this.recheckChunkColumn(msg.key);
    const { stats } = this.opts;
    if (stats) {
      stats.meshMs.push(msg.ms);
      if (msg.mesh.indices.length > 0) {
        stats.triangles.push(msg.mesh.indices.length / 3);
      }
    }
    if ((this.versions.get(msg.key) ?? 0) !== msg.version) {
      return; // edited meanwhile; already dirty again
    }
    const [cx, cy, cz] = msg.key.split(',').map(Number) as Vec3;
    if (!this.inRange(cx, cz)) {
      if (this.opts.world.getChunk(cx, cy, cz)) {
        this.dirty.add(cx, cy, cz);
      }
      return;
    }
    const uploadStart = performance.now();
    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);
    this.debugMeasure('GPU upload', msg.key, uploadStart);
    this.debugMeasure('main-thread receive', msg.key, received);
    this.firstMeshDelivered ||= msg.mesh.indices.length > 0;
    this.refreshReveal();
  }

  private send(worker: MesherPort, msg: ToMesher, transfer: ArrayBuffer[] = []): void {
    if (msg.type !== 'init') {
      this.workerLoads.set(worker, (this.workerLoads.get(worker) ?? 0) + 1);
      this.noteWorkerLoad();
    }
    if (msg.type === 'sky') {
      transfer.push(...msg.input.chunks.flatMap((chunk) => (chunk.raw ? [chunk.raw.buffer as ArrayBuffer] : [])));
    }
    worker.post(msg, transfer);
  }

  private debugMark(stage: string, key: string): void {
    if (this.opts.debug) {
      performance.mark(`deadvox load: streamer ${stage} ${key}`);
    }
  }

  private debugMeasure(stage: string, key: string, start: number | undefined): void {
    if (start !== undefined) {
      this.debugDuration(stage, key, performance.now() - start);
    }
  }

  private debugDuration(stage: string, key: string, duration: number): void {
    if (!this.opts.debug) {
      return;
    }
    performance.mark(`deadvox load: streamer ${stage} done ${key}`);
    const samples = this.debugStageRealMs.get(stage) ?? [];
    samples.push(duration);
    this.debugStageRealMs.set(stage, samples);
    performance.measure(`deadvox load: streamer ${stage} ${key}`, { start: performance.now() - duration, duration });
  }

  private noteWorkerLoad(): void {
    if (!this.opts.debug) {
      return;
    }
    const now = performance.now();
    const busy = [...this.workerLoads.values()].some((load) => load > 0);
    if (busy && this.debugIdleStarted !== undefined) {
      this.debugIdleRealMs += now - this.debugIdleStarted;
      this.debugIdleStarted = undefined;
    } else if (!busy && this.debugIdleStarted === undefined) {
      this.debugIdleStarted = now;
    }
  }
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
