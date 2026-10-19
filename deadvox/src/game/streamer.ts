// Keeps the world around the player generated and meshed.
// Terrain is generated one column at a time on the main thread; meshes are built in
// workers. A chunk is only meshed once all eight neighbouring columns exist, so faces
// and AO at chunk borders (including the wide occlusion, which reaches half a chunk) are correct
// and never need a second pass.

import type { Chunk } from '../core/chunk.ts';
import { CHUNK, chunkKey, toChunk, type Vec3 } from '../core/coords.ts';
import { extractPadded, extractWide } from '../core/meshInput.ts';
import type { Scale } from '../core/scale.ts';
import type { SkySnapshot } from '../core/skySnapshot.ts';
import type { SkyResult } from '../core/skyTransport.ts';
import type { BlockBox } from '../core/structure.ts';
import type { WireMeshes } from '../core/wireMesh.ts';
import type { World } from '../core/world.ts';
import { isEnclosed } from '../core/world.ts';
import { generateColumn, type Surface, type TerrainBlocks, type TerrainShape } from '../core/worldgen.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import type { FromMesher, ToMesher } from '../worker/protocol.ts';

const COLUMNS_PER_FRAME = 2;
/** Chunk data is dropped this many columns beyond the generated ring, so walking back and forth doesn't regenerate. */
const UNLOAD_MARGIN = 2;

/** Column keys ("cx,cz") farther than `keep` columns (square distance) from the centre column. */
export const farColumns = (columns: Iterable<string>, [pcx, pcz]: readonly [number, number], keep: number): string[] =>
  [...columns].filter((col) => {
    const [cx, cz] = col.split(',').map(Number) as [number, number];
    return Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > keep;
  });

export interface StreamerOptions {
  world: World;
  meshes: ChunkMeshes;
  seed: number;
  terrain: TerrainBlocks;
  shape: TerrainShape;
  colors: Uint8Array;
  /** Surface pattern id per block id, for the mesher. */
  patterns: Uint8Array;
  /** Content-owned render-weathering flag per block id. */
  weatherable: Uint8Array;
  wireMeshes?: WireMeshes;
  scale: Scale;
  /** Stamped into every column as it generates. */
  structures: readonly BlockBox[];
  /** Changes to the ground (flattened lots, roads). */
  surface?: Surface | undefined;
  /** Writes buildings into each chunk as it generates. */
  stamp?: ((chunk: Chunk) => void) | undefined;
  /** Mesh radius in chunks (square). Terrain is generated one column further out. */
  radius: number;
  /** When given, per-column and per-chunk timings are appended here. */
  stats?: StreamerStats;
}

export interface StreamerStats {
  /** Main-thread milliseconds to generate each column. */
  genMs: number[];
  /** Worker milliseconds to mesh each chunk. */
  meshMs: number[];
  /** Triangles in each chunk mesh that wasn't empty. */
  triangles: number[];
}

export class Streamer {
  private readonly opts: StreamerOptions;
  private readonly occluders: Uint8Array | undefined;
  private readonly generated = new Set<string>(); // column keys "cx,cz"
  private readonly dirty = new Set<string>(); // chunks needing a (re)mesh
  private readonly versions = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly workers: Worker[] = [];
  private readonly maxInFlight: number;
  private generationFailed = false;
  failure: string | undefined;

  get loadingWorkUnits(): number {
    const columns = (this.opts.radius * 2 + 1) ** 2;
    return (this.opts.radius * 2 + 3) ** 2 + columns * (this.opts.scale.maxCy - this.opts.scale.minCy + 1);
  }
  private replayControlled = false;
  private readonly offsets: [number, number][] = [];
  private nextWorker = 0;
  private skyReply: ((result: SkyResult, ms: number) => void) | undefined;
  private pendingSky: SkySnapshot | undefined;
  private firstMeshDelivered = false;
  private readonly workerLoads = new Map<Worker, number>();
  onSkyService: ((realMs: number) => void) | undefined;

