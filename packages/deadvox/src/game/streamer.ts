// Keeps the world around the player generated and meshed.
// Terrain is generated one column at a time on the main thread; meshes are built in
// workers. A chunk is only meshed once all eight neighbouring columns exist, so faces
// and AO at chunk borders (including the wide occlusion, which reaches half a chunk) are correct
// and never need a second pass.

import type { Chunk } from '../core/chunk.ts';
import { CHUNK, chunkKey, toChunk, type Vec3 } from '../core/coords.ts';
import type { FencePostDefs } from '../core/fencePosts.ts';
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
import { revealedColumns } from '../render/columnReveal.ts';
import type { FromMesher, ToMesher } from '../worker/protocol.ts';

const COLUMNS_PER_FRAME = 2;

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
  /** Liquid flag per block id (`blockLiquids`). */
  liquids?: Uint8Array;
  fencePosts?: FencePostDefs;
  scale: Scale;
  /** Stamped into every column as it generates. */
  structures: readonly BlockBox[];
  /** Changes to the ground (flattened lots, roads). */
  surface?: Surface | undefined;
  /** Writes buildings into each chunk as it generates. */
  stamp?: ((chunk: Chunk) => void) | undefined;
  /** Mesh radius in chunks (a disc). Terrain is generated for every neighbour of a meshed column. */
  radius: number;
  /** Chunks beyond the rings that meshes and chunk data stay, so a column on the edge does not churn. */
  hysteresis: number;
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
  private readonly occluders: Uint8Array;
  private readonly generated = new Set<string>(); // column keys "cx,cz"
  // An edit replaces an existing mesh; it must not close a column that already has its occluders drawn.
  private readonly completeColumns = new Set<string>();
  private readonly dirty = new Set<string>(); // chunks needing a (re)mesh
  private readonly versions = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly workers: Worker[] = [];
  private readonly maxInFlight: number;
  private generationFailed = false;
  failure: string | undefined;

  get loadingWorkUnits(): number {
    return this.offsets.length + this.meshOffsets.length * (this.opts.scale.maxCy - this.opts.scale.minCy + 1);
  }
  private replayControlled = false;
  /** The generated ring, nearest first. */
  private readonly offsets: [number, number][];
  private readonly offsetKeys: Set<string>;
  /** The meshed disc, nearest first. */
  private readonly meshOffsets: [number, number][];
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
  private firstMeshDelivered = false;
  private readonly workerLoads = new Map<Worker, number>();
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
  /** Called after a column is generated, to add what stands in it (furniture). */
  onColumn: (cx: number, cz: number) => void = () => undefined;
  /** Called when a generated column leaves the streaming set. */
  onColumnUnload: (cx: number, cz: number) => void = () => undefined;
  /** Handles a deterministic generation failure, so a restored save is refused instead of overwritten. */
  onGenerationError: ((error: unknown) => void) | undefined;

  constructor(opts: StreamerOptions) {
    this.opts = opts;
    opts.meshes.setRevealedColumns(new Set());
    this.occluders = Uint8Array.from({ length: opts.colors.length / 3 }, (_, id) =>
      Number(id !== 0 && !opts.wireMeshes?.[id] && !opts.liquids?.[id]),
    );
    // Leave a physical core for the main thread: hardwareConcurrency counts hyperthreads.
    const count = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2) - 1));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('../worker/mesh.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<FromMesher>) => this.receive(worker, e.data);
      worker.onerror = (event) => {
        this.failure ??= event.message || 'World mesh worker failed';
      };
      worker.onmessageerror = () => {
        this.failure ??= 'World mesh worker reply could not be decoded';
      };
      this.send(worker, {
        type: 'init',
        colors: opts.colors,
        patterns: opts.patterns,
        weatherable: opts.weatherable,
        wireMeshes: opts.wireMeshes ?? [],
        liquids: opts.liquids ?? new Uint8Array(0),
        fencePosts: opts.fencePosts ?? [],
      });
      this.workers.push(worker);
    }
    this.maxInFlight = count * 2;

    this.meshOffsets = discOffsets(opts.radius);
    this.offsets = grownOffsets(this.meshOffsets);
    this.offsetKeys = new Set(this.offsets.map(([dx, dz]) => `${dx},${dz}`));
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
    if (!(this.replayControlled && this.offsetKeys.has(`${cx - this.center[0]},${cz - this.center[1]}`))) {
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
    const { world, scale, meshes } = this.opts;
    this.completeColumns.delete(col);
    this.dirtyReplayNeighbours(cx, cz);
    const pinned = world.isTouched(cx, cz);
    for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
      const key = chunkKey(cx, cy, cz);
      meshes.remove(key);
      if (!pinned) {
        world.removeChunk(cx, cy, cz);
        this.dirty.delete(key);
        this.versions.delete(key);
      }
    }
    this.refreshReveal();
  }

  /**
   * Columns within `within` chunks of (x, z)'s column that aren't fully meshed yet:
   * not generated, or with a chunk waiting for or being meshed. Zero means no holes.
   */
  unmeshedColumns(x: number, z: number, within: number): number {
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    let disc = this.discs.get(within);
    if (!disc) {
      disc = discOffsets(within);
      this.discs.set(within, disc);
    }
    return disc.filter(([dx, dz]) => !this.columnMeshed(pcx + dx, pcz + dz)).length;
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
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));

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
    this.onTerrainReady?.(x, z);
    this.dispatchSky();
    for (const [dx, dz] of this.meshOffsets) {
      if (this.occupied >= this.maxInFlight) {
        break;
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
          this.completeColumns.delete(`${cx},${cz}`);
          this.dirty.add(key); // remesh when we come back
        }
      }
      if (!this.replayControlled) {
        this.unloadFar();
      }
    }
    this.refreshReveal();
  }

  private refreshReveal(): void {
    for (const [dx, dz] of this.offsets) {
      const cx = this.center[0] + dx;
      const cz = this.center[1] + dz;
      const key = `${cx},${cz}`;
      if (!this.completeColumns.has(key) && this.columnMeshed(cx, cz)) {
        this.completeColumns.add(key);
      }
    }
    const columns = revealedColumns(this.center, this.offsets, (cx, cz) => this.completeColumns.has(`${cx},${cz}`));
    for (const key of columns) {
      if (!this.revealed.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        this.onBeforeReveal?.(cx!, cz!);
      }
    }
    this.revealed = columns;
    this.opts.meshes.setRevealedColumns(columns);
  }

  /**
   * Drops chunk data far out of range. Untouched columns regenerate from the seed when
   * the player returns; touched ones stay in memory for the session (`DESIGN.md`, "Edits persist").
   */
  private unloadFar(): void {
    const { world, scale, radius, hysteresis } = this.opts;
    // The generated ring reaches less than a diagonal step past the mesh disc.
    for (const col of farColumns(this.generated, this.center, radius + Math.SQRT2 + hysteresis)) {
      const [cx, cz] = col.split(',').map(Number) as [number, number];
      const pinned = world.isTouched(cx, cz);
      for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
        const key = chunkKey(cx, cy, cz);
        if (!pinned) {
          world.removeChunk(cx, cy, cz);
          this.dirty.delete(key);
          this.versions.delete(key);
        }
      }
      this.generated.delete(col);
      this.completeColumns.delete(col);
      this.onColumnUnload(cx, cz);
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
  private generate(cx: number, cz: number, notify = true): boolean {
    if (this.generationFailed) {
      return false;
    }
    const col = `${cx},${cz}`;
    if (this.generated.has(col)) {
      return false;
    }
    const start = performance.now();
    try {
      const arrived = this.residentTouchedColumn(cx, cz) ?? this.addGenerated(cx, cz);
      this.opts.stats?.genMs.push(performance.now() - start);
      for (const chunk of arrived) {
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

  /** Generates a column and adds the chunks the world doesn't hold yet; returns those. */
  private addGenerated(cx: number, cz: number): Chunk[] {
    const { world, seed, terrain, shape, scale, structures, surface, stamp } = this.opts;
    const column = generateColumn({ seed, blocks: terrain, shape, scale, surface, stamp }, cx, cz, structures);
    // A chunk edited before its column generated is kept.
    const added = column.filter((chunk) => !world.getChunk(chunk.cx, chunk.cy, chunk.cz));
    for (const chunk of added) {
      world.addChunk(chunk);
    }
    return added;
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
        return undefined;
      }
      chunks.push(chunk);
    }
    return chunks;
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
      const callback = this.skyReplies.get(msg.id);
      this.skyReplies.delete(msg.id);
      callback?.(msg.result, msg.workerRealMs);
      this.dispatchSky();
      return;
    }
    if (msg.type === 'vehicle') {
      return; // vehicle shapes go to the render's own worker, never to this one
    }
    if (msg.type === 'meshFailed') {
      this.inFlight.delete(msg.key);
      this.dirty.add(msg.key);
      this.failure ??= `World mesh worker failed on chunk ${msg.key}: ${msg.message}`;
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
    this.refreshReveal();
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
