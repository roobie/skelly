// Convex geometry in the assembly frame, and signed penetration depth.

import { add, applyPoint, column, cross, dot, length, scale, sub, type Transform, type Vec3 } from './math.ts';
import type { Box, ExtrudedPolygonSolid, Solid, Vec2 } from './schema.ts';

export interface Obb {
  readonly center: Vec3;
  /** Columns are the box's local axes in the assembly frame. */
  readonly r: Transform['r'];
  readonly half: Vec3;
}

export interface ConvexPolyhedron {
  readonly vertices: readonly Vec3[];
  /** Each face is a cyclic list of vertex indices. */
  readonly faces: readonly (readonly number[])[];
}

export type WorldSolid = Obb | ConvexPolyhedron;

const isPolyhedron = (shape: WorldSolid): shape is ConvexPolyhedron => 'vertices' in shape;

export const worldBox = (t: Transform, box: Box): Obb => ({
  center: applyPoint(t, box.center),
  r: t.r,
  half: box.half,
});

export const obbPolyhedron = (box: Obb): ConvexPolyhedron => {
  const vertices: Vec3[] = [];
  for (const z of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const x of [-1, 1]) {
        vertices.push([
          box.center[0] + x * box.r[0] * box.half[0] + y * box.r[1] * box.half[1] + z * box.r[2] * box.half[2],
          box.center[1] + x * box.r[3] * box.half[0] + y * box.r[4] * box.half[1] + z * box.r[5] * box.half[2],
          box.center[2] + x * box.r[6] * box.half[0] + y * box.r[7] * box.half[1] + z * box.r[8] * box.half[2],
        ]);
      }
    }
  }
  // Vertex order is (-,-,-), (+,-,-), (-,+,-), (+,+,-), then the same at +Z.
  return {
    vertices,
    faces: [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [1, 3, 7, 5],
      [3, 2, 6, 7],
      [2, 0, 4, 6],
    ],
  };
};

const extrudedPolygonPolyhedron = (t: Transform, solid: ExtrudedPolygonSolid): ConvexPolyhedron => {
  const n = solid.profile.length;
  const local = [
    ...solid.profile.map(([x, y]) => [x, y, solid.z[0]] as const),
    ...solid.profile.map(([x, y]) => [x, y, solid.z[1]] as const),
  ];
  const vertices = local.map((p) => applyPoint(t, p));
  const bottom = Array.from({ length: n }, (_, i) => n - 1 - i);
  const top = Array.from({ length: n }, (_, i) => n + i);
  const sides = Array.from({ length: n }, (_, i) => [i, (i + 1) % n, ((i + 1) % n) + n, i + n]);
  return { vertices, faces: [bottom, top, ...sides] };
};

export const worldSolid = (t: Transform, solid: Solid): WorldSolid =>
  solid.kind === 'box' ? worldBox(t, solid.box) : extrudedPolygonPolyhedron(t, solid);

const uniqueDirections = (directions: readonly Vec3[]): Vec3[] => {
  const unique: Vec3[] = [];
  for (const direction of directions) {
    const magnitude = length(direction);
    if (magnitude <= 1e-9) {
      continue;
    }
    const unit = scale(direction, 1 / magnitude);
    if (!unique.some((other) => Math.abs(dot(unit, other)) > 1 - 1e-9)) {
      unique.push(unit);
    }
  }
  return unique;
};

const edgesOf = (poly: ConvexPolyhedron): Vec3[] => {
  const edges: Vec3[] = [];
  for (const face of poly.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = poly.vertices[face[i]!]!;
      const b = poly.vertices[face[(i + 1) % face.length]!]!;
      edges.push(sub(b, a));
    }
  }
  return uniqueDirections(edges);
};

const faceNormals = (poly: ConvexPolyhedron): Vec3[] =>
  uniqueDirections(
    poly.faces.flatMap((face) => {
      if (face.length < 3) {
        return [];
      }
      const origin = poly.vertices[face[0]!]!;
      for (let i = 1; i < face.length - 1; i++) {
        const normal = cross(sub(poly.vertices[face[i]!]!, origin), sub(poly.vertices[face[i + 1]!]!, origin));
        const magnitude = length(normal);
        if (magnitude > 1e-9) {
          return [scale(normal, 1 / magnitude)];
        }
      }
      return [];
    }),
  );