  /** One copied request can await admission without occupying a startup mesh slot. */
  requestSky(input: SkySnapshot, receive: (result: SkyResult, ms: number) => void): boolean {
    if (this.skyReply) {
      return false;
    }
    this.skyReply = receive;
    this.pendingSky = input;
    this.dispatchSky();
    return true;
  }

  private dispatchSky(): void {
    if (!(this.pendingSky && this.firstMeshDelivered) || this.inFlight.size >= this.maxInFlight) {
      return;
    }
    const worker = this.workers.reduce((least, candidate) =>
      (this.workerLoads.get(candidate) ?? 0) < (this.workerLoads.get(least) ?? 0) ? candidate : least,
    );
    const input = this.pendingSky;
    this.pendingSky = undefined;
    const startedRealMs = this.onSkyService ? performance.now() : undefined;
    this.send(worker, { type: 'sky', input });
    if (startedRealMs !== undefined) {
      this.onSkyService?.(performance.now() - startedRealMs);
    }
  }

  private get occupied(): number {
    return this.inFlight.size + Number(Boolean(this.skyReply) && !this.pendingSky);
  }
  private center: [number, number] = [Number.NaN, Number.NaN];
  /** Called after a column is generated, to add what stands in it (furniture). */
  onColumn: (cx: number, cz: number) => void = () => undefined;
  /** Called when a generated column leaves the streaming set. */
  onColumnUnload: (cx: number, cz: number) => void = () => undefined;
  /** Every added/unloaded data chunk, including all-air chunks that never get meshed. */
  onDataChange?: (origin: Vec3) => void;
  /** Handles a deterministic generation failure such as an unreadable restored chunk diff. */
  onGenerationError: ((error: unknown) => void) | undefined;

