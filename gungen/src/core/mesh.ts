// Turns placed solids into flat-shaded triangle meshes (PROJECT.md §7). No
// rendering dependency: positions, normals and indices only, in the solid's
// own local frame (the caller applies the part's placement transform, same
// as it already does for box/extruded-polygon geometry). Deadvox can import
// this directly, without three.js.
//
// Every edge gets a small inward chamfer, so the mesh's bounding box always
// equals the solid's own extent exactly: nothing a bevel touches can grow a
// part. Boxes and extrusions use the same canonical Z-prism chamfer; explicit
// X/Y extrusion axes are then mapped through right-handed coordinate cycles.

import { GRID } from './conventions.ts';
import {
  boundsOfPoints,
  type ConvexPolyhedron,
  cleanPolygon,
  clipPolygon as clipPolygonByPlane,
  clippedExtrudedPolygonPolyhedron,
  localSolidBounds,
  obbPolyhedron,
  polygonArea,
  worldBox,
} from './geometry.ts';
import { add, cross, dot, type ExtrusionAxis, extrusionPoint, IDENTITY, normalize, sub, type Vec3 } from './math.ts';
import { DEFAULT_REVOLVE_FACETS, meshForRevolved } from './revolve.ts';
import type { Box, DomainUnits, Solid, Vec2 } from './schema.ts';

export interface TriangleMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
}

// The gun domain's chamfer size (`GUN_UNITS.bevel`); a domain declares its own in `Domain.units.bevel`.
// Chamfer size: half a grid step (PROJECT.md §4). A quarter grid step (the
// first value tried here) was too fine to read as a bevel at gungen's scale
// (5.5u ≈ 63mm, so 1u ≈ 11.5mm: a quarter step is under 1mm); half a step
// (≈1.4mm) reads clearly in the viewer while staying small next to most
// parts' multi-u dimensions. Clamped per solid, see `clampBevel`.
export const BEVEL = GRID / 2;

/** Keep the chamfer well inside the geometric limit that would invert a face. */
const CLAMP_FRACTION = 0.4;

// ---- local 2D helpers (math.ts is 3D-only) ----

const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale2 = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
const norm2 = (a: Vec2): Vec2 => {
  const l = Math.hypot(a[0], a[1]);
  return l < 1e-12 ? a : [a[0] / l, a[1] / l];
};
/** Outward normal of a CCW polygon edge with unit direction `d`. */
const edgeNormal2 = (d: Vec2): Vec2 => [d[1], -d[0]];
const p3 = (xy: Vec2, z: number): Vec3 => [xy[0], xy[1], z];

