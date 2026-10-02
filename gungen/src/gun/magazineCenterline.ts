import type { Solid, Vec2 } from '../core/schema.ts';

export interface MagazineCenterline {
  /** Centreline in magazine-local XY coordinates, from the feed face down through the body. */
  readonly points: readonly Vec2[];
  /** Width across the magazine's side walls (the extrusion depth). */
  readonly width: number;
  /** Rear face of the body, where feed lips start. */
  readonly rearX: number;
}

const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const SECTOR_ID = /^curve-(?:display|sector)-(\d+)$/;
const DISPLAY_SECTOR_ID = /^curve-display-\d+$/;

/** Read a generated magazine's centreline from its own upper body and curve sectors. */
export const magazineCenterline = (solids: readonly Solid[]): MagazineCenterline | undefined => {
  const upper = solids.find((solid) => solid.id === 'upper-body');
  if (upper?.kind === 'extruded-polygon') {
    const display = solids.filter((solid) => DISPLAY_SECTOR_ID.test(solid.id));
    const sectors = (display.length > 0 ? display : solids.filter((solid) => SECTOR_ID.test(solid.id)))
      .flatMap((solid) => (solid.kind === 'extruded-polygon' ? [solid] : []))
      .sort((a, b) => Number(SECTOR_ID.exec(a.id)![1]) - Number(SECTOR_ID.exec(b.id)![1]));
    // Upper body is [top-back, top-front, face-front, face-back]; sectors start at the next rear/front pair.
    const points = [
      midpoint(upper.profile[2]!, upper.profile[3]!),
      midpoint(upper.profile[0]!, upper.profile[1]!),
      ...sectors.map((sector) => midpoint(sector.profile[0]!, sector.profile[1]!)),
    ];
    return { points, width: upper.z[1] - upper.z[0], rearX: Math.min(...upper.profile.map(([x]) => x)) };
  }
  const body = solids.find((solid) => solid.id === 'body');
  if (body?.kind === 'box') {
    const { center, half } = body.box;
    return {
      points: [
        [center[0], center[1] + half[1]],
        [center[0], center[1] - half[1]],
      ],
      width: half[2] * 2,
      rearX: center[0] - half[0],
    };
  }
  return undefined;
};
