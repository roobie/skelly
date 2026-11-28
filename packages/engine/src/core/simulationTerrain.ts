import { CanonicalTerrain } from './canonicalTerrain.ts';
import type { Chunk } from './chunk.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import type { TerrainEvaluator } from './terrainEvaluator.ts';
import { type BlockRead, type ChunkRead, NOT_LOADED, type TerrainRead } from './terrainRead.ts';
import { type SavedColumn, World } from './world.ts';

export interface SimulationWorld
  extends TerrainRead,
    Pick<
      World,
      | 'blockDamage'
      | 'fire'
      | 'smoke'
      | 'rubble'
      | 'support'
      | 'falls'
      | 'setBlock'
      | 'snapshotColumns'
      | 'restoreColumns'
    > {}

/** Owns terrain facts and publication; neither reads nor waits for render residency. */
export class SimulationTerrain implements SimulationWorld {
  private readonly state = new World();
  readonly canonical: CanonicalTerrain;
  private readonly published = new Set<string>();
  private publicationVersion = 0;
  private readonly watchers = new Set<(cx: number, cy: number, cz: number, cell?: Readonly<Vec3>) => void>();

  constructor(terrain: TerrainEvaluator) {
    this.canonical = new CanonicalTerrain(this.state, terrain);
    this.state.watchChunks((cx, cy, cz, cell) => this.notify(cx, cy, cz, cell));
  }

  get version(): number {
    return this.state.version + this.publicationVersion;
  }

  get fire(): World['fire'] {
    return this.state.fire;
  }
  get smoke(): World['smoke'] {
    return this.state.smoke;
  }
  get blockDamage(): World['blockDamage'] {
    return this.state.blockDamage;
  }
  get rubble(): World['rubble'] {
    return this.state.rubble;
  }
  get support(): World['support'] {
    return this.state.support;
  }
  get falls(): World['falls'] {
    return this.state.falls;
  }

  arrive(cx: number, cz: number): void {
    if (!this.published.has(`${cx},${cz}`)) {
      this.published.add(`${cx},${cz}`);
      this.publicationChanged(cx, cz);
    }
  }

  cacheColumn(column: readonly Chunk[]): void {
    const { cx, cz } = column[0]!;
    if (this.published.has(`${cx},${cz}`)) {
      this.canonical.cacheColumn(column);
    }
  }

  unload(cx: number, cz: number): void {
    if (this.published.delete(`${cx},${cz}`)) {
      this.canonical.forgetColumn(cx, cz);
      this.publicationChanged(cx, cz);
    }
  }

  ready(x: number, z: number): boolean {
    const cx = toChunk(Math.floor(x));
    const cz = toChunk(Math.floor(z));
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.published.has(`${cx + dx},${cz + dz}`)) {
          return false;
        }
      }
    }
    return true;
  }

  getBlock(x: number, y: number, z: number): BlockRead {
    if (!this.published.has(`${toChunk(Math.floor(x))},${toChunk(Math.floor(z))}`)) {
      return NOT_LOADED;
    }
    const { minCy, maxCy } = this.canonical.terrain.scale;
    return y < minCy * CHUNK || y >= (maxCy + 1) * CHUNK ? 0 : this.canonical.getBlock(x, y, z);
  }

  getChunk(cx: number, cy: number, cz: number): ChunkRead {
    return this.published.has(`${cx},${cz}`) ? this.canonical.getChunk(cx, cy, cz) : NOT_LOADED;
  }

  setBlock(x: number, y: number, z: number, id: number): ReturnType<World['setBlock']> {
    this.canonical.ensureCell(x, y, z);
    return this.state.setBlock(x, y, z, id);
  }

  snapshotColumns(contentId: (id: number) => string): readonly Readonly<SavedColumn>[] {
    return this.state.snapshotColumns(contentId);
  }

  restoreColumns(columns: readonly Readonly<SavedColumn>[], blockId: (id: string) => number): void {
    this.state.restoreColumns(columns, blockId);
  }

  watchChunks(changed: (cx: number, cy: number, cz: number, cell?: Readonly<Vec3>) => void): () => void {
    this.watchers.add(changed);
    return () => this.watchers.delete(changed);
  }

  private publicationChanged(cx: number, cz: number): void {
    this.publicationVersion += 1;
    const { minCy, maxCy } = this.canonical.terrain.scale;
    for (let cy = minCy; cy <= maxCy; cy++) {
      this.notify(cx, cy, cz);
    }
  }

  private notify(cx: number, cy: number, cz: number, cell?: Readonly<Vec3>): void {
    for (const changed of this.watchers) {
      changed(cx, cy, cz, cell);
    }
  }
}