/** Where two 2D lines (point + direction) cross; falls back to their midpoint if near-parallel. */
const intersect2D = (p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 => {
  const denom = cross2(d1, d2);
  if (Math.abs(denom) < 1e-9) {
    return scale2(add2(p1, p2), 0.5);
  }
  const t = cross2(sub2(p2, p1), d2) / denom;
  return add2(p1, scale2(d1, t));
};

// ---- flat-shaded mesh accumulation ----

/** Accumulates planar polygon faces into one flat-shaded (per-face-unique-vertex) mesh. */
class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];

  /** Adds a planar convex polygon (>= 3 points, already wound so its cross product points outward). */
  face(points: readonly Vec3[]): void {
    const normal = normalize(this.areaVector(points));
    const base = this.appendFaceVertices(points, normal);
    if (this.fanHasDegenerateTriangle(points, normal)) {
      this.appendCentroidFan(points, normal, base);
    } else {
      this.appendFaceFan(points.length, base);
    }
  }

  private areaVector(points: readonly Vec3[]): Vec3 {
    let areaVector: Vec3 = [0, 0, 0];
    for (let i = 0; i < points.length; i++) {
      areaVector = add(areaVector, cross(points[i]!, points[(i + 1) % points.length]!));
    }
    return areaVector;
  }

  private appendFaceVertices(points: readonly Vec3[], normal: Vec3): number {
    const base = this.positions.length / 3;
    for (const point of points) {
      this.positions.push(...point);
      this.normals.push(...normal);
    }
    return base;
  }

  private fanHasDegenerateTriangle(points: readonly Vec3[], normal: Vec3): boolean {
    return points
      .slice(1, -1)
      .some(
        (point, index) =>
          Math.abs(dot(cross(sub(point, points[0]!), sub(points[index + 2]!, points[0]!)), normal)) <= 1e-12,
      );
  }

  private appendFaceFan(count: number, base: number): void {
    for (let i = 1; i < count - 1; i++) {
      this.indices.push(base, base + i, base + i + 1);
    }
  }

  private appendCentroidFan(points: readonly Vec3[], normal: Vec3, base: number): void {
    const center: Vec3 = [0, 1, 2].map(
      (axis) => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length,
    ) as unknown as Vec3;
    const centerIndex = this.positions.length / 3;
    this.positions.push(...center);
    this.normals.push(...normal);
    for (let i = 0; i < points.length; i++) {
      const next = (i + 1) % points.length;
      const area = dot(cross(sub(points[i]!, center), sub(points[next]!, center)), normal);
      if (Math.abs(area) > 1e-12) {
        this.indices.push(centerIndex, area > 0 ? base + i : base + next, area > 0 ? base + next : base + i);
      }
    }
  }

  /** Adds a face, reversing its winding first if that would point away from `outwardHint`. */
  orientedFace(points: readonly Vec3[], outwardHint: Vec3): void {
    const normal = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!));
    const facing = normal[0] * outwardHint[0] + normal[1] * outwardHint[1] + normal[2] * outwardHint[2];
    this.face(facing < 0 ? [...points].reverse() : points);
  }

  build(): TriangleMesh {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
      triangleCount: this.indices.length / 3,
    };
  }
}

/** The unbeveled prism: 2 caps + N sides. Used when a solid is too thin for any bevel to fit. */
const plainPrism = (builder: MeshBuilder, profile: readonly Vec2[], z: readonly [number, number]): void => {
  const n = profile.length;
  builder.face(profile.map((pt) => p3(pt, z[1])));
  builder.face([...profile].reverse().map((pt) => p3(pt, z[0])));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    builder.face([p3(profile[i]!, z[0]), p3(profile[j]!, z[0]), p3(profile[j]!, z[1]), p3(profile[i]!, z[1])]);
  }
};

/** The largest bevel that cannot invert this profile/z-depth's shortest edge, apothem or half-depth. */
const clampBevel = (profile: readonly Vec2[], z: readonly [number, number], bevel: number): number => {
  const n = profile.length;
  const cx = profile.reduce((s, v) => s + v[0], 0) / n;
  const cy = profile.reduce((s, v) => s + v[1], 0) / n;
  let limit = (z[1] - z[0]) / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edge = sub2(profile[j]!, profile[i]!);
    limit = Math.min(limit, Math.hypot(edge[0], edge[1]) / 2);
    const normal = edgeNormal2(norm2(edge));
    // Perpendicular distance from the centroid to this edge's line: the room the offset polygon has.
    limit = Math.min(limit, Math.abs((profile[i]![0] - cx) * normal[0] + (profile[i]![1] - cy) * normal[1]));
  }
  return Math.max(0, Math.min(bevel, CLAMP_FRACTION * limit));
};

/**
 * A convex CCW profile extruded along local Z, with every edge chamfered:
 * the N side faces and 2 caps inset by `bevel`, the N vertical edges and 2N
 * cap-perimeter edges beveled, and the 2N corners capped with a triangle.
 * For a box (N = 4) this is exactly 6 inset faces + 12 edge chamfers + 8
 * corner triangles (44 triangles).
 *
 * Every face is built from one of three shared point families per vertex i
 * (`q[i]`, `pMinus[i]`, `pPlus[i]`, computed once below) plus the shared z
 * levels (z0, zLo, zHi, z1), so two faces meeting along an edge always
 * reference the exact same coordinates there — no gap or T-junction, even
 * though each face still gets its own copy of those vertices for flat
 * shading. In particular, a cap-perimeter chamfer's outer edge is the cap's
 * own boundary (`q[i]`-`q[j]` at z0/z1), not a point on the original profile
 * edge: that is what welds it to the cap face rather than leaving a slit.
 */
