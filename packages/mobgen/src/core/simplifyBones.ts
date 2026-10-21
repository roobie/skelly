import type { Body } from './body.ts';
import type { BoneMesh } from './mesh.ts';

type Point = readonly [number, number, number];
interface Vertex {
  point: Point;
  readonly faces: Set<number>;
  readonly locked: boolean;
  version: number;
}
interface Face {
  vertices: [number, number, number];
  readonly color: number;
  readonly neighbour: number;
  alive: boolean;
}
interface Part {
  readonly vertices: Vertex[];
  readonly faces: Face[];
}
interface ContactFace {
  points: readonly Point[];
  owners: Set<number>;
  area: number;
}
interface Edge {
  a: number;
  b: number;
  distance: number;
  av: number;
  bv: number;
}

const keyOf = (point: Point): string => point.join(',');
const pointAt = (mesh: BoneMesh, index: number): Point => [
  mesh.positions[index * 3]!,
  mesh.positions[index * 3 + 1]!,
  mesh.positions[index * 3 + 2]!,
];
const normal = (a: Point, b: Point, c: Point): Point => {
  const u = b.map((value, axis) => value - a[axis]!);
  const v = c.map((value, axis) => value - a[axis]!);
  return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
};
const lengthSquared = (a: Point, b: Point): number => a.reduce((sum, value, axis) => sum + (value - b[axis]!) ** 2, 0);
const dot = (a: Point, b: Point): number => a.reduce((sum, value, axis) => sum + value * b[axis]!, 0);

const contactFaces = (meshes: ReadonlyMap<number, BoneMesh>): Map<string, Map<string, ContactFace>> => {
  const interfaces = new Map<string, Map<string, ContactFace>>();
  for (const [owner, mesh] of meshes) {
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const neighbour = mesh.neighbourBone[mesh.indices[index]!]!;
      if (neighbour < 0) {
        continue;
      }
      const pair = [owner, neighbour].sort((a, b) => a - b).join(':');
      const faces = interfaces.get(pair) ?? new Map<string, ContactFace>();
      interfaces.set(pair, faces);
      const points = [0, 1, 2].map((offset) => pointAt(mesh, mesh.indices[index + offset]!));
      const key = points.map(keyOf).sort().join('|');
      const n = normal(points[0]!, points[1]!, points[2]!);
      const face = faces.get(key) ?? { points, owners: new Set<number>(), area: dot(n, n) };
      face.owners.add(owner);
      faces.set(key, face);
    }
  }
  return interfaces;
};

// One coincident face anchors a joint; mismatched tessellations need the whole interface locked.
const contactLocks = (meshes: ReadonlyMap<number, BoneMesh>): Set<string> => {
  const locks = new Set<string>();
  for (const faces of contactFaces(meshes).values()) {
    const matching = [...faces.values()].filter((face) => face.owners.size === 2).sort((a, b) => b.area - a.area);
    const protectedFaces = matching.length > 0 ? [matching[0]!] : [...faces.values()];
    for (const face of protectedFaces) {
      for (const point of face.points) {
        locks.add(keyOf(point));
      }
    }
  }
  return locks;
};

const makePart = (mesh: BoneMesh, locks: ReadonlySet<string>): Part => {
  const vertices: Vertex[] = [];
  const indices = new Map<string, number>();
  const faces: Face[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const triangle = [0, 1, 2].map((offset) => {
      const point = pointAt(mesh, mesh.indices[index + offset]!);
      const key = keyOf(point);
      let vertex = indices.get(key);
      if (vertex === undefined) {
        vertex = vertices.length;
        vertices.push({ point, faces: new Set(), locked: locks.has(key), version: 0 });
        indices.set(key, vertex);
      }
      vertices[vertex]!.faces.add(faces.length);
      return vertex;
    }) as [number, number, number];
    faces.push({
      vertices: triangle,
      color: mesh.colors[mesh.indices[index]!]!,
      neighbour: mesh.neighbourBone[mesh.indices[index]!]!,
      alive: true,
    });
  }
  return { vertices, faces };
};

const neighboursOf = (part: Part, vertex: number): Set<number> => {
  const neighbours = new Set<number>();
  for (const face of part.vertices[vertex]!.faces) {
    for (const other of part.faces[face]!.vertices) {
      if (other !== vertex) {
        neighbours.add(other);
      }
    }
  }
  return neighbours;
};

const linkAllows = (part: Part, keep: number, drop: number, commonFaces: readonly number[]): boolean => {
  if (commonFaces.length !== 2) {
    return false;
  }
  const opposite = new Set(
    commonFaces.flatMap((face) => part.faces[face]!.vertices.filter((vertex) => vertex !== keep && vertex !== drop)),
  );
  const a = neighboursOf(part, keep);
  const b = neighboursOf(part, drop);
  const common = [...a].filter((vertex) => b.has(vertex));
  // The link condition protects topology; a tetrahedron cannot collapse into duplicate faces.
  return (
    opposite.size === 2 &&
    common.length === 2 &&
    common.every((vertex) => opposite.has(vertex)) &&
    new Set([...a, ...b]).size > 4
  );
};

const faceAllows = (part: Part, face: Face, edge: readonly [number, number], target: Point): boolean => {
  const old = face.vertices.map((vertex) => part.vertices[vertex]!.point);
  const next = face.vertices.map((vertex) => (edge.includes(vertex) ? target : part.vertices[vertex]!.point));
  return dot(normal(old[0]!, old[1]!, old[2]!), normal(next[0]!, next[1]!, next[2]!)) > 0;
};

