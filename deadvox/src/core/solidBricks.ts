import type { BlockEntities } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import type { SolidAt } from './raycast.ts';
import type { World } from './world.ts';

// Solid blocks grouped into 4×4×4 bricks, so an exact body shape rejects an empty brick, or a wall's whole
// brick, in one box test instead of block by block (#563). A brick is a 64-bit solid mask, as two 32-bit
// words, plus the tight box around its solid blocks.

/** Blocks along a brick's edge; brick coordinate = block coordinate >> BRICK_BITS. */
export const BRICK_BITS = 2;
const BRICK = 1 << BRICK_BITS;
const BRICKS_PER_CHUNK = CHUNK / BRICK;
const CHUNK_BRICK_BITS = Math.log2(BRICKS_PER_CHUNK);
const BRICK_SLOTS = BRICKS_PER_CHUNK ** 3;

/**
 * One brick: bit x + 4z + 16y (local 0..3) is solid, y 0–1 in `lo` and y 2–3 in `hi`. `box` packs the tight
 * box around the solid blocks, 3 bits each from the low end: min x, y, z, then exclusive max x, y, z.
 */
export interface BrickOut {
  lo: number;
  hi: number;
  box: number;
}

export interface SolidBricks {
  /** Fills `out` with brick (bx, by, bz) and returns true, or returns false when it holds no solid block. */
  brick: (bx: number, by: number, bz: number, out: BrickOut) => boolean;
  /** Changes whenever a solid block may have; NaN, never equal to itself, when the source can't tell. */
  readonly version: number;
}

const FULL_BOX = (BRICK << 9) | (BRICK << 12) | (BRICK << 15);

const bitOf = (lx: number, ly: number, lz: number): number => lx + BRICK * (lz + BRICK * ly);

/** The packed tight box of a non-empty mask. */
const boxOf = (lo: number, hi: number): number => {
  let minX = BRICK;
  let minY = BRICK;
  let minZ = BRICK;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (let bit = 0; bit < 64; bit++) {
    if ((((bit < 32 ? lo : hi) >>> (bit & 31)) & 1) === 0) {
      continue;
    }
    const x = bit & 3;
    const z = (bit >> 2) & 3;
    const y = bit >> 4;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + 1);
    maxY = Math.max(maxY, y + 1);
    maxZ = Math.max(maxZ, z + 1);
  }
  return minX | (minY << 3) | (minZ << 6) | (maxX << 9) | (maxY << 12) | (maxZ << 15);
};

/** Exact numeric key for coordinates within ±2^16 of the origin. */
const keyOf = (x: number, y: number, z: number): number =>
  ((x + 65_536) * 131_072 + (y + 65_536)) * 131_072 + (z + 65_536);

interface ChunkBricks {
  readonly revision: number;
  /** Per brick: lo, hi, box; undefined when the chunk holds one block id throughout. */
  readonly words: Uint32Array | undefined;
  readonly solid: boolean;
}

/**
 * Bricks read from the world's chunks, each chunk built once per revision, with furniture laid over them.
 * The furniture layer is rebuilt when the entities' version moves.
 */
class WorldBricks implements SolidBricks {
  private readonly solidById: Uint8Array;
  private readonly chunkBricks = new WeakMap<Chunk, ChunkBricks>();
  private readonly chunks = new Map<number, Chunk | null>();
  private chunksAt = -1;
  private readonly furniture = new Map<number, [number, number]>();
  private furnitureAt = -1;
  private seenWorld = -1;
  private seenEntities = -1;
  private changes = 0;
  private readonly world: World;
  private readonly entities: BlockEntities | undefined;

  constructor(world: World, registry: Registry, entities: BlockEntities | undefined) {
    this.world = world;
    this.entities = entities;
    this.solidById = Uint8Array.from(registry.blocks, (block, id) => (id !== 0 && block?.solid ? 1 : 0));
  }

  get version(): number {
    const entities = this.entities?.version ?? 0;
    if (this.world.version !== this.seenWorld || entities !== this.seenEntities) {
      this.seenWorld = this.world.version;
      this.seenEntities = entities;
      this.changes += 1;
    }
    return this.changes;
  }

  brick(bx: number, by: number, bz: number, out: BrickOut): boolean {
    let lo = 0;
    let hi = 0;
    let box = 0;
    const chunk = this.chunkAt(bx >> CHUNK_BRICK_BITS, by >> CHUNK_BRICK_BITS, bz >> CHUNK_BRICK_BITS);
    if (chunk) {
      const bricks = this.bricksOf(chunk);
      if (bricks.words) {
        const local = BRICKS_PER_CHUNK - 1;
        const slot = ((bx & local) + BRICKS_PER_CHUNK * ((bz & local) + BRICKS_PER_CHUNK * (by & local))) * 3;
        lo = bricks.words[slot]!;
        hi = bricks.words[slot + 1]!;
        box = bricks.words[slot + 2]!;
      } else if (bricks.solid) {
        lo = 0xff_ff_ff_ff;
        hi = 0xff_ff_ff_ff;
        box = FULL_BOX;
      }
    }
    if (this.entities) {
      const extra = this.furnitureLayer().get(keyOf(bx, by, bz));
      if (extra) {
        lo = (lo | extra[0]) >>> 0;
        hi = (hi | extra[1]) >>> 0;
        box = boxOf(lo, hi);
      }
    }
    if (lo === 0 && hi === 0) {
      return false;
    }
    out.lo = lo;
    out.hi = hi;
    out.box = box;
    return true;
  }