const chamferedPrism = (profile: readonly Vec2[], z: readonly [number, number], rawBevel: number): TriangleMesh => {
  const builder = new MeshBuilder();
  const bevel = clampBevel(profile, z, rawBevel);
  if (bevel < 1e-9) {
    plainPrism(builder, profile, z);
    return builder.build();
  }

  const n = profile.length;
  const edgeDirs = profile.map((v, i) => norm2(sub2(profile[(i + 1) % n]!, v)));
  const edgeNormals = edgeDirs.map(edgeNormal2);
  const cx = profile.reduce((s, v) => s + v[0], 0) / n;
  const cy = profile.reduce((s, v) => s + v[1], 0) / n;

  // Points inset by `bevel` from each vertex, along its outgoing (+) and incoming (-) edge.
  const pPlus = profile.map((v, i) => add2(v, scale2(edgeDirs[i]!, bevel)));
  const pMinus = profile.map((v, i) => sub2(v, scale2(edgeDirs[(i - 1 + n) % n]!, bevel)));
  // The profile offset inward by `bevel` on every edge: the cap footprint.
  const q = profile.map((v, i) => {
    const prev = (i - 1 + n) % n;
    return intersect2D(
      sub2(v, scale2(edgeNormals[prev]!, bevel)),
      edgeDirs[prev]!,
      sub2(v, scale2(edgeNormals[i]!, bevel)),
      edgeDirs[i]!,
    );
  });

  const [z0, z1] = z;
  const zLo = z0 + bevel;
  const zHi = z1 - bevel;

  builder.face(q.map((pt) => p3(pt, z1)));
  builder.face([...q].reverse().map((pt) => p3(pt, z0)));

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [nx, ny] = edgeNormals[i]!;
    builder.orientedFace(
      [p3(pPlus[i]!, zLo), p3(pMinus[j]!, zLo), p3(pMinus[j]!, zHi), p3(pPlus[i]!, zHi)],
      [nx, ny, 0],
    );
    // The outer (z0/z1) edge of these two lies on the CAP's own boundary (q[i]-q[j]),
    // not on the original profile edge: that's what welds them to the cap face below.
    builder.orientedFace([p3(q[i]!, z1), p3(q[j]!, z1), p3(pMinus[j]!, zHi), p3(pPlus[i]!, zHi)], [nx, ny, 1]);
    builder.orientedFace([p3(q[i]!, z0), p3(q[j]!, z0), p3(pMinus[j]!, zLo), p3(pPlus[i]!, zLo)], [nx, ny, -1]);
  }

  for (let i = 0; i < n; i++) {
    const [hx, hy] = norm2(sub2(profile[i]!, [cx, cy]));
    builder.orientedFace(
      [p3(pMinus[i]!, zLo), p3(pPlus[i]!, zLo), p3(pPlus[i]!, zHi), p3(pMinus[i]!, zHi)],
      [hx, hy, 0],
    );
    builder.orientedFace([p3(q[i]!, z1), p3(pMinus[i]!, zHi), p3(pPlus[i]!, zHi)], [hx, hy, 1]);
    builder.orientedFace([p3(q[i]!, z0), p3(pPlus[i]!, zLo), p3(pMinus[i]!, zLo)], [hx, hy, -1]);
  }

  return builder.build();
};

const boxProfile = (box: Box): { profile: Vec2[]; z: [number, number] } => {
  const { center: c, half: h } = box;
  return {
    profile: [
      [c[0] - h[0], c[1] - h[1]],
      [c[0] + h[0], c[1] - h[1]],
      [c[0] + h[0], c[1] + h[1]],
      [c[0] - h[0], c[1] + h[1]],
    ],
    z: [c[2] - h[2], c[2] + h[2]],
  };
};

