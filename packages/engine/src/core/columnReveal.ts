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
