import type { ConvexPolyhedron } from './geometry.ts';
import { cross, dot, length, mulMV, normalize, rotX, sub, type Vec3 } from './math.ts';

const normals = (poly: ConvexPolyhedron): Vec3[] =>
  poly.faces
    .map((face) =>
      cross(
        sub(poly.vertices[face[1]!]!, poly.vertices[face[0]!]!),
        sub(poly.vertices[face[2]!]!, poly.vertices[face[0]!]!),
      ),
    )
    .filter((axis) => length(axis) > 1e-9);
const edges = (poly: ConvexPolyhedron): Vec3[] =>
  poly.faces
    .flatMap((face) => face.map((v, i) => sub(poly.vertices[face[(i + 1) % face.length]!]!, poly.vertices[v]!)))
    .filter((axis) => length(axis) > 1e-9);
const uniqueAxes = (axes: readonly Vec3[]): Vec3[] => {
  const seen = new Set<string>();
  return axes
    .filter((axis) => length(axis) > 1e-9)
    .map(normalize)
    .filter((axis) => {
      const sign = axis.find((v) => Math.abs(v) > 1e-9)! < 0 ? -1 : 1;
      const key = axis.map((v) => Math.round(v * sign * 1e6)).join(',');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};
const axesBetween = (a: ConvexPolyhedron, b: ConvexPolyhedron): Vec3[] =>
  uniqueAxes([...normals(a), ...normals(b), ...edges(a).flatMap((u) => edges(b).map((v) => cross(u, v)))]);
const projection = (poly: ConvexPolyhedron, axis: Vec3): readonly [number, number] => {
  const values = poly.vertices.map((v) => dot(v, axis));
  return [Math.min(...values), Math.max(...values)];
};
const disjoint = (a: readonly [number, number], b: readonly [number, number], tolerance: number): boolean =>
  a[1] <= b[0] + tolerance || b[1] <= a[0] + tolerance;

/** Exact convex translation sweep: includes the side planes and edges added by the displacement. */
export const translationSweepClear = (
  moving: ConvexPolyhedron,
  fixed: ConvexPolyhedron,
  delta: Vec3,
  tolerance = 1e-6,
): boolean => {
  if (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ].some((raw) => {
      const axis = raw as unknown as Vec3;
      const span = projection(moving, axis);
      const offset = dot(delta, axis);
      return disjoint(
        [span[0] + Math.min(0, offset), span[1] + Math.max(0, offset)],
        projection(fixed, axis),
        tolerance,
      );
    })
  ) {
    return true;
  }
  const axes = uniqueAxes([
    ...axesBetween(moving, fixed),
    ...edges(moving).map((edge) => cross(edge, delta)),
    ...edges(fixed).map((edge) => cross(edge, delta)),
  ]);
  return axes.some((axis) => {
    const span = projection(moving, axis);
    const offset = dot(delta, axis);
    return disjoint([span[0] + Math.min(0, offset), span[1] + Math.max(0, offset)], projection(fixed, axis), tolerance);
  });
};
const rotated = (poly: ConvexPolyhedron, degrees: number): ConvexPolyhedron => ({
  ...poly,
  vertices: poly.vertices.map((v) => mulMV(rotX(degrees), v)),
});

/** Exact projection bounds for a rigid X-axis rotation interval, including internal trigonometric extrema. */
const rotationProjection = (
  poly: ConvexPolyhedron,
  axis: Vec3,
  low: number,
  high: number,
): readonly [number, number] => {
  const values = poly.vertices.flatMap(([x, y, z]) => {
    const a = axis[1] * y + axis[2] * z;
    const b = axis[2] * y - axis[1] * z;
    const extrema = Math.atan2(b, a);
    const angles = [low, high];
    for (let k = -2; k <= 2; k++) {
      const angle = extrema + k * Math.PI;
      if (angle > low && angle < high) {
        angles.push(angle);
      }
    }
    return angles.map((angle) => axis[0] * x + a * Math.cos(angle) + b * Math.sin(angle));
  });
  return [Math.min(...values), Math.max(...values)];
};

/** Certifies the entire arc using interval separating planes, not pose samples. Unproved sub-intervals refuse. */
export const rotationSweepClear = (
  moving: ConvexPolyhedron,
  fixed: ConvexPolyhedron,
  intervalDegrees: readonly [number, number],
  tolerance = 1e-6,
): boolean => {
  const [fromDegrees, toDegrees] = intervalDegrees;
  if (!(Number.isFinite(fromDegrees) && Number.isFinite(toDegrees)) || Math.abs(toDegrees - fromDegrees) > 180) {
    throw new Error('rotation sweep interval exceeds 180 degrees');
  }
  const visit = (low: number, high: number): boolean => {
    if (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ].some((raw) =>
        disjoint(
          rotationProjection(moving, raw as unknown as Vec3, (low * Math.PI) / 180, (high * Math.PI) / 180),
          projection(fixed, raw as unknown as Vec3),
          tolerance,
        ),
      )
    ) {
      return true;
    }
    const lowShape = rotated(moving, low);
    const highShape = rotated(moving, high);
    const axes = uniqueAxes([...axesBetween(lowShape, fixed), ...axesBetween(highShape, fixed)]);
    const certified = axes.some((axis) =>
      disjoint(
        rotationProjection(moving, axis, (low * Math.PI) / 180, (high * Math.PI) / 180),
        projection(fixed, axis),
        tolerance,
      ),
    );
    if (certified) {
      return true;
    }
    if (high - low <= 0.05) {
      return false;
    }
    const mid = (low + high) / 2;
    return visit(low, mid) && visit(mid, high);
  };
  return visit(Math.min(fromDegrees, toDegrees), Math.max(fromDegrees, toDegrees));
};