const orientExtrusion = (mesh: TriangleMesh, axis: ExtrusionAxis | undefined): TriangleMesh => {
  if (!axis || axis === 'z') {
    return mesh;
  }
  const mapTriples = (source: Float32Array): Float32Array => {
    const result = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      const mapped = extrusionPoint(axis, [source[i]!, source[i + 1]!], source[i + 2]!);
      result.set(mapped, i);
    }
    return result;
  };
  return { ...mesh, positions: mapTriples(mesh.positions), normals: mapTriples(mesh.normals) };
};

/** The bevel a solid is drawn with in a domain: the domain's, unless the solid opts out. */
export const displayBevel = (solid: Solid, units: DomainUnits): number =>
  solid.display?.bevel === false ? 0 : units.bevel;

/**
 * A display mesh for one solid, in its own local frame: flat-shaded for boxes and extrusions, smooth
 * around the circumference for a revolved solid. `bevel` applies to boxes and extrusions only, and
 * `revolveFacets` (a level of detail) to revolved solids only.
 */
const translateMesh = (mesh: TriangleMesh, origin: Vec3 | undefined): TriangleMesh => {
  if (!origin) {
    return mesh;
  }
  for (let index = 0; index < mesh.positions.length; index++) {
    const offset = origin[index % 3]!;
    if (offset !== 0) {
      mesh.positions[index] = mesh.positions[index]! + offset;
    }
  }
  return mesh;
};

export const meshForSolid = (
  solid: Solid,
  bevel: number = solid.display?.bevel === false ? 0 : BEVEL,
  revolveFacets: number = DEFAULT_REVOLVE_FACETS,
): TriangleMesh => {
  if (solid.kind === 'revolved') {
    return translateMesh(orientExtrusion(meshForRevolved(solid, revolveFacets), solid.axis), solid.origin);
  }
  if (solid.kind === 'extruded-polygon' && solid.clip?.length && solid.display?.bevel !== false) {
    throw new Error(`Solid "${solid.id}" has clip planes; set display.bevel to false explicitly.`);
  }
  if (solid.kind === 'box') {
    const { profile, z } = boxProfile(solid.box);
    return chamferedPrism(profile, z, bevel);
  }
  if (solid.clip?.length) {
    const polyhedron = clippedExtrudedPolygonPolyhedron(solid);
    if (!polyhedron) {
      throw new Error(`Solid "${solid.id}" clips to an empty or degenerate mesh.`);
    }
    const builder = new MeshBuilder();
    for (const face of polyhedron.faces) {
      builder.face(face.map((index) => polyhedron.vertices[index]!));
    }
    return builder.build();
  }
  return orientExtrusion(chamferedPrism(solid.profile, solid.z, bevel), solid.axis);
};

const GROUP_WELD_TOLERANCE_U = 1e-5;
const weldCoordinate = (coordinate: number): number =>
  Math.round(coordinate / GROUP_WELD_TOLERANCE_U) * GROUP_WELD_TOLERANCE_U;
const weldPoint = (point: Vec3): Vec3 => [weldCoordinate(point[0]), weldCoordinate(point[1]), weldCoordinate(point[2])];
const weldKey = (point: Vec3): string => point.map((coordinate) => weldCoordinate(coordinate).toFixed(5)).join(',');

interface HalfSpace {
  readonly normal: Vec3;
  readonly offset: number;
}
interface SurfacePolygon {
  readonly points: readonly Vec3[];
  readonly normal: Vec3;
}
interface MeshGroupBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
  readonly vertexByPositionNormal: Map<string, number>;
  readonly triangleKeys: Set<string>;
}

