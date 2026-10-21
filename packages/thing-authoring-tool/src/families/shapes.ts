import type { RevolvedSolid, Vec2 } from '@skelly/engine/shapes/solid.ts';
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