  constructor(opts: StreamerOptions) {
    this.opts = opts;
    this.occluders = opts.wireMeshes
      ? Uint8Array.from({ length: opts.colors.length / 3 }, (_, id) => Number(id !== 0 && !opts.wireMeshes?.[id]))
      : undefined;
    // Leave a physical core for the main thread: hardwareConcurrency counts hyperthreads.
    const count = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2) - 1));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('../worker/mesh.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<FromMesher>) => this.receive(worker, e.data);
      worker.onerror = (event) => {
        this.failure = event.message || 'World mesh worker failed';
      };
      worker.onmessageerror = () => {
        this.failure = 'World mesh worker reply could not be decoded';
      };
      this.send(worker, {
        type: 'init',
        colors: opts.colors,
        patterns: opts.patterns,
        weatherable: opts.weatherable,
        wireMeshes: opts.wireMeshes ?? [],
      });
      this.workers.push(worker);
    }
    this.maxInFlight = count * 2;

    // Nearest columns first.
    const r = opts.radius + 1;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        this.offsets.push([dx, dz]);
      }
    }
    this.offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
  }

  get pending(): number {
    return this.dirty.size;
  }

  /** True once the player's column and its neighbours exist, so physics has ground to stand on. */
  isReady(x: number, z: number): boolean {
    return this.neighboursGenerated(toChunk(Math.floor(x)), toChunk(Math.floor(z)));
  }

  setReplayControlled(): void {
    this.replayControlled = true;
  }

  /** Generated terrain columns at a replay recording boundary. */
  generatedColumns(): [number, number][] {
    return [...this.generated]
      .map((key) => key.split(',').map(Number) as [number, number])
      .sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
  }

  hasGeneratedColumn(cx: number, cz: number): boolean {
    return this.generated.has(`${cx},${cz}`);
  }

  /** Generates replay-required terrain without applying its load-time simulation effects. */
  generateForReplay(cx: number, cz: number): boolean {
    if (this.generated.has(`${cx},${cz}`)) {
      return true;
    }
    if (!(this.replayControlled && this.inRange(cx, cz))) {
      return false;
    }
    this.generate(cx, cz, false);
    this.dirtyReplayNeighbours(cx, cz);
    return this.generated.has(`${cx},${cz}`);
  }

  /** Removes replay-unloaded terrain without applying its unload-time simulation effects. */
  unloadForReplay(cx: number, cz: number): void {
    const col = `${cx},${cz}`;
    if (!(this.replayControlled && this.generated.delete(col))) {
      return;
    }
    const { world, scale } = this.opts;
    this.dirtyReplayNeighbours(cx, cz);
    for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
      const key = chunkKey(cx, cy, cz);
      if (!world.getChunk(cx, cy, cz)?.edited) {
        world.removeChunk(cx, cy, cz);
        this.onDataChange?.([cx * CHUNK, cy * CHUNK, cz * CHUNK]);
        this.dirty.delete(key);
        this.versions.delete(key);
      }
    }
  }

  /**
   * Columns within `within` chunks of (x, z) (square) that aren't fully meshed yet:
   * not generated, or with a chunk waiting for or being meshed. Zero means no holes.
   */
  unmeshedColumns(x: number, z: number, within: number): number {
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    const { minCy, maxCy } = this.opts.scale;
    let count = 0;
    for (let cz = pcz - within; cz <= pcz + within; cz++) {
      for (let cx = pcx - within; cx <= pcx + within; cx++) {
        let done = this.generated.has(`${cx},${cz}`);
        for (let cy = minCy; done && cy <= maxCy; cy++) {
          const key = chunkKey(cx, cy, cz);
          done = !(this.dirty.has(key) || this.inFlight.has(key));
        }
        count += done ? 0 : 1;
      }
    }
    return count;
  }

  unmeshedRecordedColumns(x: number, z: number, columns: readonly (readonly [number, number])[]): number {
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    return columns.filter(
      ([cx, cz]) =>
        Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) <= this.opts.radius &&
        this.unmeshedColumns(cx * CHUNK, cz * CHUNK, 0) > 0,
    ).length;
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
            this.dirty.add(key);
            this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  /** Call after editing blocks with the chunks World.setBlock returned. */
  markEdited(chunks: Vec3[]): void {
    for (const [cx, cy, cz] of chunks) {
      const key = chunkKey(cx, cy, cz);
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
      this.dirty.add(key);
      this.onDataChange?.([cx * CHUNK, cy * CHUNK, cz * CHUNK]);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
  update(x: number, z: number): void {
    if (this.generationFailed || this.failure) {
      return;
    }
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    const { radius } = this.opts;

    let budget = COLUMNS_PER_FRAME;
    for (const [dx, dz] of this.replayControlled ? [] : this.offsets) {
      if (this.generationFailed || budget === 0) {
        break;
      }
      if (this.generate(pcx + dx, pcz + dz)) {
        budget -= 1;
      }
    }

    if (this.generationFailed) {
      return;
    }
    for (const [dx, dz] of this.offsets) {
      if (this.occupied >= this.maxInFlight) {
        break;
      }
      if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) {
        continue;
      }
      const cx = pcx + dx;
      const cz = pcz + dz;
      if (!(this.replayControlled || this.neighboursGenerated(cx, cz))) {
        continue;
      }
      for (let cy = this.opts.scale.minCy; cy <= this.opts.scale.maxCy && this.occupied < this.maxInFlight; cy++) {
        const key = chunkKey(cx, cy, cz);
        if (this.dirty.has(key) && !this.inFlight.has(key)) {
          this.requestMesh(key, cx, cy, cz);
        }
      }
    }

    if (pcx !== this.center[0] || pcz !== this.center[1]) {
      this.center = [pcx, pcz];
      for (const key of [...this.opts.meshes.keys()]) {
        const [cx, , cz] = key.split(',').map(Number) as Vec3;
        if (!this.inRange(cx, cz)) {
          this.opts.meshes.remove(key);
          this.dirty.add(key); // remesh when we come back
        }
      }
      if (!this.replayControlled) {
        this.unloadFar();
      }
    }
  }

  /**
   * Drops chunk data far out of range. Unedited chunks regenerate from the seed when
   * the player returns; edited ones stay in memory (until saves exist, milestone 1.9).
   */
  private unloadFar(): void {
    const { world, scale, radius } = this.opts;
    for (const col of farColumns(this.generated, this.center, radius + 1 + UNLOAD_MARGIN)) {
      const [cx, cz] = col.split(',').map(Number) as [number, number];
      for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
        const key = chunkKey(cx, cy, cz);
        if (!world.getChunk(cx, cy, cz)?.edited) {
          world.removeChunk(cx, cy, cz);
          this.onDataChange?.([cx * CHUNK, cy * CHUNK, cz * CHUNK]);
          this.dirty.delete(key);
          this.versions.delete(key);
        }
      }
      this.generated.delete(col);
      this.onColumnUnload(cx, cz);
    }
  }

  private inRange(cx: number, cz: number): boolean {
    return Math.max(Math.abs(cx - this.center[0]), Math.abs(cz - this.center[1])) <= this.opts.radius + 1;
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

  /** Generates a column if it doesn't exist yet. Returns true if it did work. */
  private generate(cx: number, cz: number, notify = true): boolean {
    if (this.generationFailed) {
      return false;
    }
    const col = `${cx},${cz}`;
    if (this.generated.has(col)) {
      return false;
    }
    const { world, seed, terrain, shape, scale, structures, surface, stamp, stats } = this.opts;
    const start = performance.now();
    try {
      const column = generateColumn({ seed, blocks: terrain, shape, scale, surface, stamp }, cx, cz, structures);
      stats?.genMs.push(performance.now() - start);
      for (const chunk of column) {
        if (world.getChunk(chunk.cx, chunk.cy, chunk.cz)) {
          continue; // already edited; keep it
        }
        world.addChunk(chunk);
        this.onDataChange?.([chunk.cx * CHUNK, chunk.cy * CHUNK, chunk.cz * CHUNK]);
        if (!chunk.isEmpty()) {
          this.dirty.add(chunkKey(chunk.cx, chunk.cy, chunk.cz));
        }
      }
      this.generated.add(col);
      if (notify) {
        this.onColumn(cx, cz);
      }
      return true;
    } catch (error) {
      this.generationFailed = true;
      this.failure = (error instanceof Error ? error.message : String(error)) || 'World generation failed';
      if (!this.onGenerationError) {
        throw error;
      }
      this.onGenerationError(error);
      return true;
    }
  }

  private requestMesh(key: string, cx: number, cy: number, cz: number): void {
    this.dirty.delete(key);
    const { world, scale, meshes } = this.opts;
    if (isEnclosed(world, [cx, cy, cz], scale.minCy, this.occluders)) {
      meshes.remove(key); // nothing visible; skip the worker entirely
      return;
    }
    this.inFlight.add(key);
    const padded = extractPadded(world, [cx, cy, cz], scale.minCy);
    const wide = extractWide(world, [cx, cy, cz], scale.minCy, this.occluders);
    const worker = this.workers[this.nextWorker % this.workers.length]!;
    this.nextWorker += 1;
    this.send(worker, {
      type: 'mesh',
      key,
      version: this.versions.get(key) ?? 0,
      padded,
      wide,
    });
  }

  private receive(worker: Worker, msg: FromMesher): void {
    this.workerLoads.set(worker, (this.workerLoads.get(worker) ?? 1) - 1);
    if (msg.type === 'sky') {
      const callback = this.skyReply;
      this.skyReply = undefined;
      callback?.(msg.result, msg.workerRealMs);
      return;
    }
    this.receiveMesh(msg);
    this.dispatchSky();
  }

  private receiveMesh(msg: Extract<FromMesher, { type: 'mesh' }>): void {
    this.inFlight.delete(msg.key);
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
        this.dirty.add(msg.key);
      }
      return;
    }
    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);
    this.firstMeshDelivered ||= msg.mesh.indices.length > 0;
  }

  private send(worker: Worker, msg: ToMesher): void {
    if (msg.type !== 'init') {
      this.workerLoads.set(worker, (this.workerLoads.get(worker) ?? 0) + 1);
    }
    const transfer: ArrayBuffer[] = [];
    if (msg.type === 'mesh') {
      transfer.push(msg.padded.buffer as ArrayBuffer, msg.wide.buffer as ArrayBuffer);
    }
    if (msg.type === 'sky') {
      transfer.push(...msg.input.chunks.flatMap((chunk) => (chunk.raw ? [chunk.raw.buffer as ArrayBuffer] : [])));
    }
    worker.postMessage(msg, transfer);
  }
}
