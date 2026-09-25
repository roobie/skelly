import { CHUNK_VOLUME, localIndex } from './coords.ts';

/** A cube of block ids. Id 0 is air; other ids index the content registry. */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly blocks = new Uint16Array(CHUNK_VOLUME);

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
  }

  get(x: number, y: number, z: number): number {
    return this.blocks[localIndex(x, y, z)]!;
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks[localIndex(x, y, z)] = id;
  }

  isEmpty(): boolean {
    return this.blocks.every((b) => b === 0);
  }
}