const replaceFaces = (
  part: Part,
  affected: ReadonlySet<number>,
  removed: readonly number[],
  [keep, drop]: readonly [number, number],
): void => {
  for (const index of affected) {
    const face = part.faces[index]!;
    for (const vertex of face.vertices) {
      part.vertices[vertex]!.faces.delete(index);
      part.vertices[vertex]!.version += 1;
    }
    if (removed.includes(index)) {
      face.alive = false;
      continue;
    }
    face.vertices = face.vertices.map((vertex) => (vertex === drop ? keep : vertex)) as [number, number, number];
    for (const vertex of face.vertices) {
      part.vertices[vertex]!.faces.add(index);
    }
  }
};

const collapse = (part: Part, keep: number, drop: number): boolean => {
  const a = part.vertices[keep]!;
  const b = part.vertices[drop]!;
  if (b.locked || a.faces.size === 0 || b.faces.size === 0) {
    return false;
  }
  const commonFaces = [...a.faces].filter((face) => b.faces.has(face));
  if (!linkAllows(part, keep, drop, commonFaces)) {
    return false;
  }
  const target: Point = a.locked
    ? a.point
    : (a.point.map((value, axis) => (value + b.point[axis]!) / 2) as unknown as Point);
  const affected = new Set([...a.faces, ...b.faces]);
  for (const index of affected) {
    if (!(commonFaces.includes(index) || faceAllows(part, part.faces[index]!, [keep, drop], target))) {
      return false;
    }
  }
  a.point = target;
  replaceFaces(part, affected, commonFaces, [keep, drop]);
  return true;
};

const candidateEdge = (part: Part, first: number, second: number): Edge => {
  let a = first;
  let b = second;
  if (part.vertices[b]!.locked || (!part.vertices[a]!.locked && a > b)) {
    [a, b] = [b, a];
  }
  return {
    a,
    b,
    distance: lengthSquared(part.vertices[a]!.point, part.vertices[b]!.point),
    av: part.vertices[a]!.version,
    bv: part.vertices[b]!.version,
  };
};

const candidateEdges = (part: Part, edgeLength: number): Edge[] => {
  const edges = new Map<string, Edge>();
  for (const face of part.faces) {
    if (!face.alive) {
      continue;
    }
    for (let offset = 0; offset < 3; offset++) {
      const edge = candidateEdge(part, face.vertices[offset]!, face.vertices[(offset + 1) % 3]!);
      if (edge.distance <= edgeLength ** 2) {
        edges.set([edge.a, edge.b].sort((a, b) => a - b).join(':'), edge);
      }
    }
  }
  return [...edges.values()].sort((a, b) => a.distance - b.distance || a.a - b.a || a.b - b.b);
};

const simplifyPart = (part: Part, edgeLength: number): void => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of candidateEdges(part, edgeLength)) {
      if (
        part.vertices[edge.a]!.version === edge.av &&
        part.vertices[edge.b]!.version === edge.bv &&
        collapse(part, edge.a, edge.b)
      ) {
        changed = true;
      }
    }
  }
};

const emitPart = (part: Part): BoneMesh => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const neighbours: number[] = [];
  const indices: number[] = [];
  for (const face of part.faces) {
    if (!face.alive) {
      continue;
    }
    const points = face.vertices.map((vertex) => part.vertices[vertex]!.point);
    const n = normal(points[0]!, points[1]!, points[2]!);
    const length = Math.hypot(...n);
    for (const point of points) {
      indices.push(indices.length);
      positions.push(...point);
      normals.push(...n.map((value) => value / length));
      colors.push(face.color);
      neighbours.push(face.neighbour);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Uint8Array(colors),
    neighbourBone: new Int32Array(neighbours),
    indices: new Uint32Array(indices),
    triangles: indices.length / 3,
  };
};

const retainExtrema = (extrema: (Point | undefined)[], point: Point, axis: number): void => {
  if (!extrema[axis * 2] || point[axis]! < extrema[axis * 2]![axis]!) {
    extrema[axis * 2] = point;
  }
  if (!extrema[axis * 2 + 1] || point[axis]! > extrema[axis * 2 + 1]![axis]!) {
    extrema[axis * 2 + 1] = point;
  }
};

const shapeLocks = (
  reference: { readonly body: Body; readonly meshes: ReadonlyMap<number, BoneMesh> },
  locks: Set<string>,
): void => {
  const extrema: (Point | undefined)[] = [];
  for (const [index, mesh] of reference.meshes) {
    const bone = reference.body.bones[index]!;
    const direction = bone.tail.map((value, dimension) => Math.abs(value - bone.head[dimension]!));
    const axis = direction.indexOf(Math.max(...direction));
    const endpoints: (Point | undefined)[] = [];
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
      const point = pointAt(mesh, vertex);
      retainExtrema(endpoints, point, axis);
      for (let dimension = 0; dimension < 3; dimension++) {
        retainExtrema(extrema, point, dimension);
      }
    }
    for (const point of endpoints) {
      if (point) {
        locks.add(keyOf(point));
      }
    }
  }
  for (const point of extrema) {
    if (point) {
      locks.add(keyOf(point));
    }
  }
};

// Preserve ownership and fixed cut faces; extrema prevent saving triangles by erasing anatomy.
export const simplifyBoneMeshes = (
  reference: { readonly body: Body; readonly meshes: ReadonlyMap<number, BoneMesh> },
  edgeLength: number,
): ReadonlyMap<number, BoneMesh> => {
  if (!Number.isFinite(edgeLength) || edgeLength <= 0) {
    throw new RangeError('Simplification edge length must be positive and finite');
  }
  const locks = contactLocks(reference.meshes);
  shapeLocks(reference, locks);
  return new Map(
    [...reference.meshes].map(([index, mesh]) => {
      const part = makePart(mesh, locks);
      simplifyPart(part, edgeLength);
      return [index, emitPart(part)];
    }),
  );
};
