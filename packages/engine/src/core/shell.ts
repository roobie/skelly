// Copies a chunk and a shell of its neighbours' blocks into one array, for the mesher.

import { CHUNK, localIndex, type Vec3 } from './coords.ts';

/** One chunk's blocks as the shell reads them: its block array, or the one id a uniform chunk stores (0 when missing). */
export type ChunkBlocks = Readonly<Uint16Array> | number;

/** Index of the chunk at offset (ox, oy, oz), each -1, 0 or 1, in a 27-chunk neighbourhood: x fastest, then z, then y. */
export const neighbourIndex = (ox: number, oy: number, oz: number): number => ox + 1 + 3 * (oz + 1 + 3 * (oy + 1));

/** The chunk-local range [lo, hi) of a neighbour chunk at offset -1, 0 or 1 that lies within `border` of the centre chunk. */
const shellSpan = (offset: number, border: number): [number, number] => [
  offset < 0 ? CHUNK - border : 0,
  offset > 0 ? border : CHUNK,
];

/**
 * A chunk plus a `border`-block shell around it, copied from the chunk and its 26 neighbours into
 * `out` (side CHUNK + 2 * border, x fastest, then z, then y). Copies whole rows (a span of one chunk
 * at a time), not cell by cell. `border` must not exceed CHUNK. Missing chunks and uniform air stay
 * 0. With `solidOnly`, `out` holds 1 for every non-air block, not its id.
 */
export class Shell {
  readonly out: Uint8Array | Uint16Array;
  private readonly side: number;
  private readonly border: number;
  private readonly solidOnly: boolean;

  private readonly occluders: Uint8Array | undefined;

  constructor(border: number, solidOnly: boolean, occluders?: Uint8Array) {
    this.occluders = occluders;
    this.border = border;
    this.solidOnly = solidOnly;
    this.side = CHUNK + 2 * border;
    const cells = this.side ** 3;
    this.out = solidOnly ? new Uint8Array(cells) : new Uint16Array(cells);
  }

  /** Copies from the 27 chunks around the centre, ordered by `neighbourIndex`. */
  fill(chunks: readonly ChunkBlocks[]): void {
    for (let oy = -1; oy <= 1; oy++) {
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          this.addChunk(chunks[neighbourIndex(ox, oy, oz)]!, [ox, oy, oz]);
        }
      }
    }
  }

  private addChunk(blocks: ChunkBlocks, [ox, oy, oz]: Vec3): void {
    const raw = typeof blocks === 'number' ? undefined : blocks;
    const uniform = typeof blocks === 'number' ? blocks : 0;
    if (!raw && uniform === 0) {
      return;
    }
    const { border, side } = this;
    const [x0, x1] = shellSpan(ox, border);
    const [y0, y1] = shellSpan(oy, border);
    const [z0, z1] = shellSpan(oz, border);
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        const dst = x0 + ox * CHUNK + border + side * (z + oz * CHUNK + border + side * (y + oy * CHUNK + border));
        this.copyRow(raw, uniform, localIndex(x0, y, z), [dst, x1 - x0]);
      }
    }
  }

  /** One row of `length` cells to `dst`: from `raw` at `src`, or `uniform` when the chunk stores one id. */
  private copyRow(
    raw: Readonly<Uint16Array> | undefined,
    uniform: number,
    src: number,
    [dst, length]: [number, number],
  ): void {
    if (!raw) {
      this.out.fill(this.solidOnly ? (this.occluders?.[uniform] ?? Number(uniform !== 0)) : uniform, dst, dst + length);
    } else if (this.solidOnly) {
      for (let i = 0; i < length; i++) {
        const id = raw[src + i]!;
        this.out[dst + i] = this.occluders?.[id] ?? Number(id !== 0);
      }
    } else {
      (this.out as Uint16Array).set(raw.subarray(src, src + length), dst);
    }
  }
}
