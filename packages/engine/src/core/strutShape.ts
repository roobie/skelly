import type { Vec3 } from './coords.ts';
import type { BlockDef } from './schema.ts';

export type StrutShape = NonNullable<BlockDef['strut']>;

export interface StrutFace {
  vertices: Vec3[];
  /** Equal-rise diagonals have sign-vector normals; consumers normalize them. */
  normal: Vec3;
}

/** A clipped diagonal prism, bounded by its owning cell, with finite-width end seats. */
export const strutFaces = (shape: StrutShape): StrutFace[] => {
  const w = shape.widthBlocks;
  const polygon = [
    [0, 0],
    [w, 0],
    [1, 1 - w],
    [1, 1],
    [1 - w, 1],
    [0, w],
  ] as const;
  const point = (u: number, y: number, t: number): Vec3 => {
    switch (shape.rise) {
      case '+x':
        return [u, y, t];
      case '-x':
        return [1 - u, y, 1 - t];
      case '+z':
        return [1 - t, y, u];
      case '-z':
        return [t, y, 1 - u];
      default:
        throw new Error('Unsupported strut rise');
    }
  };
  const low = polygon.map(([u, y]) => point(u, y, (1 - w) / 2));
  const high = polygon.map(([u, y]) => point(u, y, (1 + w) / 2));
  const faces = [[...low].reverse(), high];
  for (let i = 0; i < low.length; i++) {
    const next = (i + 1) % low.length;
    faces.push([low[i]!, low[next]!, high[next]!, high[i]!]);
  }
  return faces.map((vertices) => {
    const a = vertices[0]!;
    const b = vertices[1]!.map((v, i) => v - a[i]!) as Vec3;
    const c = vertices[2]!.map((v, i) => v - a[i]!) as Vec3;
    const normal: Vec3 = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    const scale = Math.max(...normal.map(Math.abs));
    return { vertices, normal: normal.map((v) => Math.round(v / scale)) as Vec3 };
  });
};
