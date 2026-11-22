import type { Chunk } from './chunk.ts';
import { CHUNK, toChunk, toLocal } from './coords.ts';
import type { TerrainEvaluator } from './terrainEvaluator.ts';
import type { TerrainRead } from './terrainRead.ts';
import type { World } from './world.ts';

/** Shared installation preserves resident edits, including chunks served before the rest of their column. */
export const installColumn = (world: World, column: readonly Chunk[]): Chunk[] => {
  const added = column.filter(({ cx, cy, cz }) => !world.getChunk(cx, cy, cz));
  for (const chunk of added) {
    world.addChunk(chunk);
  }
  return added;
};

type CanonicalWorld = World & Pick<TerrainRead, 'renderOnly'>;

/** Natural-ground chunks kept for support queries; a support search reaches only a few chunks around its cell. */
const NATURAL_CACHE_CHUNKS = 64;

/** A transaction-local view; scratch generation neither publishes terrain nor rolls authored supply. */
export class CanonicalTerrain {
  private readonly scratch = new Map<string, Chunk[]>();
  private readonly natural = new Map<string, Chunk>();

  readonly world: CanonicalWorld;
  readonly terrain: TerrainEvaluator;

  constructor(world: CanonicalWorld, terrain: TerrainEvaluator) {
    this.world = world;
    this.terrain = terrain;
  }

  private column(cx: number, cz: number): Chunk[] {
    const key = `${cx},${cz}`;
    let column = this.scratch.get(key);
    if (!column) {
      column = this.terrain.generateColumn(cx, cz);
      this.scratch.set(key, column);
    }
    return column;
  }

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    if (cy < this.terrain.scale.minCy || cy > this.terrain.scale.maxCy) {
      return undefined;
    }
    const resident = this.world.getChunk(cx, cy, cz);
    if (resident) {
      return resident;
    }
    if (this.world.isTouched(cx, cz)) {
      throw new Error(`Incomplete touched column ${cx},${cz}`);
    }
    return this.column(cx, cz)[cy - this.terrain.scale.minCy]!;
  }

  cacheColumn(column: readonly Chunk[]): void {
    const { cx, cz } = column[0]!;
    const key = `${cx},${cz}`;
    // Never replace a queried scratch chunk: snapshot/cache identity must not depend on delivery timing.
    if (!(this.scratch.has(key) || this.world.isTouched(cx, cz))) {
      this.scratch.set(key, [...column]);
    }
  }

  forgetColumn(cx: number, cz: number): void {
    this.scratch.delete(`${cx},${cz}`);
  }

  getBlock(x: number, y: number, z: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y), toChunk(z));
    if (!chunk) {
      throw new Error(`Terrain query outside world height: ${x},${y},${z}`);
    }
    return chunk.get(toLocal(x), toLocal(y), toLocal(z));
  }

  /**
   * The natural ground's block at a cell, before any structure is stamped in: a pure function of the plan, so the
   * cache only saves regeneration and never changes an answer.
   */
  naturalBlock(x: number, y: number, z: number): number {
    const cell: [number, number, number] = [toChunk(x), toChunk(y), toChunk(z)];
    const key = cell.join(',');
    let chunk = this.natural.get(key);
    if (!chunk) {
      if (this.natural.size >= NATURAL_CACHE_CHUNKS) {
        this.natural.delete(this.natural.keys().next().value!);
      }
      chunk = this.terrain.generateBaseChunk(cell);
      this.natural.set(key, chunk);
    }
    return chunk.get(toLocal(x), toLocal(y), toLocal(z));
  }

  /** Every gameplay terrain/overlay write first installs and pins its complete canonical column. */
  ensureColumn(cx: number, cz: number): void {
    const { minCy, maxCy } = this.terrain.scale;
    const complete = Array.from({ length: maxCy - minCy + 1 }, (_, at) => this.world.getChunk(cx, minCy + at, cz));
    if (complete.some((chunk) => !chunk)) {
      if (this.world.isTouched(cx, cz)) {
        throw new Error(`Incomplete touched column ${cx},${cz}`);
      }
      installColumn(this.world, this.column(cx, cz));
    }
    this.world.touchColumn(cx, cz);
  }

  ensureCell(x: number, y: number, z: number): void {
    if (y < this.terrain.scale.minCy * CHUNK || y >= (this.terrain.scale.maxCy + 1) * CHUNK) {
      throw new Error(`Terrain write outside world height: ${x},${y},${z}`);
    }
    this.ensureColumn(toChunk(x), toChunk(z));
  }
}
