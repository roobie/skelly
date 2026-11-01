import { BlockDamage } from './blockDamage.ts';
import { Chunk } from './chunk.ts';
import { CHUNK, CHUNK_VOLUME, chunkKey, toChunk, toLocal, type Vec3 } from './coords.ts';
import { freezeSnapshot } from './snapshotData.ts';

/**
 * Blocks beyond a chunk's faces that its mesh reads (the wide ambient occlusion's reach). Equal to
 * OCCLUSION_RADIUS in core/occlusion.ts, which a test checks; it is repeated here so the simulation
 * graph does not import that presentation module.
 */
export const MESH_REACH = 8;

/** Every cell of one chunk as maximal runs over the cell index, naming blocks by content id. */
export interface SavedChunk {
  cy: number;
  /** Sorted, unique, every entry used. */
  palette: string[];
  runs: { start: number; length: number; id: number }[];
}

export interface SavedColumn {
  cx: number;
  cz: number;
  /** Sorted by cy. */
  chunks: SavedChunk[];
}

const columnKey = (cx: number, cz: number): string => `${cx},${cz}`;

const encodeChunk = (chunk: Chunk, contentId: (blockId: number) => string): SavedChunk => {
  const runs: { start: number; length: number; block: number }[] = [];
  const uniform = chunk.uniformId;
  if (uniform === undefined) {
    const data = chunk.raw()!;
    for (let index = 0; index < data.length; index++) {
      const previous = runs.at(-1);
      if (previous && previous.block === data[index]) {
        previous.length += 1;
      } else {
        runs.push({ start: index, length: 1, block: data[index]! });
      }
    }
  } else {
    runs.push({ start: 0, length: CHUNK_VOLUME, block: uniform });
  }
  const names = new Map([...new Set(runs.map(({ block }) => block))].map((block) => [block, contentId(block)]));
  const palette = [...new Set(names.values())].sort();
  const paletteIndex = new Map(palette.map((id, index) => [id, index]));
  return {
    cy: chunk.cy,
    palette,
    runs: runs.map(({ start, length, block }) => ({ start, length, id: paletteIndex.get(names.get(block)!)! })),
  };
};

const decodeChunk = (cx: number, cz: number, saved: SavedChunk, blockId: (contentId: string) => number): Chunk => {
  const ids = saved.palette.map((name) => {
    const id = blockId(name);
    if (!(Number.isSafeInteger(id) && id >= 0 && id <= 0xff_ff)) {
      throw new Error(`Unknown block content id ${name} in saved chunk ${cx},${saved.cy},${cz}`);
    }
    return id;
  });
  if (saved.runs.length === 1) {
    return new Chunk(cx, saved.cy, cz, ids[saved.runs[0]!.id]);
  }
  const data = new Uint16Array(CHUNK_VOLUME);
  for (const run of saved.runs) {
    data.fill(ids[run.id]!, run.start, run.start + run.length);
  }
  return Chunk.fromArray(cx, saved.cy, cz, data);
};

