import { Chunk } from './chunk.ts';
import { CHUNK, chunkKey, localIndex, toChunk, toLocal, type Vec3 } from './coords.ts';
import { OCCLUSION_RADIUS, WIDE } from './occlusion.ts';
import { Shell } from './shell.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface BlockDelta {
  index: number;
  base: string;
  id: string;
}

export interface ChunkDiff {
  cx: number;
  cy: number;
  cz: number;
  cells: BlockDelta[];
}

export interface WorldDiffs {
  chunks: ChunkDiff[];
}

/** Sparse block storage. Missing chunks read as air. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  private readonly deltas = new Map<string, { x: number; y: number; z: number; base: number; id: number }>();
  private readonly deltaCounts = new Map<string, number>();

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  addChunk(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cy, chunk.cz), chunk);
  }

  removeChunk(cx: number, cy: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cy, cz));
  }

  /** Changed cells only, with stable content ids; the live world and chunks are untouched. */
  snapshotDiffs(contentId: (blockId: number) => string): Readonly<WorldDiffs> {
    const chunks = new Map<string, ChunkDiff>();
    for (const delta of this.deltas.values()) {
      const cx = toChunk(delta.x);
      const cy = toChunk(delta.y);
      const cz = toChunk(delta.z);
      const key = chunkKey(cx, cy, cz);
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { cx, cy, cz, cells: [] };
        chunks.set(key, chunk);
      }
      chunk.cells.push({
        index: localIndex(toLocal(delta.x), toLocal(delta.y), toLocal(delta.z)),
        base: contentId(delta.base),
        id: contentId(delta.id),
      });
    }
    return freezeSnapshot({
      chunks: [...chunks.values()]
        .sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.cz - b.cz)
        .map((chunk) => ({
          ...chunk,
          cells: chunk.cells.sort((a, b) => a.index - b.index),
        })),
    });
  }

  /** Applies saved changes to already-regenerated base chunks, refusing a wrong base. */
  restoreDiffs(diffs: WorldDiffs, blockId: (contentId: string) => number): void {
    if (this.deltas.size > 0) {
      throw new Error('Cannot restore world diffs over an edited world');
    }
    for (const diff of diffs.chunks) {
      const chunk = this.getChunk(diff.cx, diff.cy, diff.cz);
      if (!chunk) {
        throw new Error(`Missing generated base chunk ${chunkKey(diff.cx, diff.cy, diff.cz)}`);
      }
      for (const cell of diff.cells) {
        this.restoreCell(chunk, diff, cell, blockId);
      }
    }
  }

  private restoreCell(chunk: Chunk, diff: ChunkDiff, cell: BlockDelta, blockId: (contentId: string) => number): void {
    if (!Number.isSafeInteger(cell.index) || cell.index < 0 || cell.index >= CHUNK ** 3) {
      throw new Error(`Invalid block delta index ${cell.index}`);
    }
    const base = blockId(cell.base);
    const id = blockId(cell.id);
    if (![base, id].every((block) => Number.isSafeInteger(block) && block >= 0 && block <= 0xff_ff)) {
      throw new Error(`Unknown block content id in delta ${cell.base} → ${cell.id}`);
    }
    if (chunk.at(cell.index) !== base) {
      throw new Error(`Generated base mismatch at ${diff.cx},${diff.cy},${diff.cz}#${cell.index}`);
    }
    const lx = cell.index % CHUNK;
    const lz = Math.floor(cell.index / CHUNK) % CHUNK;
    const ly = Math.floor(cell.index / (CHUNK * CHUNK));
    const x = diff.cx * CHUNK + lx;
    const y = diff.cy * CHUNK + ly;
    const z = diff.cz * CHUNK + lz;
    chunk.set(lx, ly, lz, id);
    chunk.edited = true;
    this.deltas.set(`${x},${y},${z}`, { x, y, z, base, id });
    const key = chunkKey(diff.cx, diff.cy, diff.cz);
    this.deltaCounts.set(key, (this.deltaCounts.get(key) ?? 0) + 1);
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
    const before = chunk.get(toLocal(x), toLocal(y), toLocal(z));
    if (before !== id) {
      const key = `${x},${y},${z}`;
      const previous = this.deltas.get(key);
      const base = previous?.base ?? before;
      chunk.set(toLocal(x), toLocal(y), toLocal(z), id);
      const editedKey = chunkKey(cx, cy, cz);
      let count = this.deltaCounts.get(editedKey) ?? 0;
      if (id === base) {
        if (previous) {
          this.deltas.delete(key);
          count -= 1;
        }
      } else {
        if (!previous) {
          count += 1;
        }
        this.deltas.set(key, { x, y, z, base, id });
      }
      if (count > 0) {
        this.deltaCounts.set(editedKey, count);
      } else {
        this.deltaCounts.delete(editedKey);
      }
      chunk.edited = count > 0;
    }
    return affectedChunks(x, y, z);
  }
}

/** -1 or 1 if a chunk-local coordinate is within OCCLUSION_RADIUS of the low or high face of its chunk, else 0. */
const borderStep = (local: number): number => {
  if (local < OCCLUSION_RADIUS) {
    return -1;
  }
  return local >= CHUNK - OCCLUSION_RADIUS ? 1 : 0;
};

/**
 * The chunk holding a block plus every neighbour chunk whose mesh reads it: the wide ambient occlusion
 * looks OCCLUSION_RADIUS blocks out (and the 1-block padding of the corner AO is inside that), so any
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

/**
 * Copies a chunk and a 1-block border from its neighbours into one array, so the
 * mesher can cull faces at chunk edges without seeing the world. Missing chunks
 * read as air, except below `bottomCy` (the world's lowest layer), which reads as
 * BEDROCK so the underside of the world is never meshed.
 */
export const extractPadded = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Uint16Array => {
  const shell = new Shell(1, false);
  shell.fill(world, coords);
  const out = shell.out as Uint16Array;
  if (coords[1] - 1 < bottomCy) {
    out.fill(BEDROCK, 0, PADDED * PADDED); // padded layer y = 0
  }
  return out;
};

/**
 * Solidity (1 for any non-air block, else 0) of a chunk and an OCCLUSION_RADIUS border, for the
 * mesher's wide ambient occlusion. Cells outside what is loaded are treated as extractPadded treats
 * them: missing chunks are air (so ground that has not been generated never darkens anything) and
 * everything below `bottomCy` is solid (the world's floor).
 */
export const extractWide = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Uint8Array => {
  const shell = new Shell(OCCLUSION_RADIUS, true);
  shell.fill(world, coords);
  const out = shell.out as Uint8Array;
  if (coords[1] - 1 < bottomCy) {
    out.fill(1, 0, WIDE * WIDE * OCCLUSION_RADIUS); // the border layers below this chunk
  }
  return out;
};