const polyhedronSurfaceFaces = (polyhedron: ConvexPolyhedron, swapCaps = false): SurfacePolygon[] => {
  const center = [0, 1, 2].map(
    (axis) => polyhedron.vertices.reduce((sum, point) => sum + point[axis]!, 0) / polyhedron.vertices.length,
  ) as unknown as Vec3;
  const faces = [...polyhedron.faces];
  if (swapCaps && faces.length > 1) {
    [faces[0], faces[1]] = [faces[1]!, faces[0]!];
  }
  return faces.flatMap((face) => {
    const points = face.map((index) => polyhedron.vertices[index]!);
    let normal = normalize(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
    let offset = dot(normal, points[0]!);
    if (dot(normal, center) > offset) {
      normal = [-normal[0], -normal[1], -normal[2]];
      offset = -offset;
      points.reverse();
    }
    return [{ points, normal }];
  });
};

const halfSpacesFromPolyhedron = (polyhedron: ConvexPolyhedron, swapCaps = false): HalfSpace[] => {
  const planes = new Map<string, HalfSpace>();
  for (const face of polyhedronSurfaceFaces(polyhedron, swapCaps)) {
    const plane = { normal: face.normal, offset: dot(face.normal, face.points[0]!) };
    planes.set(`${weldKey(plane.normal)}|${weldCoordinate(plane.offset).toFixed(5)}`, plane);
  }
  return [...planes.values()];
};

const clipPolygon = (polygon: readonly Vec3[], plane: HalfSpace, keepInside: boolean): Vec3[] =>
  clipPolygonByPlane(polygon, plane, keepInside, GROUP_WELD_TOLERANCE_U);

/** Subtract one convex piece from a planar convex polygon, returning disjoint survivors. */
const subtractConvexPiece = (polygon: readonly Vec3[], planes: readonly HalfSpace[]): Vec3[][] => {
  let intersection = [cleanPolygon(polygon)];
  const survivors: Vec3[][] = [];
  for (const plane of planes) {
    const nextIntersection: Vec3[][] = [];
    for (const part of intersection) {
      const inside = clipPolygon(part, plane, true);
      const outside = clipPolygon(part, plane, false);
      if (outside.length > 0) {
        survivors.push(outside);
      }
      if (inside.length > 0) {
        nextIntersection.push(inside);
      }
    }
    intersection = nextIntersection;
    if (intersection.length === 0) {
      break;
    }
  }
  return survivors;
};

const pointsOnEdge = (a: Vec3, b: Vec3, candidates: readonly Vec3[]): Vec3[] => {
  const direction = sub(b, a);
  const lengthSquared = dot(direction, direction);
  if (lengthSquared <= GROUP_WELD_TOLERANCE_U ** 2) {
    return [];
  }
  const edgeLength = Math.sqrt(lengthSquared);
  return candidates
    .map((point) => {
      const along = dot(sub(point, a), direction) / lengthSquared;
      const nearest: Vec3 = [a[0] + direction[0] * along, a[1] + direction[1] * along, a[2] + direction[2] * along];
      const distance = Math.hypot(point[0] - nearest[0], point[1] - nearest[1], point[2] - nearest[2]);
      return { point, along, distance };
    })
    .filter(
      ({ along, distance }) =>
        along > GROUP_WELD_TOLERANCE_U / edgeLength &&
        along < 1 - GROUP_WELD_TOLERANCE_U / edgeLength &&
        distance <= GROUP_WELD_TOLERANCE_U,
    )
    .sort((left, right) => left.along - right.along)
    .map(({ point }) => point);
};

const polygonBoundaryWithTJunctions = (polygon: readonly Vec3[], vertices: readonly Vec3[]): Vec3[] => {
  const boundary: Vec3[] = [];
  for (let edge = 0; edge < polygon.length; edge++) {
    const a = polygon[edge]!;
    const b = polygon[(edge + 1) % polygon.length]!;
    boundary.push(a, ...pointsOnEdge(a, b, vertices));
  }
  return boundary;
};

const appendFlatTriangle = (points: readonly Vec3[], normal: Vec3, output: MeshGroupBuffers): void => {
  const triangleKey = points
    .map((point) => weldKey(weldPoint(point)))
    .sort()
    .join('|');
  if (output.triangleKeys.has(triangleKey)) {
    return;
  }
  output.triangleKeys.add(triangleKey);
  for (const point of points) {
    const welded = weldPoint(point);
    const key = `${weldKey(welded)}|${weldKey(normal)}`;
    let index = output.vertexByPositionNormal.get(key);
    if (index === undefined) {
      index = output.positions.length / 3;
      output.vertexByPositionNormal.set(key, index);
      output.positions.push(...welded);
      output.normals.push(...normal);
    }
    output.indices.push(index);
  }
};

const triangleArea = (a: Vec3, b: Vec3, c: Vec3, normal: Vec3): number => dot(cross(sub(b, a), sub(c, a)), normal);

const convexEarAt = (points: readonly Vec3[], index: number, normal: Vec3): boolean => {
  const previous = points[(index + points.length - 1) % points.length]!;
  const current = points[index]!;
  const next = points[(index + 1) % points.length]!;
  if (triangleArea(previous, current, next, normal) <= GROUP_WELD_TOLERANCE_U ** 2) {
    return false;
  }
  if (points.length !== 4) {
    return true;
  }
  const final = [1, 2, 3].map((offset) => points[(index + offset) % points.length]!);
  return triangleArea(final[0]!, final[1]!, final[2]!, normal) > GROUP_WELD_TOLERANCE_U ** 2;
};

const removeCollinearBoundaryVertices = (boundary: readonly Vec3[], normal: Vec3): Vec3[] => {
  const points = [...boundary];
  let removed = true;
  while (removed && points.length > 3) {
    const index = points.findIndex((current, i) => {
      const previous = points[(i + points.length - 1) % points.length]!;
      const next = points[(i + 1) % points.length]!;
      const chord = sub(next, previous);
      const collinearTolerance = GROUP_WELD_TOLERANCE_U * Math.hypot(chord[0], chord[1], chord[2]);
      return (
        Math.abs(triangleArea(previous, current, next, normal)) <= collinearTolerance &&
        dot(sub(current, previous), sub(next, current)) > 0
      );
    });
    removed = index >= 0;
    if (removed) {
      points.splice(index, 1);
    }
  }
  return points;
};

const triangulateConvexBoundary = (boundary: readonly Vec3[], normal: Vec3): [Vec3, Vec3, Vec3][] => {
  const remaining = removeCollinearBoundaryVertices(boundary, normal);
  const triangles: [Vec3, Vec3, Vec3][] = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((_, index) => convexEarAt(remaining, index, normal));
    if (ear < 0) {
      return [];
    }
    triangles.push([
      remaining[(ear + remaining.length - 1) % remaining.length]!,
      remaining[ear]!,
      remaining[(ear + 1) % remaining.length]!,
    ]);
    remaining.splice(ear, 1);
  }
  if (triangleArea(remaining[0]!, remaining[1]!, remaining[2]!, normal) > GROUP_WELD_TOLERANCE_U ** 2) {
    triangles.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  }
  return triangles;
};

