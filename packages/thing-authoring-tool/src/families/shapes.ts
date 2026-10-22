import type { ExtrudedPolygonSolid, RevolvedSolid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { finite, minValue, pipe, string, transform } from 'valibot';

export const scalar = pipe(string(), transform(Number), finite());
export const positive = pipe(scalar, minValue(Number.MIN_VALUE));
export const revolve = (id: string, profile: readonly Vec2[], slot = 'body'): RevolvedSolid => ({
  id,
  kind: 'revolved',
  axis: 'y',
  profile,
  slot,
});
export const cylinder = (id: string, radius: number, height: number, slot = 'body') =>
  revolve(
    id,
    [
      [0, 0],
      [0, radius],
      [height, radius],
      [height, 0],
      [0, 0],
    ],
    slot,
  );
export const strip = (id: string, points: readonly Vec2[], [width, depth]: readonly [number, number], slot = 'body') =>
  points.slice(1).map((end, i): ExtrudedPolygonSolid => {
    const start = points[i]!;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length === 0) {
      throw new Error(`${id} segment needs length`);
    }
    const dx = ((-(end[1] - start[1]) / length) * width) / 2;
    const dy = (((end[0] - start[0]) / length) * width) / 2;
    return {
      id: `${id}-${i}`,
      kind: 'extruded-polygon',
      profile: [
        [start[0] + dx, start[1] + dy],
        [start[0] - dx, start[1] - dy],
        [end[0] - dx, end[1] - dy],
        [end[0] + dx, end[1] + dy],
      ],
      z: [-depth / 2, depth / 2],
      slot,
    };
  });
export const annulus = (id: string, [inner, outer]: readonly [number, number], height: number, slot = 'body') =>
  revolve(
    id,
    [
      [0, inner],
      [0, outer],
      [height, outer],
      [height, inner],
      [0, inner],
    ],
    slot,
  );
