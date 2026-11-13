import { chunkKey } from '../core/coords.ts';

/** Chunks needing a (re)mesh, counted per column so the mesh scan skips clean columns without building keys. */
export class DirtyChunks {
  private readonly chunks = new Set<string>();
  /** Dirty chunk count per column, by cx then cz; a column with none has no entry. */
  private readonly columns = new Map<number, Map<number, number>>();

  get size(): number {
    return this.chunks.size;
  }

  has(key: string): boolean {
    return this.chunks.has(key);
  }

  add(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    if (!this.chunks.has(key)) {
      this.chunks.add(key);
      this.count(cx, cz, 1);
    }
  }

  delete(cx: number, cy: number, cz: number): void {
    if (this.chunks.delete(chunkKey(cx, cy, cz))) {
      this.count(cx, cz, -1);
    }
  }

  inColumn(cx: number, cz: number): boolean {
    return this.columns.get(cx)?.has(cz) ?? false;
  }

  private count(cx: number, cz: number, step: number): void {
    let row = this.columns.get(cx);
    if (!row) {
      row = new Map();
      this.columns.set(cx, row);
    }
    const count = (row.get(cz) ?? 0) + step;
    if (count > 0) {
      row.set(cz, count);
      return;
    }
    row.delete(cz);
    if (row.size === 0) {
      this.columns.delete(cx);
    }
  }
}
