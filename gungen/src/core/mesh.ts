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
import { clippedExtrudedPolygonPolyhedron } from './geometry.ts';
import { cross, type ExtrusionAxis, extrusionPoint, normalize, sub, type Vec3 } from './math.ts';
import type { Box, Solid, Vec2 } from './schema.ts';

export interface TriangleMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
}

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

  /** Adds a planar convex polygon (>= 3 points, already wound so its cross product points outward), fan-triangulated. */
  face(points: readonly Vec3[]): void {
    const normal = normalize(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
    const base = this.positions.length / 3;
    for (const pt of points) {
      this.positions.push(pt[0], pt[1], pt[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
    }
    for (let i = 1; i < points.length - 1; i++) {
      this.indices.push(base, base + i, base + i + 1);
    }
  }

  /** Adds a face, reversing its winding first if that would point away from `outwardHint`. */
  orientedFace(points: readonly Vec3[], outwardHint: Vec3): void {
    const normal = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!));
    const dot = normal[0] * outwardHint[0] + normal[1] * outwardHint[1] + normal[2] * outwardHint[2];
    this.face(dot < 0 ? [...points].reverse() : points);
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

/** A flat-shaded display mesh for one solid, in its own local frame. */
export const meshForSolid = (
  solid: Solid,
  bevel: number = solid.display?.bevel === false ? 0 : BEVEL,
): TriangleMesh => {
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

const containsInReceiverSection = (solid: Solid, point: Vec3): boolean => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box;
    return point.every(
      (value, axis) => value >= center[axis]! - half[axis]! - 1e-8 && value <= center[axis]! + half[axis]! + 1e-8,
    );
  }
  if ((solid.axis ?? 'z') !== 'x' || point[0] < solid.z[0] - 1e-8 || point[0] > solid.z[1] + 1e-8) {
    return false;
  }
  const point2: Vec2 = [point[1], point[2]];
  for (let i = 0; i < solid.profile.length; i++) {
    const a = solid.profile[i]!;
    const b = solid.profile[(i + 1) % solid.profile.length]!;
    const side = (b[0] - a[0]) * (point2[1] - a[1]) - (b[1] - a[1]) * (point2[0] - a[0]);
    if (side < -1e-7) {
      return false;
    }
  }
  return true;
};

const triangleKey = (mesh: TriangleMesh, triangle: number): string =>
  [0, 1, 2]
    .map((corner) => {
      const index = mesh.indices[triangle + corner]! * 3;
      return `${mesh.positions[index]!.toFixed(6)},${mesh.positions[index + 1]!.toFixed(6)},${mesh.positions[index + 2]!.toFixed(6)}`;
    })
    .sort()
    .join('|');

const groupFaceCounts = (meshes: readonly TriangleMesh[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const mesh of meshes) {
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      const key = triangleKey(mesh, triangle);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
};

const isOccludedTriangle = (
  solids: readonly Solid[],
  solidIndex: number,
  mesh: TriangleMesh,
  triangle: number,
): boolean => {
  const indices = [mesh.indices[triangle]!, mesh.indices[triangle + 1]!, mesh.indices[triangle + 2]!];
  const points = indices.map(
    (index) => [mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!] as Vec3,
  );
  const normal: Vec3 = [
    mesh.normals[indices[0]! * 3]!,
    mesh.normals[indices[0]! * 3 + 1]!,
    mesh.normals[indices[0]! * 3 + 2]!,
  ];
  const center: Vec3 = [
    (points[0]![0] + points[1]![0] + points[2]![0]) / 3,
    (points[0]![1] + points[1]![1] + points[2]![1]) / 3,
    (points[0]![2] + points[1]![2] + points[2]![2]) / 3,
  ];
  const probes = [
    center,
    [center[0] + normal[0] * 1e-6, center[1] + normal[1] * 1e-6, center[2] + normal[2] * 1e-6] as Vec3,
    [center[0] - normal[0] * 1e-6, center[1] - normal[1] * 1e-6, center[2] - normal[2] * 1e-6] as Vec3,
  ];
  return solids.some(
    (other, index) => index !== solidIndex && probes.some((probe) => containsInReceiverSection(other, probe)),
  );
};

const appendTriangle = (
  mesh: TriangleMesh,
  triangle: number,
  output: { positions: number[]; normals: number[]; indices: number[] },
): void => {
  const vertices = [mesh.indices[triangle]!, mesh.indices[triangle + 1]!, mesh.indices[triangle + 2]!];
  const base = output.positions.length / 3;
  const normal: Vec3 = [
    mesh.normals[vertices[0]! * 3]!,
    mesh.normals[vertices[0]! * 3 + 1]!,
    mesh.normals[vertices[0]! * 3 + 2]!,
  ];
  for (const vertex of vertices) {
    output.positions.push(
      mesh.positions[vertex * 3]!,
      mesh.positions[vertex * 3 + 1]!,
      mesh.positions[vertex * 3 + 2]!,
    );
    output.normals.push(...normal);
  }
  output.indices.push(base, base + 1, base + 2);
};

/** Merge un-beveled X-extruded collision pieces and discard their shared interior faces. */
export const meshForSolidGroup = (solids: readonly Solid[]): TriangleMesh => {
  const output = { positions: [] as number[], normals: [] as number[], indices: [] as number[] };
  const meshes = solids.map((solid) => meshForSolid(solid, 0));
  const faceCounts = groupFaceCounts(meshes);
  for (let solidIndex = 0; solidIndex < solids.length; solidIndex++) {
    const mesh = meshes[solidIndex]!;
    for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
      if ((faceCounts.get(triangleKey(mesh, triangle)) ?? 0) > 1) {
        continue;
      }
      if (isOccludedTriangle(solids, solidIndex, mesh, triangle)) {
        continue;
      }
      appendTriangle(mesh, triangle, output);
    }
  }
  return {
    positions: new Float32Array(output.positions),
    normals: new Float32Array(output.normals),
    indices: new Uint32Array(output.indices),
    triangleCount: output.indices.length / 3,
  };
};