  private chunkAt(cx: number, cy: number, cz: number): Chunk | undefined {
    if (this.chunksAt !== this.world.version) {
      this.chunks.clear();
      this.chunksAt = this.world.version;
    }
    const key = keyOf(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (chunk === undefined) {
      chunk = this.world.getChunk(cx, cy, cz) ?? null;
      this.chunks.set(key, chunk);
    }
    return chunk ?? undefined;
  }

  private bricksOf(chunk: Chunk): ChunkBricks {
    const cached = this.chunkBricks.get(chunk);
    if (cached && cached.revision === chunk.revision) {
      return cached;
    }
    const built = this.build(chunk);
    this.chunkBricks.set(chunk, built);
    return built;
  }

  private build(chunk: Chunk): ChunkBricks {
    const uniform = chunk.uniformId;
    if (uniform !== undefined) {
      return { revision: chunk.revision, words: undefined, solid: this.solidById[uniform] === 1 };
    }
    const raw = chunk.raw()!;
    const words = new Uint32Array(BRICK_SLOTS * 3);
    for (let index = 0; index < raw.length; index++) {
      if (this.solidById[raw[index]!] !== 1) {
        continue;
      }
      // Chunk index x + 32 (z + 32 y), as core/coords.ts `localIndex`.
      const x = index & (CHUNK - 1);
      const z = (index / CHUNK) & (CHUNK - 1);
      const y = (index / (CHUNK * CHUNK)) | 0;
      const slot = (x >> BRICK_BITS) + BRICKS_PER_CHUNK * ((z >> BRICK_BITS) + BRICKS_PER_CHUNK * (y >> BRICK_BITS));
      const bit = bitOf(x & (BRICK - 1), y & (BRICK - 1), z & (BRICK - 1));
      const word = slot * 3 + (bit < 32 ? 0 : 1);
      words[word] = (words[word]! | (1 << (bit & 31))) >>> 0;
    }
    for (let slot = 0; slot < BRICK_SLOTS; slot++) {
      const lo = words[slot * 3]!;
      const hi = words[slot * 3 + 1]!;
      if (lo !== 0 || hi !== 0) {
        words[slot * 3 + 2] = boxOf(lo, hi);
      }
    }
    return { revision: chunk.revision, words, solid: false };
  }

  private furnitureLayer(): ReadonlyMap<number, readonly [number, number]> {
    const entities = this.entities!;
    if (this.furnitureAt === entities.version) {
      return this.furniture;
    }
    this.furniture.clear();
    this.furnitureAt = entities.version;
    for (const entity of entities.all) {
      if (entities.blocks(entity)) {
        this.addFurniture(entity);
      }
    }
    return this.furniture;
  }

  private addFurniture({ pos, size }: { readonly pos: Vec3; readonly size: Vec3 }): void {
    const [x0, y0, z0] = pos;
    const [width, height, depth] = size;
    for (let y = y0; y < y0 + height; y++) {
      for (let z = z0; z < z0 + depth; z++) {
        for (let x = x0; x < x0 + width; x++) {
          this.addFurnitureBlock(x, y, z);
        }
      }
    }
  }

  private addFurnitureBlock(x: number, y: number, z: number): void {
    const key = keyOf(x >> BRICK_BITS, y >> BRICK_BITS, z >> BRICK_BITS);
    const bit = bitOf(x & (BRICK - 1), y & (BRICK - 1), z & (BRICK - 1));
    const words = this.furniture.get(key) ?? [0, 0];
    words[bit < 32 ? 0 : 1] = (words[bit < 32 ? 0 : 1] | (1 << (bit & 31))) >>> 0;
    this.furniture.set(key, words);
  }
}

/** The solid blocks of core/collision.ts `worldSolid`, as cached bricks. */
export const worldBricks = (world: World, registry: Registry, entities?: BlockEntities): SolidBricks =>
  new WorldBricks(world, registry, entities);

/** Bricks from any block test, read afresh on every query, uncached: for callers without a world, such as tests. */
export const testedBricks = (isSolid: SolidAt): SolidBricks => ({
  version: Number.NaN,
  brick: (bx, by, bz, out) => {
    let lo = 0;
    let hi = 0;
    for (let bit = 0; bit < 64; bit++) {
      if (isSolid(bx * BRICK + (bit & 3), by * BRICK + (bit >> 4), bz * BRICK + ((bit >> 2) & 3))) {
        if (bit < 32) {
          lo = (lo | (1 << bit)) >>> 0;
        } else {
          hi = (hi | (1 << (bit - 32))) >>> 0;
        }
      }
    }
    if (lo === 0 && hi === 0) {
      return false;
    }
    out.lo = lo;
    out.hi = hi;
    out.box = boxOf(lo, hi);
    return true;
  },
});

/** Whether block (lx, ly, lz), local to its brick, is solid. */
export const brickHas = (brick: BrickOut, lx: number, ly: number, lz: number): boolean => {
  const bit = bitOf(lx, ly, lz);
  return (((bit < 32 ? brick.lo : brick.hi) >>> (bit & 31)) & 1) === 1;
};
