// Keeps the world around the player generated and meshed.
// Terrain is generated one column at a time on the main thread; meshes are built in
// workers. A chunk is only meshed once all eight neighbouring columns exist, so faces
// and AO at chunk borders are correct and never need a second pass.

import { CHUNK, chunkKey, MAX_CY, MIN_CY, toChunk, type Vec3 } from '../core/coords.ts';
import type { World } from '../core/world.ts';
import { extractPadded } from '../core/world.ts';
import { generateColumn, type TerrainBlocks } from '../core/worldgen.ts';
import type { ChunkMeshes } from '../render/chunks.ts';
import type { FromMesher, ToMesher } from '../worker/protocol.ts';

const COLUMNS_PER_FRAME = 2;

export interface StreamerOptions {
  world: World;
  meshes: ChunkMeshes;
  seed: number;
  terrain: TerrainBlocks;
  colors: Uint8Array;
  /** Mesh radius in chunks (square). Terrain is generated one column further out. */
  radius: number;
}

export class Streamer {
  private readonly opts: StreamerOptions;
  private readonly generated = new Set<string>(); // column keys "cx,cz"
  private readonly dirty = new Set<string>(); // chunks needing a (re)mesh
  private readonly versions = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly workers: Worker[] = [];
  private readonly maxInFlight: number;
  private readonly offsets: [number, number][] = [];
  private nextWorker = 0;
  private center: [number, number] = [Number.NaN, Number.NaN];

  constructor(opts: StreamerOptions) {
    this.opts = opts;
    const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('../worker/mesh.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<FromMesher>) => this.receive(e.data);
      this.send(worker, { type: 'init', colors: opts.colors });
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
    const pcx = toChunk(Math.floor(x));
    const pcz = toChunk(Math.floor(z));
    const { radius } = this.opts;

    let budget = COLUMNS_PER_FRAME;
    for (const [dx, dz] of this.offsets) {
      if (budget === 0) {
        break;
      }
      if (this.generate(pcx + dx, pcz + dz)) {
        budget -= 1;
      }
    }

    for (const [dx, dz] of this.offsets) {
      if (this.inFlight.size >= this.maxInFlight) {
        break;
      }
      if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) {
        continue;
      }
      const cx = pcx + dx;
      const cz = pcz + dz;
      if (!this.neighboursGenerated(cx, cz)) {
        continue;
      }
      for (let cy = MIN_CY; cy <= MAX_CY && this.inFlight.size < this.maxInFlight; cy++) {
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
          this.dirty.add(key); // chunk data stays; remesh when we come back
        }
      }
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
  private generate(cx: number, cz: number): boolean {
    const col = `${cx},${cz}`;
    if (this.generated.has(col)) {
      return false;
    }
    const { world, seed, terrain } = this.opts;
    for (const chunk of generateColumn(seed, terrain, cx, cz)) {
      if (world.getChunk(chunk.cx, chunk.cy, chunk.cz)) {
        continue; // already edited; keep it
      }
      world.addChunk(chunk);
      if (!chunk.isEmpty()) {
        this.dirty.add(chunkKey(chunk.cx, chunk.cy, chunk.cz));
      }
    }
    this.generated.add(col);
    return true;
  }

  private requestMesh(key: string, cx: number, cy: number, cz: number): void {
    this.dirty.delete(key);
    this.inFlight.add(key);
    const padded = extractPadded(this.opts.world, cx, cy, cz);
    const worker = this.workers[this.nextWorker % this.workers.length]!;
    this.nextWorker += 1;
    this.send(worker, {
      type: 'mesh',
      key,
      version: this.versions.get(key) ?? 0,
      origin: [cx * CHUNK, cy * CHUNK, cz * CHUNK],
      padded,
    });
  }

  private receive(msg: FromMesher): void {
    this.inFlight.delete(msg.key);
    if ((this.versions.get(msg.key) ?? 0) !== msg.version) {
      return; // edited meanwhile; already dirty again
    }
    const [cx, cy, cz] = msg.key.split(',').map(Number) as Vec3;
    if (!this.inRange(cx, cz)) {
      this.dirty.add(msg.key);
      return;
    }
    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);
  }

  private send(worker: Worker, msg: ToMesher): void {
    worker.postMessage(msg, msg.type === 'mesh' ? [msg.padded.buffer] : []);
  }
}
