// Oriented boxes in the assembly frame, and how deep two of them overlap.

import type { Box } from './schema.ts';
import {
  type Mat3,
  type Transform,
  type Vec3,
  applyPoint,
  column,
  cross,
  dot,
  length,
  scale,
  sub,
} from './math.ts';

export interface OBB {
  readonly center: Vec3;
  /** Columns are the box's local axes in the assembly frame. */
  readonly r: Mat3;
  readonly half: Vec3;
}

export const worldBox = (t: Transform, box: Box): OBB => ({
  center: applyPoint(t, box.center),
  r: t.r,
  half: box.half,
});

/**
 * Separating-axis test. Returns the smallest overlap along any candidate
 * axis: > 0 means the boxes interpenetrate by that much, <= 0 means they are
 * separated (or touching, at 0).
 */
export const penetration = (a: OBB, b: OBB): number => {
  const aAxes = [column(a.r, 0), column(a.r, 1), column(a.r, 2)] as const;
  const bAxes = [column(b.r, 0), column(b.r, 1), column(b.r, 2)] as const;
  const candidates: Vec3[] = [...aAxes, ...bAxes];
  for (const u of aAxes) {
    for (const v of bAxes) {
      const c = cross(u, v);
      const l = length(c);
      if (l > 1e-9) candidates.push(scale(c, 1 / l));
    }
  }
  const d = sub(b.center, a.center);
  const radius = (axes: readonly Vec3[], half: Vec3, l: Vec3): number =>
    axes.reduce((sum, axis, i) => sum + Math.abs(half[i]! * dot(axis, l)), 0);

  let min = Infinity;
  for (const l of candidates) {
    const overlap = radius(aAxes, a.half, l) + radius(bAxes, b.half, l) - Math.abs(dot(d, l));
    if (overlap < min) min = overlap;
    if (min <= 0) return min;
  }
  return min;
};

/** Axis-aligned box from two opposite corners. */
export const boxFromMinMax = (min: Vec3, max: Vec3): Box => ({
  center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
});
