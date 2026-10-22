import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { BoxSolid, ExtrudedPolygonSolid, Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { integer, minValue, parse, pipe, strictObject } from 'valibot';
import { annulus, cylinder, positive, scalar } from './shapes.ts';

const box = (id: string, center: Vec3, size: Vec3, slot = 'body'): BoxSolid => ({
  id,
  kind: 'box',
  slot,
  box: { center, half: [size[0] / 2, size[1] / 2, size[2] / 2] },
});

/** A convex (z, x) quad extruded up the Y axis, wound counter-clockwise as the engine requires. */
const slab = (id: string, quad: readonly Vec2[], [bottom, top]: readonly [number, number]): ExtrudedPolygonSolid => {
  const area = quad.reduce((sum, [z, x], index) => {
    const [nz, nx] = quad[(index + 1) % quad.length]!;
    return sum + z * nx - nz * x;
  }, 0);
  return {
    id,
    kind: 'extruded-polygon',
    axis: 'y',
    slot: 'jaw',
    profile: area > 0 ? quad : [...quad].reverse(),
    z: [bottom, top],
  };
};

/** A set bear trap lying open: two toothed half-ring jaws laid flat beside the frame, its pan and leaf springs. */
export const bearTrap = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      jawRadius: positive,
      jawWidth: positive,
      jawThickness: positive,
      jawSegments: pipe(scalar, integer(), minValue(3)),
      toothCount: pipe(scalar, integer(), minValue(2)),
      toothHeight: positive,
      barWidth: positive,
      barHeight: positive,
      springLength: positive,
      springWidth: positive,
      springThickness: positive,
      panRadius: positive,
      panHeight: positive,
      linkCount: pipe(scalar, integer(), minValue(1)),
      linkRadius: positive,
      linkWire: positive,
    }),
    params,
  );
  if (
    !(
      d.panRadius < d.jawRadius - d.jawWidth &&
      d.jawWidth < d.jawRadius &&
      d.linkWire < d.linkRadius &&
      d.toothCount < d.jawSegments * 2
    )
  ) {
    throw new Error('Invalid bear trap dimensions');
  }
  const frameEnd = d.jawRadius + d.springLength;
  const solids: Solid[] = [
    box('frame', [0, d.barHeight / 2, 0], [frameEnd * 2, d.barHeight, d.barWidth], 'frame'),
    { ...cylinder('pan', d.panRadius, d.panHeight, 'frame'), origin: [0, d.barHeight, 0] },
  ];
  for (const side of [-1, 1]) {
    const springX = side * (d.jawRadius + d.springLength / 2);
    solids.push(
      box(
        `spring-${side}`,
        [springX, d.barHeight + d.springThickness / 2, 0],
        [d.springLength, d.springThickness, d.springWidth],
        'frame',
      ),
    );
    const inner = d.jawRadius - d.jawWidth;
    const point = (radius: number, angle: number): Vec2 => [side * radius * Math.sin(angle), radius * Math.cos(angle)];
    for (let index = 0; index < d.jawSegments; index++) {
      const [a0, a1] = [index, index + 1].map((step) => (step * Math.PI) / d.jawSegments) as [number, number];
      const quad = [point(d.jawRadius, a0), point(d.jawRadius, a1), point(inner, a1), point(inner, a0)];
      solids.push(slab(`jaw-${side}-${index}`, quad, [0, d.jawThickness]));
    }
    for (let index = 0; index < d.toothCount; index++) {
      const angle = ((index + 0.5) * Math.PI) / d.toothCount;
      const [z, x] = point(inner + d.jawThickness / 2, angle);
      solids.push(
        box(
          `tooth-${side}-${index}`,
          [x, d.jawThickness + d.toothHeight / 2, z],
          [d.jawThickness, d.toothHeight, d.jawThickness],
          'jaw',
        ),
      );
    }
  }
  for (let index = 0; index < d.linkCount; index++) {
    const x = -frameEnd - d.linkRadius * (1 + index * 1.6);
    solids.push({
      ...annulus(`link-${index}`, [d.linkRadius - d.linkWire, d.linkRadius], d.linkWire, 'chain'),
      origin: [x, 0, 0],
    });
  }
  return solids;
};
