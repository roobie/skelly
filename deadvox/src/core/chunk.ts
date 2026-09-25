import { CHUNK_VOLUME, localIndex } from './coords.ts';

/**
 * A cube of block ids. Id 0 is air; other ids index the content registry.
 *
 * A chunk where every block has the same id (all air, all stone) stores just that
 * id. The full array is allocated on the first write that differs, and `compact`
 * goes back to a single id when possible. Most chunks are uniform, so this is what
 * keeps 0.5 m blocks affordable (CHALLENGES.md §1).
 */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  /** Changed by play (not worldgen), so it can't be regenerated from the seed. */
  edited = false;
  private data: Uint16Array | undefined;
  private fill: number;

  constructor(cx: number, cy: number, cz: number, fill = 0) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.fill = fill;
  }

  /** The id every block has, or undefined if the chunk stores a full array. */
  get uniformId(): number | undefined {
    return this.data ? undefined : this.fill;
  }

  /** Bytes of block data held in memory. */
  get bytes(): number {
    return this.data ? this.data.byteLength : 2;
  }

  get(x: number, y: number, z: number): number {
    return this.at(localIndex(x, y, z));
  }

  /** The id at a local index (see localIndex). */
  at(index: number): number {
    return this.data ? this.data[index]! : this.fill;
  }

  set(x: number, y: number, z: number, id: number): void {
    if (!this.data) {
      if (id === this.fill) {
        return;
      }
      this.data = new Uint16Array(CHUNK_VOLUME).fill(this.fill);
    }
    this.data[localIndex(x, y, z)] = id;
  }

  /** Goes back to storing a single id if every block is the same. Returns whether the chunk is uniform. */
  compact(): boolean {
    if (!this.data) {
      return true;
    }
    const first = this.data[0]!;
    if (!this.data.every((b) => b === first)) {
      return false;
    }
    this.data = undefined;
    this.fill = first;
    return true;
  }

  /** The stored array for reading, or undefined when uniform. */
  raw(): Readonly<Uint16Array> | undefined {
    return this.data;
  }

  /** A copy of every block id. */
  toArray(): Uint16Array {
    return this.data ? this.data.slice() : new Uint16Array(CHUNK_VOLUME).fill(this.fill);
  }

  isEmpty(): boolean {
    return this.data ? this.data.every((b) => b === 0) : this.fill === 0;
  }
}