/**
 * Separating-axis test for convex polyhedra. Returns signed minimum interval
 * overlap: > 0 means interpenetrating, <= 0 means separated (or touching).
 */
export const penetrationConvex = (a: ConvexPolyhedron, b: ConvexPolyhedron): number => {
  const aEdges = edgesOf(a);
  const bEdges = edgesOf(b);
  const axes: Vec3[] = [...faceNormals(a), ...faceNormals(b)];
  for (const u of aEdges) {
    for (const v of bEdges) {
      const axis = cross(u, v);
      const magnitude = length(axis);
      if (magnitude > 1e-9) {
        axes.push(scale(axis, 1 / magnitude));
      }
    }
  }

  let minimum = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    let minA = Number.POSITIVE_INFINITY;
    let maxA = Number.NEGATIVE_INFINITY;
    let minB = Number.POSITIVE_INFINITY;
    let maxB = Number.NEGATIVE_INFINITY;
    for (const point of a.vertices) {
      const projected = dot(point, axis);
      minA = Math.min(minA, projected);
      maxA = Math.max(maxA, projected);
    }
    for (const point of b.vertices) {
      const projected = dot(point, axis);
      minB = Math.min(minB, projected);
      maxB = Math.max(maxB, projected);
    }
    const centerA = (minA + maxA) / 2;
    const centerB = (minB + maxB) / 2;
    const radiusA = (maxA - minA) / 2;
    const radiusB = (maxB - minB) / 2;
    const overlap = radiusA + radiusB - Math.abs(centerB - centerA);
    minimum = Math.min(minimum, overlap);
  }
  return minimum;
};

/** Separating-axis test for two oriented boxes; retained as the fast path. */
export const penetration = (a: Obb, b: Obb): number => {
  const aAxes = [column(a.r, 0), column(a.r, 1), column(a.r, 2)] as const;
  const bAxes = [column(b.r, 0), column(b.r, 1), column(b.r, 2)] as const;
  const candidates: Vec3[] = [...aAxes, ...bAxes];
  for (const u of aAxes) {
    for (const v of bAxes) {
      const c = cross(u, v);
      const l = length(c);
      if (l > 1e-9) {
        candidates.push(scale(c, 1 / l));
      }
    }
  }
  const d = sub(b.center, a.center);
  const radius = (axes: readonly Vec3[], half: Vec3, l: Vec3): number =>
    axes.reduce((sum, axis, i) => sum + Math.abs(half[i]! * dot(axis, l)), 0);

  let min = Number.POSITIVE_INFINITY;
  for (const axis of candidates) {
    const overlap = radius(aAxes, a.half, axis) + radius(bAxes, b.half, axis) - Math.abs(dot(d, axis));
    if (overlap < min) {
      min = overlap;
    }
  }
  return min;
};

export const penetrationWorld = (a: WorldSolid, b: WorldSolid): number => {
  if (!(isPolyhedron(a) || isPolyhedron(b))) {
    return penetration(a, b);
  }
  return penetrationConvex(isPolyhedron(a) ? a : obbPolyhedron(a), isPolyhedron(b) ? b : obbPolyhedron(b));
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const distancePointTriangle = (point: Vec3, a: Vec3, b: Vec3, c: Vec3): number => {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) {
    return length(ap);
  }

  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return length(bp);
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return length(sub(point, add(a, scale(ab, v))));
  }

  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return length(cp);
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return length(sub(point, add(a, scale(ac, w))));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    return length(sub(point, add(b, scale(sub(c, b), w))));
  }

  const normal = cross(ab, ac);
  return Math.abs(dot(ap, normal)) / length(normal);
};

const closestSegmentParameters = ({
  a,
  b,
  c,
  e,
  f,
}: {
  a: number;
  b: number;
  c: number;
  e: number;
  f: number;
}): readonly [number, number] => {
  const denominator = a * e - b * b;
  const s = denominator > 1e-12 ? clamp01((b * f - c * e) / denominator) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    return [clamp01(-c / a), t];
  }
  if (t > 1) {
    t = 1;
    return [clamp01((b - c) / a), t];
  }
  return [s, t];
};

