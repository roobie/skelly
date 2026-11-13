/** Views keep what they drew per chunk column until `revealVersion` changes, so both hold for every implementation. */
export interface ColumnReveal {
  /** Goes up whenever any answer of `isRevealed` changes. */
  readonly revealVersion: number;
  /** Position in world block units; every point of one chunk column has the same answer. */
  isRevealed: (x: number, z: number) => boolean;
}

/** A conservative sight corridor: both inward neighbours must be drawn, including at diagonal corners. */
export const revealedColumns = (
  center: readonly [number, number],
  offsets: readonly (readonly [number, number])[],
  complete: (cx: number, cz: number) => boolean,
): Set<string> => {
  const drawn = new Set<string>();
  for (const [dx, dz] of offsets) {
    const cx = center[0] + dx;
    const cz = center[1] + dz;
    if (!complete(cx, cz)) {
      continue;
    }
    if (dx !== 0 && !drawn.has(`${cx - Math.sign(dx)},${cz}`)) {
      continue;
    }
    if (dz !== 0 && !drawn.has(`${cx},${cz - Math.sign(dz)}`)) {
      continue;
    }
    drawn.add(`${cx},${cz}`);
  }
  return drawn;
};

/** What a `RevealWindow.settle` changed. */
export interface RevealChange {
  /** Every drawn column, as "cx,cz"; a fresh set each time. */
  columns: Set<string>;
  /** Columns drawn by this settle that were not drawn before it, nearest first. */
  added: [number, number][];
}

/**
 * `revealedColumns` kept current as columns gain or lose completeness. A column reads only its inward
 * neighbours, which come earlier in the nearest-first order, so one forward pass from the first touched
 * column re-evaluates every column a change can reach, each after its inputs are final.
 */
export class RevealWindow {
  private readonly offsets: readonly (readonly [number, number])[];
  /** Largest |dx| or |dz| among the offsets. */
  private readonly reach: number;
  /** Offset index per cell of the square around the centre, -1 where the window has none. */
  private readonly slots: Int32Array;
  private readonly drawn: Uint8Array;
  private readonly stale: Uint8Array;
  private firstStale: number;
  private changed = false;
  private center: readonly [number, number] = [Number.NaN, Number.NaN];
  private readonly columns = new Set<string>();

  /** `offsets` nearest first, as `revealedColumns` takes them. */
  constructor(offsets: readonly (readonly [number, number])[]) {
    this.offsets = offsets;
    this.reach = offsets.reduce((reach, [dx, dz]) => Math.max(reach, Math.abs(dx), Math.abs(dz)), 0);
    const side = 2 * this.reach + 1;
    this.slots = new Int32Array(side * side).fill(-1);
    offsets.forEach(([dx, dz], index) => {
      this.slots[(dz + this.reach) * side + dx + this.reach] = index;
    });
    this.drawn = new Uint8Array(offsets.length);
    this.stale = new Uint8Array(offsets.length);
    this.firstStale = offsets.length;
  }

  /** Moves the window; every column is re-evaluated at the next `settle`. */
  recenter(center: readonly [number, number]): void {
    this.center = center;
    this.drawn.fill(0);
    this.stale.fill(1);
    this.firstStale = 0;
    this.columns.clear();
    this.changed = true;
  }

  contains(cx: number, cz: number): boolean {
    return this.indexAt(cx - this.center[0], cz - this.center[1]) >= 0;
  }

  /** Column (cx, cz) may have gained or lost completeness. */
  touch(cx: number, cz: number): void {
    this.markStale(cx - this.center[0], cz - this.center[1]);
  }

  /** Re-evaluates the stale columns nearest first; undefined when no column changed since the last settle. */
  settle(complete: (cx: number, cz: number) => boolean): RevealChange | undefined {
    const added: [number, number][] = [];
    for (let index = this.firstStale; index < this.offsets.length; index++) {
      if (this.stale[index] === 1) {
        this.stale[index] = 0;
        this.reevaluate(index, complete, added);
      }
    }
    this.firstStale = this.offsets.length;
    if (!this.changed) {
      return undefined;
    }
    this.changed = false;
    return { columns: new Set(this.columns), added };
  }

  /** Applies the `revealedColumns` rule to one column; a change marks the columns whose corridor runs through it. */
  private reevaluate(index: number, complete: (cx: number, cz: number) => boolean, added: [number, number][]): void {
    const [dx, dz] = this.offsets[index]!;
    const cx = this.center[0] + dx;
    const cz = this.center[1] + dz;
    const drawn = complete(cx, cz) && this.corridorOpen(dx, dz);
    if (drawn === (this.drawn[index] === 1)) {
      return;
    }
    this.drawn[index] = Number(drawn);
    this.changed = true;
    if (drawn) {
      this.columns.add(`${cx},${cz}`);
      added.push([cx, cz]);
    } else {
      this.columns.delete(`${cx},${cz}`);
    }
    for (const sx of dx === 0 ? [-1, 1] : [Math.sign(dx)]) {
      this.markStale(dx + sx, dz);
    }
    for (const sz of dz === 0 ? [-1, 1] : [Math.sign(dz)]) {
      this.markStale(dx, dz + sz);
    }
  }

  private corridorOpen(dx: number, dz: number): boolean {
    return (dx === 0 || this.isDrawn(dx - Math.sign(dx), dz)) && (dz === 0 || this.isDrawn(dx, dz - Math.sign(dz)));
  }

  private isDrawn(dx: number, dz: number): boolean {
    const index = this.indexAt(dx, dz);
    return index >= 0 && this.drawn[index] === 1;
  }

  private markStale(dx: number, dz: number): void {
    const index = this.indexAt(dx, dz);
    if (index >= 0) {
      this.stale[index] = 1;
      this.firstStale = Math.min(this.firstStale, index);
    }
  }

  private indexAt(dx: number, dz: number): number {
    // Written so a NaN offset (no centre yet) falls outside.
    if (!(Math.abs(dx) <= this.reach && Math.abs(dz) <= this.reach)) {
      return -1;
    }
    return this.slots[(dz + this.reach) * (2 * this.reach + 1) + dx + this.reach]!;
  }
}