const appendSurfacePolygon = (surface: SurfacePolygon, vertices: readonly Vec3[], output: MeshGroupBuffers): void => {
  const boundary = cleanPolygon(polygonBoundaryWithTJunctions(surface.points, vertices).map(weldPoint));
  const triangles = triangulateConvexBoundary(boundary, surface.normal);
  for (const triangle of triangles) {
    appendFlatTriangle(triangle, surface.normal, output);
  }
};

interface SolidMeshContext {
  readonly halfSpaces: readonly HalfSpace[][];
  readonly vertices: readonly (readonly Vec3[])[];
  readonly bounds: readonly (readonly [Vec3, Vec3])[];
}

const subtractFaceByOtherPieces = (
  face: SurfacePolygon,
  ownerIndex: number,
  context: SolidMeshContext,
): SurfacePolygon[] => {
  const { halfSpaces, vertices, bounds } = context;
  const faceBounds = boundsOfPoints(face.points);
  let fragments: Vec3[][] = [cleanPolygon(face.points)];
  const faceOffset = dot(face.normal, face.points[0]!);
  for (let other = 0; other < halfSpaces.length && fragments.length > 0; other++) {
    if (
      other === ownerIndex ||
      !boundsOverlap(faceBounds, bounds[other]!) ||
      liesStrictlyOnOneSide(face, vertices[other]!)
    ) {
      continue;
    }
    const ownsCoplanarPatch =
      other > ownerIndex &&
      halfSpaces[other]!.some(
        (plane) =>
          dot(face.normal, plane.normal) > 1 - 1e-8 && Math.abs(faceOffset - plane.offset) <= GROUP_WELD_TOLERANCE_U,
      );
    if (!ownsCoplanarPatch) {
      fragments = fragments.flatMap((fragment) => subtractConvexPiece(fragment, halfSpaces[other]!));
    }
  }
  return fragments
    .filter((points) => polygonArea(points) > GROUP_WELD_TOLERANCE_U ** 2)
    .map((points) => ({ points, normal: face.normal }));
};

