import type { BlockDef } from './schema.ts';

export type WireMeshes = (BlockDef['wireMesh'] | undefined)[];
export type Point2 = [number, number];

const clip = (polygon: Point2[], signedDistance: (point: Point2) => number): Point2[] => {
  const result: Point2[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const da = signedDistance(a);
    const db = signedDistance(b);
    if (da >= 0) {
      result.push(a);
    }
    if (da * db < 0) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
};

/** Clip diagonal wire strips to a face, leaving real holes in both colour and shadow passes. */
export const wirePolygons = (
  [u, v, width, height]: number[],
  mesh: NonNullable<BlockDef['wireMesh']>,
  emit: (polygon: Point2[]) => void,
): void => {
  const pitch = 1 / mesh.cellsPerBlock;
  const half = (pitch * mesh.wireFraction) / 2;
  const rect: Point2[] = [
    [u!, v!],
    [u! + width!, v!],
    [u! + width!, v! + height!],
    [u!, v! + height!],
  ];
  for (const sign of [-1, 1]) {
    const values = rect.map(([x, y]) => x + sign * y);
    const lo = Math.floor(Math.min(...values) / pitch);
    const hi = Math.ceil(Math.max(...values) / pitch);
    for (let i = lo; i <= hi; i++) {
      const centre = i * pitch;
      const strip = clip(
        clip(rect, ([x, y]) => x + sign * y - centre + half),
        ([x, y]) => centre + half - x - sign * y,
      );
      if (strip.length >= 3) {
        emit(strip);
      }
    }
  }
};
