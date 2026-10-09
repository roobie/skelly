import type { Solid, Vec2 } from '@skelly/engine/core/schema.ts';

export interface MagazineCenterline {
  /** Centreline in magazine-local XY coordinates, from the feed face down through the body. */
  readonly points: readonly Vec2[];
  /** Width across the magazine's side walls (the extrusion depth). */
  readonly width: number;
  /** Side-wall separation at each centreline point, including body transitions. */
  readonly sectionWidths: readonly number[];
  /** Actual front-to-back body section span at each centreline point, from its source solid. */
  readonly sectionDepths: readonly number[];
  /** Rear face of the body, where feed lips start. */
  readonly rearX: number;
}

const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const SECTOR_ID = /^curve-(?:display|sector)-(\d+)$/;
const DISPLAY_SECTOR_ID = /^curve-display-\d+$/;
const DISPLAY_BOTTOM_ID = 'curve-display-straight-bottom';
const SECTOR_BOTTOM_ID = 'curve-sector-straight-bottom';

/** Read a generated magazine's centreline from its own upper body and curve sectors. */
export const magazineCenterline = (solids: readonly Solid[]): MagazineCenterline | undefined => {
  const upper = solids.find((solid) => solid.id === 'upper-body');
  if (upper?.kind === 'extruded-polygon') {
    const display = solids.filter((solid) => DISPLAY_SECTOR_ID.test(solid.id) || solid.id === DISPLAY_BOTTOM_ID);
    const sectors = (
      display.length > 0 ? display : solids.filter((solid) => SECTOR_ID.test(solid.id) || solid.id === SECTOR_BOTTOM_ID)
    )
      .flatMap((solid) => (solid.kind === 'extruded-polygon' ? [solid] : []))
      .sort((a, b) => {
        const aIndex = Number(SECTOR_ID.exec(a.id)?.[1] ?? Number.MAX_SAFE_INTEGER);
        const bIndex = Number(SECTOR_ID.exec(b.id)?.[1] ?? Number.MAX_SAFE_INTEGER);
        return aIndex - bIndex;
      });
    // Upper body is [top-back, top-front, face-front, face-back]; sectors start at the next rear/front pair.
    const straightBody = solids.find((solid) => solid.id === 'straight-body');
    const sectionPairs: readonly [Vec2, Vec2][] = [
      [upper.profile[2]!, upper.profile[3]!],
      [upper.profile[0]!, upper.profile[1]!],
      ...(straightBody?.kind === 'extruded-polygon'
        ? [[straightBody.profile[2]!, straightBody.profile[1]!] as [Vec2, Vec2]]
        : []),
      ...sectors.map((sector): [Vec2, Vec2] => [sector.profile[0]!, sector.profile[1]!]),
    ];
    const points = sectionPairs.map(([rear, front]) => midpoint(rear, front));
    const sectionDepths = sectionPairs.map(([rear, front]) => Math.hypot(front[0] - rear[0], front[1] - rear[1]));
    const upperWidth = upper.z[1] - upper.z[0];
    const bodyWidth =
      straightBody?.kind === 'extruded-polygon'
        ? straightBody.z[1] - straightBody.z[0]
        : (sectors[0]?.z[1] ?? upper.z[1]) - (sectors[0]?.z[0] ?? upper.z[0]);
    return {
      points,
      width: bodyWidth,
      sectionWidths: sectionPairs.map((_, index) => (index < 2 ? upperWidth : bodyWidth)),
      sectionDepths,
      rearX: Math.min(...upper.profile.map(([x]) => x)),
    };
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
      sectionWidths: [half[2] * 2, half[2] * 2],
      sectionDepths: [half[0] * 2, half[0] * 2],
      rearX: center[0] - half[0],
    };
  }
  return undefined;
};
