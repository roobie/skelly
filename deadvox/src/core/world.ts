import { Chunk } from './chunk.ts';
import { CHUNK, type Vec3, chunkKey, localIndex, toChunk, toLocal } from './coords.ts';

/** Sparse block storage. Missing chunks read as air. */
export class World {
  readonly chunks = new Map<string, Chunk>();

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  addChunk(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cy, chunk.cz), chunk);
  }

  getBlock(x: number, y: number, z: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y), toChunk(z));
    return chunk ? chunk.get(toLocal(x), toLocal(y), toLocal(z)) : 0;
  }

  /** Sets a block, creating its chunk if needed. Returns the chunks whose meshes are now stale. */
  setBlock(x: number, y: number, z: number, id: number): Vec3[] {
    const cx = toChunk(x);
    const cy = toChunk(y);
    const cz = toChunk(z);
    let chunk = this.getChunk(cx, cy, cz);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      this.addChunk(chunk);
    }
    chunk.set(toLocal(x), toLocal(y), toLocal(z), id);
    return affectedChunks(x, y, z);
  }
}

/** The chunk holding a block plus any neighbour chunk that shares a face with it. */
export const affectedChunks = (x: number, y: number, z: number): Vec3[] => {
  const c: Vec3 = [toChunk(x), toChunk(y), toChunk(z)];
  const out: Vec3[] = [c];
  const local = [toLocal(x), toLocal(y), toLocal(z)];
  for (let axis = 0; axis < 3; axis++) {
    const l = local[axis]!;
    const step = l === 0 ? -1 : l === CHUNK - 1 ? 1 : 0;
    if (step !== 0) {
      const n: Vec3 = [...c];
      n[axis] = n[axis]! + step;
      out.push(n);
    }
  }
  return out;
};

/** Side of the padded block array handed to the mesher: the chunk plus a 1-block border. */
export const PADDED = CHUNK + 2;

export const paddedIndex = (x: number, y: number, z: number): number => x + PADDED * (z + PADDED * y);

/**
 * Copies a chunk and a 1-block border from its neighbours into one array, so the
 * mesher can cull faces at chunk edges without seeing the world.
 */
export const extractPadded = (world: World, cx: number, cy: number, cz: number): Uint16Array => {
  const out = new Uint16Array(PADDED * PADDED * PADDED);
  const around: (Chunk | undefined)[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) around.push(world.getChunk(cx + dx, cy + dy, cz + dz));

  const split = (p: number): [number, number] => {
    const w = p - 1; // padded -> chunk-local, may be -1 or CHUNK
    return w < 0 ? [0, w + CHUNK] : w >= CHUNK ? [2, w - CHUNK] : [1, w];
  };
  for (let y = 0; y < PADDED; y++) {
    const [oy, ly] = split(y);
    for (let z = 0; z < PADDED; z++) {
      const [oz, lz] = split(z);
      for (let x = 0; x < PADDED; x++) {
        const [ox, lx] = split(x);
        const chunk = around[ox + 3 * (oz + 3 * oy)];
        if (chunk) out[paddedIndex(x, y, z)] = chunk.blocks[localIndex(lx, ly, lz)]!;
      }
    }
  }
  return out;
};
