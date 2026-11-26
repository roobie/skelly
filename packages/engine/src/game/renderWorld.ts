import { Chunk } from '../core/chunk.ts';
import { chunkKey, toChunk, toLocal, type Vec3 } from '../core/coords.ts';
import { affectedChunks, World } from '../core/world.ts';

/** Resident blocks for drawing; the simulation owns a separate canonical store. */
export class RenderWorld extends World {
  readonly renderOnly = true;
  private readonly masked = new Map<string, Map<string, Readonly<Vec3>>>();
  private readonly meshCopies = new Map<string, { source: Chunk; revision: number; mesh: Chunk }>();

  mask(cell: Readonly<Vec3>): Vec3[] {
    const key = chunkKey(...(cell.map(toChunk) as Vec3));
    let cells = this.masked.get(key);
    if (!cells) {
      cells = new Map();
      this.masked.set(key, cells);
    }
    if (cells.has(cell.join(','))) {
      return [];
    }
    cells.set(cell.join(','), [...cell]);
    this.meshCopies.delete(key);
    return affectedChunks(...cell);
  }

  unmask(cell: Readonly<Vec3>): Vec3[] {
    const key = chunkKey(...(cell.map(toChunk) as Vec3));
    const cells = this.masked.get(key);
    if (!cells?.delete(cell.join(','))) {
      return [];
    }
    if (cells.size === 0) {
      this.masked.delete(key);
    }
    this.meshCopies.delete(key);
    return affectedChunks(...cell);
  }

  override meshChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    const source = this.getChunk(cx, cy, cz);
    const key = chunkKey(cx, cy, cz);
    const cells = this.masked.get(key);
    if (!(source && cells)) {
      return source;
    }
    const cached = this.meshCopies.get(key);
    if (cached?.source === source && cached.revision === source.revision) {
      return cached.mesh;
    }
    // Mask only the mesher's input: edits and column replacement keep their canonical values.
    const mesh = Chunk.fromArray(cx, cy, cz, source.toArray());
    for (const cell of cells.values()) {
      mesh.set(toLocal(cell[0]), toLocal(cell[1]), toLocal(cell[2]), 0);
    }
    this.meshCopies.set(key, { source, revision: source.revision, mesh });
    return mesh;
  }
}