const distanceSegmentSegment = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number => {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) {
    return length(r);
  }
  if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      [s, t] = closestSegmentParameters({ a, b: dot(d1, d2), c, e, f });
    }
  }
  return length(sub(add(r, scale(d1, s)), scale(d2, t)));
};

const faceTriangles = (poly: ConvexPolyhedron): [Vec3, Vec3, Vec3][] =>
  poly.faces.flatMap((face) =>
    Array.from(
      { length: Math.max(0, face.length - 2) },
      (_, i) =>
        [poly.vertices[face[0]!]!, poly.vertices[face[i + 1]!]!, poly.vertices[face[i + 2]!]!] as [Vec3, Vec3, Vec3],
    ),
  );

const edgePairs = (poly: ConvexPolyhedron): [Vec3, Vec3][] => {
  const edges = new Map<string, [Vec3, Vec3]>();
  for (const face of poly.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % face.length]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!edges.has(key)) {
        edges.set(key, [poly.vertices[a]!, poly.vertices[b]!]);
      }
    }
  }
  return [...edges.values()];
};

/** Exact minimum Euclidean distance between two convex solids; overlapping solids have distance 0. */
export const distanceConvex = (a: ConvexPolyhedron, b: ConvexPolyhedron): number => {
  if (penetrationConvex(a, b) >= 0) {
    return 0;
  }

  const trianglesA = faceTriangles(a);
  const trianglesB = faceTriangles(b);
  let minimum = Number.POSITIVE_INFINITY;
  for (const point of a.vertices) {
    for (const [v0, v1, v2] of trianglesB) {
      minimum = Math.min(minimum, distancePointTriangle(point, v0, v1, v2));
    }
  }
  for (const point of b.vertices) {
    for (const [v0, v1, v2] of trianglesA) {
      minimum = Math.min(minimum, distancePointTriangle(point, v0, v1, v2));
    }
  }
  for (const [a0, a1] of edgePairs(a)) {
    for (const [b0, b1] of edgePairs(b)) {
      minimum = Math.min(minimum, distanceSegmentSegment(a0, a1, b0, b1));
    }
  }
  return minimum;
};

const axisAlignedBounds = (box: Obb): readonly [Vec3, Vec3] | undefined => {
  const { r, center, half } = box;
  for (let row = 0; row < 3; row++) {
    const nonzero = [r[row * 3]!, r[row * 3 + 1]!, r[row * 3 + 2]!].filter((n) => Math.abs(n) > 1e-9);
    if (nonzero.length !== 1 || Math.abs(Math.abs(nonzero[0]!) - 1) > 1e-9) {
      return undefined;
    }
  }
  const radius = [0, 1, 2].map(
    (row) =>
      Math.abs(r[row * 3]! * half[0]) + Math.abs(r[row * 3 + 1]! * half[1]) + Math.abs(r[row * 3 + 2]! * half[2]),
  ) as unknown as Vec3;
  return [
    [center[0] - radius[0], center[1] - radius[1], center[2] - radius[2]],
    [center[0] + radius[0], center[1] + radius[1], center[2] + radius[2]],
  ];
};

const distanceAabb = (a: readonly [Vec3, Vec3], b: readonly [Vec3, Vec3]): number =>
  Math.hypot(...([0, 1, 2] as const).map((axis) => Math.max(0, a[0][axis] - b[1][axis], b[0][axis] - a[1][axis])));

const worldBounds = (shape: WorldSolid): readonly [Vec3, Vec3] => {
  const vertices = isPolyhedron(shape) ? shape.vertices : obbPolyhedron(shape).vertices;
  return [
    ([0, 1, 2] as const).map((axis) => Math.min(...vertices.map((point) => point[axis]))) as unknown as Vec3,
    ([0, 1, 2] as const).map((axis) => Math.max(...vertices.map((point) => point[axis]))) as unknown as Vec3,
  ];
};

/** Cheap AABB lower bound used to cull exact convex-distance checks. */
export const lowerBoundDistanceWorld = (a: WorldSolid, b: WorldSolid): number =>
  distanceAabb(worldBounds(a), worldBounds(b));

