import type { Chunk } from './chunk.ts';
import { CHUNK, toChunk, toLocal } from './coords.ts';
import type { BlockBox } from './structure.ts';
import type { World } from './world.ts';
import { generateColumn, type Terrain } from './worldgen.ts';

/** Shared installation preserves resident edits, including chunks served before the rest of their column. */
export const installColumn = (world: World, column: readonly Chunk[]): Chunk[] => {
  const added = column.filter(({ cx, cy, cz }) => !world.getChunk(cx, cy, cz));
  for (const chunk of added) {
    world.addChunk(chunk);
  }
  return added;
};

/** A transaction-local view; scratch generation neither publishes terrain nor rolls authored supply. */
export class CanonicalTerrain {
  private readonly scratch = new Map<string, Chunk[]>();

  readonly world: World;
  readonly terrain: Terrain;
  readonly structures: readonly BlockBox[];

  constructor(world: World, terrain: Terrain, structures: readonly BlockBox[] = []) {
    this.world = world;
    this.terrain = terrain;
    this.structures = structures;
  }

  private column(cx: number, cz: number): Chunk[] {
    const key = `${cx},${cz}`;
    let column = this.scratch.get(key);
    if (!column) {
      column = generateColumn(this.terrain, cx, cz, this.structures);
      this.scratch.set(key, column);
    }
    return column;
  }

  getBlock(x: number, y: number, z: number): number {
    const cx = toChunk(x);
    const cy = toChunk(y);
    const cz = toChunk(z);
    if (cy < this.terrain.scale.minCy || cy > this.terrain.scale.maxCy) {
      throw new Error(`Terrain query outside world height: ${x},${y},${z}`);
    }
    let chunk = this.world.getChunk(cx, cy, cz);
    if (!chunk) {
      if (this.world.isTouched(cx, cz)) {
        throw new Error(`Incomplete touched column ${cx},${cz}`);
      }
      chunk = this.column(cx, cz)[cy - this.terrain.scale.minCy]!;
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