const boundsOverlap = (a: readonly [Vec3, Vec3], b: readonly [Vec3, Vec3]): boolean =>
  [0, 1, 2].every(
    (axis) =>
      a[0][axis]! <= b[1][axis]! + GROUP_WELD_TOLERANCE_U && a[1][axis]! >= b[0][axis]! - GROUP_WELD_TOLERANCE_U,
  );

const liesStrictlyOnOneSide = (face: SurfacePolygon, vertices: readonly Vec3[]): boolean => {
  const faceOffset = dot(face.normal, face.points[0]!);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const point of vertices) {
    const distance = dot(face.normal, point) - faceOffset;
    minimum = Math.min(minimum, distance);
    maximum = Math.max(maximum, distance);
    if (minimum <= GROUP_WELD_TOLERANCE_U && maximum >= -GROUP_WELD_TOLERANCE_U) {
      return false;
    }
  }
  return minimum > GROUP_WELD_TOLERANCE_U || maximum < -GROUP_WELD_TOLERANCE_U;
};

const boundarySurfaces = (
  polyhedra: readonly ConvexPolyhedron[],
  halfSpaces: readonly HalfSpace[][],
  swapCaps: readonly boolean[],
): SurfacePolygon[] => {
  const vertices = polyhedra.map((polyhedron) => polyhedron.vertices);
  const context: SolidMeshContext = {
    halfSpaces,
    vertices,
    bounds: vertices.map(boundsOfPoints),
  };
  return polyhedra.flatMap((polyhedron, ownerIndex) =>
    polyhedronSurfaceFaces(polyhedron, swapCaps[ownerIndex]).flatMap((face) =>
      subtractFaceByOtherPieces(face, ownerIndex, context),
    ),
  );
};

const addGroupVertex = (output: MeshGroupBuffers, point: Vec3, normal: Vec3): number => {
  const welded = weldPoint(point);
  const key = `${weldKey(welded)}|${weldKey(normal)}`;
  let index = output.vertexByPositionNormal.get(key);
  if (index === undefined) {
    index = output.positions.length / 3;
    output.vertexByPositionNormal.set(key, index);
    output.positions.push(...welded);
    output.normals.push(...normal);
  }
  return index;
};

const appendDistinctTriangle = (
  output: MeshGroupBuffers,
  emittedFaces: Set<string>,
  points: readonly Vec3[],
  normal: Vec3,
): void => {
  const key = points
    .map((point) => weldKey(weldPoint(point)))
    .sort()
    .join('|');
  if (emittedFaces.has(key)) {
    return;
  }
  emittedFaces.add(key);
  output.indices.push(...points.map((point) => addGroupVertex(output, point, normal)));
};

interface TJunctionRepairContext {
  readonly vertices: readonly Vec3[];
  readonly output: MeshGroupBuffers;
  readonly emittedFaces: Set<string>;
}

const repairTriangle = (points: readonly Vec3[], normal: Vec3, context: TJunctionRepairContext): void => {
  const { vertices, output, emittedFaces } = context;
  const boundary = points.flatMap((a, edge) => [a, ...pointsOnEdge(a, points[(edge + 1) % 3]!, vertices)]);
  if (boundary.length === 3) {
    appendDistinctTriangle(output, emittedFaces, points, normal);
    return;
  }
  const center: Vec3 = [0, 1, 2].map(
    (axis) => (points[0]![axis]! + points[1]![axis]! + points[2]![axis]!) / 3,
  ) as unknown as Vec3;
  for (let edge = 0; edge < boundary.length; edge++) {
    const a = boundary[edge]!;
    const b = boundary[(edge + 1) % boundary.length]!;
    const area = dot(cross(sub(a, center), sub(b, center)), normal);
    if (Math.abs(area) > GROUP_WELD_TOLERANCE_U ** 2) {
      appendDistinctTriangle(output, emittedFaces, [center, area > 0 ? a : b, area > 0 ? b : a], normal);
    }
  }
};