/** Sparse block storage. Missing chunks read as air. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  readonly blockDamage = new BlockDamage(this);
  private readonly columnChunks = new Map<string, number>();
  /** Changes whenever blocks visible to simulation queries change. */
  version = 0;
  /** Columns with any cell changed by play, ever; they are saved whole and never regenerate. */
  private readonly touched = new Set<string>();
  /** Saved form of touched columns unchanged since it was built, so a save re-encodes only changed columns. */
  private readonly encoded = new Map<string, Readonly<SavedColumn>>();

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  addChunk(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    const column = columnKey(chunk.cx, chunk.cz);
    if (!this.chunks.has(key)) {
      this.columnChunks.set(column, (this.columnChunks.get(column) ?? 0) + 1);
    }
    this.chunks.set(key, chunk);
    this.encoded.delete(column);
    this.version += 1;
  }

  removeChunk(cx: number, cy: number, cz: number): void {
    if (this.chunks.delete(chunkKey(cx, cy, cz))) {
      const column = columnKey(cx, cz);
      const remaining = this.columnChunks.get(column)! - 1;
      if (remaining === 0) {
        this.columnChunks.delete(column);
      } else {
        this.columnChunks.set(column, remaining);
      }
      this.encoded.delete(column);
      this.version += 1;
    }
  }

  touchColumn(cx: number, cz: number): void {
    if (!this.columnChunks.has(columnKey(cx, cz))) {
      throw new Error(`Cannot touch absent column ${cx},${cz}`);
    }
    this.touched.add(columnKey(cx, cz));
    this.version += 1;
  }

  isTouched(cx: number, cz: number): boolean {
    return this.touched.has(columnKey(cx, cz));
  }

  /** Every resident chunk of each touched column, with stable content ids; the live world is untouched. */
  snapshotColumns(contentId: (blockId: number) => string): readonly Readonly<SavedColumn>[] {
    const stale = new Map<string, Chunk[]>();
    for (const key of this.touched) {
      if (!this.encoded.has(key)) {
        stale.set(key, []);
      }
    }
    if (stale.size > 0) {
      for (const chunk of this.chunks.values()) {
        stale.get(columnKey(chunk.cx, chunk.cz))?.push(chunk);
      }
      for (const [key, chunks] of stale) {
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        chunks.sort((a, b) => a.cy - b.cy);
        this.encoded.set(key, freezeSnapshot({ cx, cz, chunks: chunks.map((chunk) => encodeChunk(chunk, contentId)) }));
      }
    }
    return [...this.encoded.values()]
      .filter((column) => column.chunks.length > 0)
      .sort((a, b) => a.cx - b.cx || a.cz - b.cz);
  }

  /** Installs saved columns in place of anything generated there; they stay touched. */
  restoreColumns(columns: readonly Readonly<SavedColumn>[], blockId: (contentId: string) => number): void {
    if (this.touched.size > 0) {
      throw new Error('Cannot restore saved columns over an edited or restored world');
    }
    for (const column of columns) {
      const key = columnKey(column.cx, column.cz);
      if (this.touched.has(key)) {
        throw new Error(`Duplicate saved column ${key}`);
      }
      this.touched.add(key);
      for (const saved of column.chunks) {
        this.addChunk(decodeChunk(column.cx, column.cz, saved, blockId));
      }
      this.encoded.set(key, freezeSnapshot(structuredClone(column)));
    }
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
    if (chunk.get(toLocal(x), toLocal(y), toLocal(z)) !== id) {
      this.blockDamage.clear([x, y, z]);
      chunk.set(toLocal(x), toLocal(y), toLocal(z), id);
      const column = columnKey(cx, cz);
      this.touched.add(column);
      this.encoded.delete(column);
      this.version += 1;
    }
    return affectedChunks(x, y, z);
  }
}

/** -1 or 1 if a chunk-local coordinate is within MESH_REACH of the low or high face of its chunk, else 0. */
const borderStep = (local: number): number => {
  if (local < MESH_REACH) {
    return -1;
  }
  return local >= CHUNK - MESH_REACH ? 1 : 0;
};

/**
 * The chunk holding a block plus every neighbour chunk whose mesh reads it: the wide ambient occlusion
 * looks MESH_REACH blocks out (and the 1-block padding of the corner AO is inside that), so any
 * chunk, including diagonal ones, whose border shell holds the block is stale. The block's own chunk
 * is first.
 */
export const affectedChunks = (x: number, y: number, z: number): Vec3[] => {
  const c: Vec3 = [toChunk(x), toChunk(y), toChunk(z)];
  const steps = [borderStep(toLocal(x)), borderStep(toLocal(y)), borderStep(toLocal(z))];
  const out: Vec3[] = [c];
  // Each axis offers 0 and, near a face, one neighbour step; the product is the stale set.
  for (let mask = 1; mask < 8; mask++) {
    const n: Vec3 = [...c];
    let valid = true;
    for (let axis = 0; axis < 3; axis++) {
      if (mask & (1 << axis)) {
        valid &&= steps[axis] !== 0;
        n[axis] = n[axis]! + steps[axis]!;
      }
    }
    if (valid) {
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
export const isEnclosed = (
  world: World,
  [cx, cy, cz]: Vec3,
  bottomCy = Number.NEGATIVE_INFINITY,
  occluders?: Uint8Array,
): boolean => {
  const solidThrough = (x: number, y: number, z: number) => {
    if (y < bottomCy) {
      return true;
    }
    const id = world.getChunk(x, y, z)?.uniformId;
    return id !== undefined && id !== 0 && (occluders?.[id] ?? 1) !== 0;
  };
  return solidThrough(cx, cy, cz) && FACE_NEIGHBOURS.every(([dx, dy, dz]) => solidThrough(cx + dx, cy + dy, cz + dz));
};
