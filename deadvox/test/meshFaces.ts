// Test helpers: expand a mesh's quads back into unit faces, and list the faces a
// plain face-culling mesher would draw, so the greedy mesher can be checked against it.

import { CHUNK } from '../src/core/coords.ts';
import type { MeshData } from '../src/core/mesher.ts';
import { BEDROCK, paddedIndex } from '../src/core/world.ts';

/** "x,y,z,axis,sign" for the unit face of block (x, y, z) facing that way. */
const faceId = (block: readonly number[], axis: number, sign: number) => `${block.join(',')},${axis},${sign}`;

/** Every integer cell in [lo, hi) on all three axes. */
const cells = (lo: readonly number[], hi: readonly number[]): number[][] => {
  const out: number[][] = [];
  for (let x = lo[0]!; x < hi[0]!; x++) {
    for (let y = lo[1]!; y < hi[1]!; y++) {
      for (let z = lo[2]!; z < hi[2]!; z++) {
        out.push([x, y, z]);
      }
    }
  }
  return out;
};

/** The unit faces covered by quad q (4 vertices, all with the same normal). */
const quadFaces = (mesh: MeshData, q: number): string[] => {
  const corners = [0, 1, 2, 3].map((i) => Array.from(mesh.positions.subarray(q * 12 + i * 3, q * 12 + i * 3 + 3)));
  const normal = Array.from(mesh.normals.subarray(q * 12, q * 12 + 3));
  const axis = normal.findIndex((n) => n !== 0);
  const sign = normal[axis]!;
  const lo = [0, 1, 2].map((a) => Math.min(...corners.map((c) => c[a]!)));
  const hi = [0, 1, 2].map((a) => Math.max(...corners.map((c) => c[a]!)));
  // The block the face belongs to sits behind the face plane.
  lo[axis] = sign > 0 ? lo[axis]! - 1 : lo[axis]!;
  hi[axis] = lo[axis]! + 1;
  return cells(lo, hi).map((cell) => faceId(cell, axis, sign));
};

/** Every unit face the mesh's quads cover. Throws if two quads overlap. */
export const unitFaces = (mesh: MeshData): Set<string> => {
  const faces = new Set<string>();
  for (let q = 0; q < mesh.positions.length / 12; q++) {
    for (const id of quadFaces(mesh, q)) {
      if (faces.has(id)) {
        throw new Error(`overlapping quads at ${id}`);
      }
      faces.add(id);
    }
  }
  return faces;
};

/** The visible faces of the block at chunk-local `block`. */
const blockFaces = (padded: Uint16Array, block: readonly number[]): string[] => {
  const id = padded[paddedIndex(block[0]! + 1, block[1]! + 1, block[2]! + 1)]!;
  if (id === 0 || id === BEDROCK) {
    return [];
  }
  return [0, 1, 2].flatMap((axis) =>
    [1, -1]
      .filter((sign) => {
        const n = block.map((v, a) => v + 1 + (a === axis ? sign : 0));
        return padded[paddedIndex(n[0]!, n[1]!, n[2]!)] === 0;
      })
      .map((sign) => faceId(block, axis, sign)),
  );
};

/** The faces a mesher that draws every visible block face separately would produce. */
export const culledFaces = (padded: Uint16Array): Set<string> =>
  new Set(cells([0, 0, 0], [CHUNK, CHUNK, CHUNK]).flatMap((block) => blockFaces(padded, block)));