const repairTJunctions = (output: MeshGroupBuffers): void => {
  const candidateVertices = new Map<string, Vec3>();
  for (let index = 0; index < output.positions.length; index += 3) {
    const point: Vec3 = [output.positions[index]!, output.positions[index + 1]!, output.positions[index + 2]!];
    candidateVertices.set(weldKey(point), point);
  }
  const vertices = [...candidateVertices.values()];
  const originalIndices = [...output.indices];
  output.indices.length = 0;
  const emittedFaces = new Set<string>();
  for (let triangle = 0; triangle < originalIndices.length; triangle += 3) {
    const indices = originalIndices.slice(triangle, triangle + 3);
    const points = indices.map(
      (index) =>
        [output.positions[index * 3]!, output.positions[index * 3 + 1]!, output.positions[index * 3 + 2]!] as const,
    );
    const normal: Vec3 = [
      output.normals[indices[0]! * 3]!,
      output.normals[indices[0]! * 3 + 1]!,
      output.normals[indices[0]! * 3 + 2]!,
    ];
    repairTriangle(points, normal, { vertices, output, emittedFaces });
  }
};

const surfaceVertices = (surfaces: readonly SurfacePolygon[]): Vec3[] => {
  const vertices = new Map<string, Vec3>();
  for (const surface of surfaces) {
    for (const point of surface.points) {
      const welded = weldPoint(point);
      vertices.set(weldKey(welded), welded);
    }
  }
  return [...vertices.values()];
};

/**
 * Merge convex pieces in one local frame with disjoint interiors, subtract internal
 * faces, weld within 1e-5u, and split T-junction edges. Each piece extent must be at
 * least 10 weld tolerances; pieces may share faces or edges. The result is one closed
 * shell per connected component. Collision continues to use the original convex pieces.
 */
export const meshForSolidGroup = (solids: readonly Solid[]): TriangleMesh => {
  for (const solid of solids) {
    if (solid.kind === 'revolved') {
      throw new Error(`Solid "${solid.id}" is revolved; mesh groups merge only boxes and convex extrusions.`);
    }
    const [minimum, maximum] = localSolidBounds(solid);
    if (minimum.some((value, axis) => maximum[axis]! - value < 10 * GROUP_WELD_TOLERANCE_U)) {
      throw new Error(`Solid "${solid.id}" is thinner than the mesh-group weld contract.`);
    }
  }
  const swapCaps = solids.map(
    (solid) => solid.kind === 'box' || (solid.kind === 'extruded-polygon' && !solid.clip?.length),
  );
  const polyhedra = solids.map((solid) => {
    if (solid.kind === 'revolved') {
      throw new Error(`Solid "${solid.id}" is revolved; mesh groups merge only boxes and convex extrusions.`);
    }
    if (solid.kind === 'box') {
      return obbPolyhedron(worldBox(IDENTITY, solid.box));
    }
    const polyhedron = clippedExtrudedPolygonPolyhedron(solid);
    if (!polyhedron) {
      throw new Error(`Solid "${solid.id}" clips to an empty or degenerate mesh.`);
    }
    return polyhedron;
  });
  const halfSpaces = polyhedra.map((polyhedron, index) => halfSpacesFromPolyhedron(polyhedron, swapCaps[index]));
  const surfaces = boundarySurfaces(polyhedra, halfSpaces, swapCaps);
  const vertices = surfaceVertices(surfaces);
  const output: MeshGroupBuffers = {
    positions: [],
    normals: [],
    indices: [],
    vertexByPositionNormal: new Map(),
    triangleKeys: new Set(),
  };
  for (const surface of surfaces) {
    appendSurfacePolygon(surface, vertices, output);
  }
  repairTJunctions(output);
  return {
    positions: new Float32Array(output.positions),
    normals: new Float32Array(output.normals),
    indices: new Uint32Array(output.indices),
    triangleCount: output.indices.length / 3,
  };
};
