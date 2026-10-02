// The centreline of a generated magazine body, read back from its own solids (roobie/skelly#109, spike).
// A curved magazine is an upper body plus a fan of sectors, each an extruded polygon in the magazine's
// XY plane. Every sector's polygon ends in the cross-section it turns about: the middle of that
// cross-section is a point on the body's centreline. So the path the rounds follow is the generated
// geometry's own bands and segments, not a separate hand-drawn curve.

import type { Solid, Vec2 } from '../core/schema.ts';

export interface MagazineCenterline {
  /** From the centre of the feed face downward, in the magazine's local XY plane. */
  readonly points: readonly Vec2[];
  /** Width of the body across the plane (the extrusion depth). */
  readonly width: number;
}

const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const SECTOR_ID = /^curve-(?:display|sector)-(\d+)$/;
const DISPLAY_SECTOR_ID = /^curve-display-\d+$/;

/**
 * Reads the centreline of a curved or box-shaped magazine from `solids`. Prefers the display sectors
 * (finer) over the collision sectors. Returns undefined for a shape it does not know.
 */
export const magazineCenterline = (solids: readonly Solid[]): MagazineCenterline | undefined => {
  const upper = solids.find((s) => s.id === 'upper-body');
  if (upper?.kind === 'extruded-polygon') {
    const display = solids.filter((s) => DISPLAY_SECTOR_ID.test(s.id));
    const sectors = (display.length > 0 ? display : solids.filter((s) => SECTOR_ID.test(s.id)))
      .flatMap((s) => (s.kind === 'extruded-polygon' ? [s] : []))
      .sort((a, b) => Number(SECTOR_ID.exec(a.id)![1]) - Number(SECTOR_ID.exec(b.id)![1]));
    // Upper body profile: [top-back, top-front, face-front, face-back]; sector: [next-rear, next-front, front, rear].
    const points = [
      mid(upper.profile[2]!, upper.profile[3]!),
      mid(upper.profile[0]!, upper.profile[1]!),
      ...sectors.map((s) => mid(s.profile[0]!, s.profile[1]!)),
    ];
    return { points, width: upper.z[1] - upper.z[0] };
  }
  const body = solids.find((s) => s.id === 'body');
  if (body?.kind === 'box') {
    const { center, half } = body.box;
    return {
      points: [
        [center[0], center[1] + half[1]],
        [center[0], center[1] - half[1]],
      ],
      width: half[2] * 2,
    };
  }
  return undefined;
};
