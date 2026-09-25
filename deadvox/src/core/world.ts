import { Chunk } from './chunk.ts';
import { CHUNK, chunkKey, localIndex, toChunk, toLocal, type Vec3 } from './coords.ts';

/** Sparse block storage. Missing chunks read as air. */
export class World {
  readonly chunks = new Map<string, Chunk>();

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  addChunk(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cy, chunk.cz), chunk);
  }

  removeChunk(cx: number, cy: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cy, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    const chunk = this.getChunk(toChunk(x), toChunk(y), toChunk(z));
    return chunk ? chunk.get(toLocal(x), toLocal(y), toLocal(z)) : 0;
  }

  /** Sets a block during play, creating its chunk if needed. Returns the chunks whose meshes are now stale. */
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
    chunk.edited = true;
    return affectedChunks(x, y, z);
  }
}

/** -1 or 1 if a chunk-local coordinate is on the low or high face of its chunk, else 0. */
const borderStep = (local: number): number => {
  if (local === 0) {
    return -1;
  }
  return local === CHUNK - 1 ? 1 : 0;
};

/** The chunk holding a block plus any neighbour chunk that shares a face with it. */
export const affectedChunks = (x: number, y: number, z: number): Vec3[] => {
  const c: Vec3 = [toChunk(x), toChunk(y), toChunk(z)];
  const out: Vec3[] = [c];
  const local = [toLocal(x), toLocal(y), toLocal(z)];
  for (let axis = 0; axis < 3; axis++) {
    const l = local[axis]!;
    const step = borderStep(l);
    if (step !== 0) {
      const n: Vec3 = [...c];
      n[axis] = n[axis]! + step;
      out.push(n);
    }
  }
  return out;
};

const FACE_NEIGHBOURS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * True if a chunk can't have visible faces: every block in it is solid, and so is
 * every block of its six neighbours (layers below `bottomCy` count as solid). Deep
 * underground chunks are like this, and meshing them would produce nothing.
 */
export const isEnclosed = (world: World, [cx, cy, cz]: Vec3, bottomCy = Number.NEGATIVE_INFINITY): boolean => {
  const solidThrough = (x: number, y: number, z: number) => {
    if (y < bottomCy) {
      return true;
    }
    const id = world.getChunk(x, y, z)?.uniformId;
    return id !== undefined && id !== 0;
  };
  return solidThrough(cx, cy, cz) && FACE_NEIGHBOURS.every(([dx, dy, dz]) => solidThrough(cx + dx, cy + dy, cz + dz));
};

/** Side of the padded block array handed to the mesher: the chunk plus a 1-block border. */
export const PADDED = CHUNK + 2;

export const paddedIndex = (x: number, y: number, z: number): number => x + PADDED * (z + PADDED * y);

/** Stands in for everything below the world's bottom layer: solid, and never drawn. */
export const BEDROCK = 0xff_ff;

/** The 27 chunks around (and including) a chunk, x fastest, then z, then y. */
const neighbourhood = (world: World, [cx, cy, cz]: Vec3): (Chunk | undefined)[] => {
  const around: (Chunk | undefined)[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        around.push(world.getChunk(cx + dx, cy + dy, cz + dz));
      }
    }
  }
  return around;
};

/** A padded coordinate as [neighbour offset 0..2, chunk-local coordinate]. */
const split = (p: number): [number, number] => {
  const w = p - 1; // padded -> chunk-local, may be -1 or CHUNK
  if (w < 0) {
    return [0, w + CHUNK];
  }
  return w >= CHUNK ? [2, w - CHUNK] : [1, w];
};

/**
 * Copies a chunk and a 1-block border from its neighbours into one array, so the
 * mesher can cull faces at chunk edges without seeing the world. Missing chunks
 * read as air, except below `bottomCy` (the world's lowest layer), which reads as
 * BEDROCK so the underside of the world is never meshed.
 */
export const extractPadded = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Uint16Array => {
  const out = new Uint16Array(PADDED * PADDED * PADDED);
  const around = neighbourhood(world, coords);
  for (let y = 0; y < PADDED; y++) {
    const [oy, ly] = split(y);
    for (let z = 0; z < PADDED; z++) {
      const [oz, lz] = split(z);
      for (let x = 0; x < PADDED; x++) {
        const [ox, lx] = split(x);
        const chunk = around[ox + 3 * (oz + 3 * oy)];
        if (chunk) {
          out[paddedIndex(x, y, z)] = chunk.at(localIndex(lx, ly, lz));
        }
      }
    }
  }
  if (coords[1] - 1 < bottomCy) {
    out.fill(BEDROCK, 0, PADDED * PADDED); // padded layer y = 0
  }
  return out;
};
