import type { Vec3 } from '../core/coords.ts';

/** Drawn triangles of one part model, in the model frame's metres. */
export interface PartMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

interface GlbJson {
  meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  nodes: { mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
}

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

/** Reads the drawn triangles of a model file; exports write one identity-placed mesh node per model. */
export const readGlbMesh = (bytes: Uint8Array): PartMesh => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbJson;
  const binary = 20 + jsonLength + 8;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const node of json.nodes) {
    if (node.mesh === undefined) {
      continue;
    }
    if (node.rotation || node.scale || node.matrix || node.translation?.some((value) => value !== 0)) {
      throw new Error('Model mesh node is not at identity; the spike reads exports as written');
    }
    for (const primitive of json.meshes[node.mesh]!.primitives) {
      const position = json.accessors[primitive.attributes.POSITION]!;
      const index = json.accessors[primitive.indices!]!;
      if (position.componentType !== FLOAT || json.bufferViews[position.bufferView]!.byteStride !== undefined) {
        throw new Error('Model positions are not tightly packed float32');
      }
      const base = positions.length / 3;
      const positionAt = binary + (json.bufferViews[position.bufferView]!.byteOffset ?? 0) + (position.byteOffset ?? 0);
      for (let i = 0; i < position.count * 3; i++) {
        positions.push(view.getFloat32(positionAt + i * 4, true));
      }
      const indexAt = binary + (json.bufferViews[index.bufferView]!.byteOffset ?? 0) + (index.byteOffset ?? 0);
      for (let i = 0; i < index.count; i++) {
        indices.push(
          base +
            (index.componentType === UNSIGNED_SHORT
              ? view.getUint16(indexAt + i * 2, true)
              : index.componentType === UNSIGNED_INT
                ? view.getUint32(indexAt + i * 4, true)
                : Number.NaN),
        );
      }
    }
  }
  if (indices.some(Number.isNaN)) {
    throw new Error('Model indices are neither uint16 nor uint32');
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
};

/** A mesh through `place`; a reflecting placement reverses winding so faces keep pointing outward. */
export const placeMesh = (mesh: PartMesh, place: (point: Vec3) => Vec3, reflects: boolean): PartMesh => {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions.set(place([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!]), i);
  }
  const indices = Uint32Array.from(mesh.indices);
  if (reflects) {
    for (let i = 0; i < indices.length; i += 3) {
      const second = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = second;
    }
  }
  return { positions, indices };
};

/** Largest distance a vertex may stand off a face plane and the piece still count as convex, in metres. */
const CONVEX_TOLERANCE = 1e-4;
/** Cuts per piece before its remaining hollows are closed by its hull. */
const MAX_SPLIT_DEPTH = 6;

/** Candidate cut positions tried per axis, evenly spread over the piece's face centres. */
const CUTS_PER_AXIS = 24;

type Triangle =readonly [number, number, number];

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface ConvexPieces {
  /** Points of each convex piece; the hull of a piece is the hull of these. */
  readonly pieces: readonly Float32Array[];
  /** Pieces still concave at the depth cap, whose hull closes a hollow. */
  readonly residual: number;
}

/**
 * Splits a part's drawn triangles into convex pieces: connected shells first, then axis cuts at the vertex coordinate
 * that leaves the fewest vertices behind a face plane. Deterministic float arithmetic only, so every runtime cuts alike.
 */
export const convexPieces = (mesh: PartMesh): ConvexPieces => {
  const weld = new Map<string, number>();
  const points: Vec3[] = [];
  const identity = (i: number): number => {
    const point: Vec3 = [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
    const key = point.join(',');
    let id = weld.get(key);
    if (id === undefined) {
      id = points.length;
      weld.set(key, id);
      points.push(point);
    }
    return id;
  };
  const triangles: Triangle[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle: Triangle = [identity(mesh.indices[i]!), identity(mesh.indices[i + 1]!), identity(mesh.indices[i + 2]!)];
    if (new Set(triangle).size === 3) {
      triangles.push(triangle);
    }
  }
  const parent = points.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) {
      root = parent[root]!;
    }
    parent[i] = root;
    return root;
  };
  for (const [a, b, c] of triangles) {
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const shells = new Map<number, Triangle[]>();
  for (const triangle of triangles) {
    const root = find(triangle[0]);
    shells.set(root, [...(shells.get(root) ?? []), triangle]);
  }

  const verticesOf = (list: readonly Triangle[]): number[] => [...new Set(list.flat())].sort((a, b) => a - b);
  const planes = (list: readonly Triangle[]) =>
    list.map(([a, b, c]) => {
      const normal = cross(subtract(points[b]!, points[a]!), subtract(points[c]!, points[a]!));
      const length = Math.hypot(...normal);
      return { normal: normal.map((v) => v / length) as unknown as Vec3, origin: points[a]! };
    });
  /** Vertices standing off the far side of some face plane, summed over faces: zero for a convex piece. */
  const hollows = (list: readonly Triangle[]): number => {
    const vertices = verticesOf(list);
    let count = 0;
    for (const { normal, origin } of planes(list)) {
      let above = 0;
      let below = 0;
      for (const v of vertices) {
        const side = dot(normal, subtract(points[v]!, origin));
        above += side > CONVEX_TOLERANCE ? 1 : 0;
        below += side < -CONVEX_TOLERANCE ? 1 : 0;
      }
      count += Math.min(above, below);
    }
    return count;
  };
  const centre = (triangle: Triangle, axis: number): number =>
    (points[triangle[0]]![axis]! + points[triangle[1]]![axis]! + points[triangle[2]]![axis]!) / 3;

  const pieces: Float32Array[] = [];
  let residual = 0;
  const split = (list: readonly Triangle[], depth: number): void => {
    const concave = hollows(list);
    if (concave === 0 || list.length <= 4 || depth >= MAX_SPLIT_DEPTH) {
      residual += concave === 0 ? 0 : 1;
      pieces.push(Float32Array.from(verticesOf(list).flatMap((v) => points[v]!)));
      return;
    }
    let best: { score: number; low: Triangle[]; high: Triangle[] } | undefined;
    for (let axis = 0; axis < 3; axis++) {
      const cuts = [...new Set(list.map((triangle) => centre(triangle, axis)))].sort((a, b) => a - b);
      const stride = Math.max(1, Math.ceil(cuts.length / CUTS_PER_AXIS));
      for (const cut of cuts.slice(0, -1).filter((_, i) => i % stride === 0)) {
        const low = list.filter((triangle) => centre(triangle, axis) <= cut);
        const high = list.filter((triangle) => centre(triangle, axis) > cut);
        const score = hollows(low) + hollows(high);
        if (!best || score < best.score) {
          best = { score, low, high };
        }
      }
    }
    if (!best || best.low.length === 0 || best.high.length === 0) {
      residual += 1;
      pieces.push(Float32Array.from(verticesOf(list).flatMap((v) => points[v]!)));
      return;
    }
    split(best.low, depth + 1);
    split(best.high, depth + 1);
  };
  for (const root of [...shells.keys()].sort((a, b) => a - b)) {
    split(shells.get(root)!, 0);
  }
  return { pieces, residual };
};
