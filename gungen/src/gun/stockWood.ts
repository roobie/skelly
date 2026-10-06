import type { Solid, Vec2 } from '../core/schema.ts';

/** Cubic Hermite graph, with endpoint slopes expressed as dy/dx. */
export const hermite = (
  x: number,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number => {
  const dx = b[0] - a[0];
  const t = (x - a[0]) / dx;
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * a[1] +
    (t ** 3 - 2 * t ** 2 + t) * dx * a[2] +
    (-2 * t ** 3 + 3 * t ** 2) * b[1] +
    (t ** 3 - t ** 2) * dx * b[2]
  );
};

/** A wooden stock's side profile and plan width along x, and how its cells merge for display. */
export interface StockContour {
  readonly top: (x: number) => number;
  readonly bottom: (x: number) => number;
  readonly halfWidth: (x: number) => number;
  readonly segments: number;
  readonly mergeGroup: string;
}

/** One convex wood cell whose sides taper linearly from its front half-width to its back half-width. */
export const woodCell = (
  { mergeGroup, id, role }: { readonly mergeGroup: string; readonly id: string; readonly role: string },
  profile: readonly Vec2[],
  width: readonly [frontX: number, frontHalf: number, backX: number, backHalf: number],
): Solid => {
  const [frontX, frontHalf, backX, backHalf] = width;
  const slope = (backHalf - frontHalf) / (backX - frontX);
  const offset = frontHalf - slope * frontX;
  const half = Math.max(frontHalf, backHalf);
  return {
    id,
    kind: 'extruded-polygon',
    profile,
    z: [-half, half],
    clip: [
      { normal: [-slope, 0, 1], offset },
      { normal: [-slope, 0, -1], offset },
    ],
    slot: 'furniture',
    display: { bevel: false, outline: false, outlineAngleDeg: 30, mergeGroup, role },
  };
};

/** A span of the stock, from `front` back to `back`, cut into convex cells at even steps and at `breaks`. */
export const woodRegion = (
  contour: StockContour,
  role: string,
  [front, back]: readonly [number, number],
  breaks: readonly number[] = [],
): Solid[] => {
  const xs = [
    ...new Set([
      ...Array.from({ length: contour.segments + 1 }, (_, i) => front + ((back - front) * i) / contour.segments),
      ...breaks,
    ]),
  ].sort((a, b) => b - a);
  return xs.slice(1).map((x, i) =>
    woodCell(
      { mergeGroup: contour.mergeGroup, id: i === 0 ? role : `${role}-${i}`, role },
      [
        [x, contour.bottom(x)],
        [xs[i]!, contour.bottom(xs[i]!)],
        [xs[i]!, contour.top(xs[i]!)],
        [x, contour.top(x)],
      ],
      [xs[i]!, contour.halfWidth(xs[i]!), x, contour.halfWidth(x)],
    ),
  );
};