export const distanceWorld = (a: WorldSolid, b: WorldSolid): number => {
  if (!(isPolyhedron(a) || isPolyhedron(b))) {
    const boundsA = axisAlignedBounds(a);
    const boundsB = axisAlignedBounds(b);
    if (boundsA && boundsB) {
      return distanceAabb(boundsA, boundsB);
    }
  }
  return distanceConvex(isPolyhedron(a) ? a : obbPolyhedron(a), isPolyhedron(b) ? b : obbPolyhedron(b));
};

const orient = (a: Vec2, b: Vec2, c: Vec2): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Vec2, b: Vec2, p: Vec2): boolean =>
  p[0] >= Math.min(a[0], b[0]) - 1e-10 &&
  p[0] <= Math.max(a[0], b[0]) + 1e-10 &&
  p[1] >= Math.min(a[1], b[1]) - 1e-10 &&
  p[1] <= Math.max(a[1], b[1]) + 1e-10;
const segmentsIntersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  if (
    ((abC > 1e-10 && abD < -1e-10) || (abC < -1e-10 && abD > 1e-10)) &&
    ((cdA > 1e-10 && cdB < -1e-10) || (cdA < -1e-10 && cdB > 1e-10))
  ) {
    return true;
  }
  return (
    (Math.abs(abC) <= 1e-10 && onSegment(a, b, c)) ||
    (Math.abs(abD) <= 1e-10 && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= 1e-10 && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= 1e-10 && onSegment(c, d, b))
  );
};

const validateProfileVertices = (profile: readonly Vec2[]): string | undefined => {
  if (profile.length < 3) {
    return 'profile needs at least three vertices';
  }
  if (profile.some((p) => !Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    return 'profile coordinates must be finite 2D vertices';
  }
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= 1e-10) {
      return 'profile has a repeated adjacent vertex or zero-length edge';
    }
    for (const point of profile.slice(i + 1)) {
      if (a[0] === point[0] && a[1] === point[1]) {
        return 'profile has a repeated vertex and is self-intersecting';
      }
    }
  }
  return undefined;
};

const hasSelfIntersectingEdges = (profile: readonly Vec2[]): boolean => {
  for (let i = 0; i < profile.length; i++) {
    const iNext = (i + 1) % profile.length;
    for (let j = i + 1; j < profile.length; j++) {
      const jNext = (j + 1) % profile.length;
      if (iNext === j || jNext === i) {
        continue;
      }
      if (segmentsIntersect(profile[i]!, profile[iNext]!, profile[j]!, profile[jNext]!)) {
        return true;
      }
    }
  }
  return false;
};

const validateProfileConvexity = (profile: readonly Vec2[]): string | undefined => {
  let twiceArea = 0;
  let turnSign = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    const c = profile[(i + 2) % profile.length]!;
    twiceArea += a[0] * b[1] - b[0] * a[1];
    const turn = orient(a, b, c);
    if (Math.abs(turn) > 1e-10) {
      const sign = Math.sign(turn);
      if (turnSign !== 0 && sign !== turnSign) {
        return 'profile must be convex';
      }
      turnSign = sign;
    }
  }
  if (Math.abs(twiceArea) <= 1e-10 || turnSign === 0) {
    return 'profile has zero area';
  }
  if (twiceArea < 0) {
    return 'profile vertices must be counter-clockwise';
  }
  return undefined;
};

/** Returns a structural-error explanation, or undefined for a valid extrusion. */
export const validateExtrudedPolygon = (profile: readonly Vec2[], z: readonly [number, number]): string | undefined => {
  if (!Array.isArray(profile)) {
    return 'profile must be an array of vertices';
  }
  if (!Array.isArray(z) || z.length !== 2) {
    return 'extrusion bounds must contain exactly two values';
  }
  const vertexError = validateProfileVertices(profile);
  if (vertexError) {
    return vertexError;
  }
  if (!(Number.isFinite(z[0]) && Number.isFinite(z[1])) || z[1] <= z[0]) {
    return 'extrusion bounds must be finite and have positive depth';
  }
  if (hasSelfIntersectingEdges(profile)) {
    return 'profile is self-intersecting';
  }
  return validateProfileConvexity(profile);
};

export const boxFromMinMax = (min: Vec3, max: Vec3): Box => ({
  center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
});
