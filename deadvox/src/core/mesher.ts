// Culled-face voxel mesher with per-vertex ambient occlusion.
// Pure: takes a padded block array (see world.ts) and returns typed arrays for the GPU.

import { CHUNK } from './coords.ts';
import { hash3 } from './random.ts';
import { paddedIndex } from './world.ts';

export interface MeshData {
  positions: Float32Array; // chunk-local, 3 per vertex
  normals: Int8Array; // 3 per vertex, -1/0/1
  colors: Uint8Array; // RGB, 3 per vertex
  indices: Uint32Array;
}

interface Face {
  normal: [number, number, number];
  /** Corner offsets inside the unit cube, counter-clockwise seen from outside. */
  corners: [number, number, number][];
  /** Per corner: the two in-plane directions pointing away from the face centre. */
  sides: [[number, number, number], [number, number, number]][];
}

// For axis d, u = d+1 and v = d+2 (mod 3), so u × v points along +d and the
// corner order (0,0) (1,0) (1,1) (0,1) is counter-clockwise from the + side.
const FACES: Face[] = [];
for (let d = 0; d < 3; d++) {
  const u = (d + 1) % 3;
  const v = (d + 2) % 3;
  for (const s of [1, -1]) {
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (s < 0) uv.reverse();
    const normal: [number, number, number] = [0, 0, 0];
    normal[d] = s;
    const corners: [number, number, number][] = [];
    const sides: Face['sides'] = [];
    for (const [cu, cv] of uv) {
      const c: [number, number, number] = [0, 0, 0];
      c[d] = s > 0 ? 1 : 0;
      c[u] = cu;
      c[v] = cv;
      corners.push(c);
      const su: [number, number, number] = [0, 0, 0];
      const sv: [number, number, number] = [0, 0, 0];
      su[u] = cu ? 1 : -1;
      sv[v] = cv ? 1 : -1;
      sides.push([su, sv]);
    }
    FACES.push({ normal, corners, sides });
  }
}

/** Vertex brightness for 0..3 unoccluded neighbours. */
const AO_LEVELS = [0.5, 0.68, 0.84, 1];

/**
 * Builds a mesh for one chunk.
 * @param padded block ids for the chunk plus a 1-block border (see extractPadded)
 * @param colors RGB per block id (3 bytes each)
 * @param origin world position of the chunk's (0,0,0) block, used for colour variation
 */
export const buildMesh = (
  padded: Uint16Array,
  colors: Uint8Array,
  origin: [number, number, number] = [0, 0, 0],
): MeshData => {
  const positions: number[] = [];
  const normals: number[] = [];
  const vcolors: number[] = [];
  const indices: number[] = [];
  const solid = (x: number, y: number, z: number): number => (padded[paddedIndex(x, y, z)]! !== 0 ? 1 : 0);

  for (let y = 0; y < CHUNK; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = padded[paddedIndex(x + 1, y + 1, z + 1)]!;
        if (id === 0) continue;
        // Small per-block brightness jitter stands in for textures.
        const jitter = 0.94 + 0.12 * hash3(7, origin[0] + x, origin[1] + y, origin[2] + z);
        const r = colors[id * 3]! * jitter;
        const g = colors[id * 3 + 1]! * jitter;
        const b = colors[id * 3 + 2]! * jitter;

        for (const face of FACES) {
          const [nx, ny, nz] = face.normal;
          // Neighbour in the padded array: +1 for the border, + normal.
          const fx = x + 1 + nx;
          const fy = y + 1 + ny;
          const fz = z + 1 + nz;
          if (solid(fx, fy, fz)) continue;

          const base = positions.length / 3;
          const ao: number[] = [];
          for (let i = 0; i < 4; i++) {
            const [cx, cy, cz] = face.corners[i]!;
            const [su, sv] = face.sides[i]!;
            const s1 = solid(fx + su[0], fy + su[1], fz + su[2]);
            const s2 = solid(fx + sv[0], fy + sv[1], fz + sv[2]);
            const corner = solid(fx + su[0] + sv[0], fy + su[1] + sv[1], fz + su[2] + sv[2]);
            const level = s1 && s2 ? 0 : 3 - (s1 + s2 + corner);
            ao.push(level);
            const k = AO_LEVELS[level]!;
            positions.push(x + cx, y + cy, z + cz);
            normals.push(nx, ny, nz);
            vcolors.push(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k));
          }
          // Split the quad along the brighter diagonal so AO interpolates without a seam.
          if (ao[0]! + ao[2]! >= ao[1]! + ao[3]!) {
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          } else {
            indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Int8Array(normals),
    colors: new Uint8Array(vcolors),
    indices: new Uint32Array(indices),
  };
};
