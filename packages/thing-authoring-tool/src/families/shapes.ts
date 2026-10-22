import type { RevolvedSolid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { finite, minValue, pipe, string, transform } from 'valibot';

export const scalar = pipe(string(), transform(Number), finite());
export const positive = pipe(scalar, minValue(Number.MIN_VALUE));
/** Extruded solids must be convex, with the profile wound counterclockwise. */
export const requireConvex = (profile: readonly Vec2[], what: string): void => {
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    const c = profile[(i + 2) % profile.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) {
      throw new Error(`${what} needs a convex counterclockwise profile`);
    }
  }
};
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
