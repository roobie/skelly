// Greedy meshing, per bone. A face is exposed if its neighbour is empty OR
// owned by a different bone — never smoothed across the joint — so a bent
// joint shows a closed cut face rather than a hole into the body (see
// PROJECT.md §2 "attached", CHALLENGES.md §3). Only faces of equal colour
// merge.

import { cellIndex, type Voxels } from './voxelize.ts';

export interface BoneMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Palette index (material * 4 + shade) per vertex. */
  readonly colors: Uint8Array;
  /** The bone index owning the *other* side of this face — one value per vertex (shared by all 4 corners
   * of a quad, since only same-neighbour faces merge; see greedyMerge's key). -1 for a face exposed to
   * empty space. Dismemberment's gore effect uses this: a face whose neighbour bone is severed, on a bone
   * that isn't, is a fresh cut and gets tinted (see mobgen/src/mob/crowd.ts's fragment shader patch). */
  readonly neighbourBone: Int32Array;
  readonly indices: Uint32Array;
  readonly triangles: number;
}

type Point = readonly [number, number, number];

/** X and Z voxel centres are at index*v; Y centres are at (index + 0.5)*v (see mobgen/PROJECT.md, "Conventions"),
 * so a face plane at boundary `e` sits at (e - 0.5)*v for X/Z and e*v for Y. */
const edgeX = (voxels: Voxels, e: number): number => (voxels.origin[0] + e - 0.5) * voxels.size;
const edgeY = (voxels: Voxels, e: number): number => (voxels.origin[1] + e) * voxels.size;
const edgeZ = (voxels: Voxels, e: number): number => (voxels.origin[2] + e - 0.5) * voxels.size;

interface Builder {
  positions: number[];
  normals: number[];
  colors: number[];
  neighbourBone: number[];
  indices: number[];
}

const newBuilder = (): Builder => ({ positions: [], normals: [], colors: [], neighbourBone: [], indices: [] });

interface Quad {
  readonly corners: readonly [Point, Point, Point, Point];
  readonly normal: Point;
  /** true for a -axis face: the winding is reversed so the triangles still face outward. */
  readonly reversed: boolean;
  readonly color: number;
  /** -1 for a face exposed to empty space — see BoneMesh.neighbourBone. */
  readonly neighbourBone: number;
}

const emitQuad = (b: Builder, quad: Quad): void => {
  const base = b.positions.length / 3;
  for (const c of quad.corners) {
    b.positions.push(c[0], c[1], c[2]);
    b.normals.push(quad.normal[0], quad.normal[1], quad.normal[2]);
    b.colors.push(quad.color);
    b.neighbourBone.push(quad.neighbourBone);
  }
  const tris = quad.reversed ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
  for (const t of tris) {
    b.indices.push(base + t);
  }
};

interface Rect {
  readonly u0: number;
  readonly v0: number;
  readonly su: number;
  readonly sv: number;
}

interface Mask2D {
  readonly mask: Int32Array;
  readonly visited: Uint8Array;
  readonly dimU: number;
  readonly dimV: number;
}

/** How far a same-value, unvisited run extends from (u, v) along u, within [0, dimU). */
const runWidth = (g: Mask2D, at: { readonly u: number; readonly v: number }, value: number): number => {
  const { u, v } = at;
  let su = 1;
  while (u + su < g.dimU && !g.visited[u + su + v * g.dimU] && g.mask[u + su + v * g.dimU] === value) {
    su += 1;
  }
  return su;
};

/** How many more full-width rows (each `su` wide, from `v`) share the same value and are unvisited. */
const runHeight = (
  g: Mask2D,
  run: { readonly u: number; readonly v: number; readonly su: number },
  value: number,
): number => {
  const { u, v, su } = run;
  let sv = 1;
  while (v + sv < g.dimV) {
    for (let du = 0; du < su; du++) {
      if (g.visited[u + du + (v + sv) * g.dimU] || g.mask[u + du + (v + sv) * g.dimU] !== value) {
        return sv;
      }
    }
    sv += 1;
  }
  return sv;
};

const markVisited = (visited: Uint8Array, dimU: number, rect: Rect): void => {
  for (let dv = 0; dv < rect.sv; dv++) {
    for (let du = 0; du < rect.su; du++) {
      visited[rect.u0 + du + (rect.v0 + dv) * dimU] = 1;
    }
  }
};

/** Greedy rectangle merge over a 2D mask of encoded merge keys (0 = not exposed; see encodeMaskValue) —
 * `emit` gets the raw key back, un-decremented, so a caller packing more than just colour into it (the
 * neighbour bone, so a cut's edge never merges across differently-owned neighbours) can decode it itself. */
const greedyMerge = (dimU: number, dimV: number, mask: Int32Array, emit: (rect: Rect, value: number) => void): void => {
  const g: Mask2D = { mask, visited: new Uint8Array(dimU * dimV), dimU, dimV };
  for (let v = 0; v < dimV; v++) {
    for (let u = 0; u < dimU; ) {
      const idx = u + v * dimU;
      if (g.visited[idx] || mask[idx] === 0) {
        u += 1;
        continue;
      }
      const value = mask[idx]!;
      const su = runWidth(g, { u, v }, value);
      const sv = runHeight(g, { u, v, su }, value);
      const rect: Rect = { u0: u, v0: v, su, sv };
      markVisited(g.visited, dimU, rect);
      emit(rect, value);
      u += su;
    }
  }
};

/** Merge-key encoding shared by maskX/Y/Z: 0 means "not exposed" (greedyMerge's own sentinel), otherwise
 * `1 + color * neighbourSlots + neighbourSlot` — colour and the exposed face's neighbour bone both fold
 * into one key so greedy merging never joins two faces that differ in either (a cut's edge must stay its
 * own quad so its neighbourBone is uniform across it). `neighbourSlot` is 0 for an empty neighbour, or
 * `voxels.owner`'s own raw value (ownerBoneIndex + 1) for a bone neighbour; `neighbourSlots` is boneCount
 * + 1, one slot per possible owner value. */
const encodeMaskValue = (color: number, neighbourSlot: number, neighbourSlots: number): number =>
  1 + color * neighbourSlots + neighbourSlot;

const decodeColor = (value: number, neighbourSlots: number): number => Math.floor((value - 1) / neighbourSlots);

const decodeNeighbourBone = (value: number, neighbourSlots: number): number => {
  const slot = (value - 1) % neighbourSlots;
  return slot === 0 ? -1 : slot - 1;
};

const owns = (voxels: Voxels, boneIndex: number, cell: Point): boolean => {
  const { dims } = voxels;
  const [i, j, k] = cell;
  if (i < 0 || i >= dims[0] || j < 0 || j >= dims[1] || k < 0 || k >= dims[2]) {
    return false;
  }
  return voxels.owner[cellIndex(dims, i, j, k)] === boneIndex + 1;
};

const colorAt = (voxels: Voxels, cell: Point): number => voxels.color[cellIndex(voxels.dims, ...cell)]!;

/** Raw `voxels.owner` value at `cell` — 0 for empty or out of bounds, else ownerBoneIndex + 1. The
 * "neighbour slot" encodeMaskValue/decodeNeighbourBone use directly. */
const ownerSlotAt = (voxels: Voxels, cell: Point): number => {
  const { dims } = voxels;
  const [i, j, k] = cell;
  if (i < 0 || i >= dims[0] || j < 0 || j >= dims[1] || k < 0 || k >= dims[2]) {
    return 0;
  }
  return voxels.owner[cellIndex(dims, i, j, k)]!;
};

/** Index range (inclusive) a bone's own voxels occupy — meshing (and the AABB scan itself) only
 * needs to look here, not the whole grid, which matters once the grid is much bigger than any one
 * bone's footprint (arms and legs spread a humanoid's bounding box well past its cross-section). */
interface Bounds {
  iMin: number;
  iMax: number;
  jMin: number;
  jMax: number;
  kMin: number;
  kMax: number;
}

const boneBounds = (voxels: Voxels, boneCount: number): (Bounds | undefined)[] => {
  const [nx, ny, nz] = voxels.dims;
  const bounds: (Bounds | undefined)[] = new Array(boneCount);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const o = voxels.owner[cellIndex(voxels.dims, i, j, k)];
        if (!o) {
          continue;
        }
        const bi = o - 1;
        const b = bounds[bi];
        if (b) {
          b.iMin = Math.min(b.iMin, i);
          b.iMax = Math.max(b.iMax, i);
          b.jMin = Math.min(b.jMin, j);
          b.jMax = Math.max(b.jMax, j);
          b.kMin = Math.min(b.kMin, k);
          b.kMax = Math.max(b.kMax, k);
        } else {
          bounds[bi] = { iMin: i, iMax: i, jMin: j, jMax: j, kMin: k, kMax: k };
        }
      }
    }
  }
  return bounds;
};

/** One bone, one of its 6 face directions. `neighbourSlots` is boneCount + 1 — see encodeMaskValue. */
interface AxisPass {
  readonly boneIndex: number;
  readonly bounds: Bounds;
  readonly positive: boolean;
  readonly neighbourSlots: number;
}

/** Exposure mask for one X-slice: encodeMaskValue(colour, neighbourSlot) where this bone owns the cell and
 * its +/-X neighbour doesn't (empty, or a different bone — see the module doc comment). */
const maskX = (voxels: Voxels, pass: AxisPass, i: number, dimU: number): Int32Array => {
  const { bounds, boneIndex, positive, neighbourSlots } = pass;
  const mask = new Int32Array(dimU * (bounds.kMax - bounds.kMin + 1));
  for (let k = bounds.kMin; k <= bounds.kMax; k++) {
    for (let j = bounds.jMin; j <= bounds.jMax; j++) {
      if (!owns(voxels, boneIndex, [i, j, k])) {
        continue;
      }
      const ni = positive ? i + 1 : i - 1;
      const neighbourSlot = ownerSlotAt(voxels, [ni, j, k]);
      if (neighbourSlot !== boneIndex + 1) {
        mask[j - bounds.jMin + (k - bounds.kMin) * dimU] = encodeMaskValue(
          colorAt(voxels, [i, j, k]),
          neighbourSlot,
          neighbourSlots,
        );
      }
    }
  }
  return mask;
};

const meshX = (voxels: Voxels, pass: AxisPass, b: Builder): void => {
  const { bounds, positive, neighbourSlots } = pass;
  const dimU = bounds.jMax - bounds.jMin + 1;
  const dimV = bounds.kMax - bounds.kMin + 1;
  for (let i = bounds.iMin; i <= bounds.iMax; i++) {
    const mask = maskX(voxels, pass, i, dimU);
    greedyMerge(dimU, dimV, mask, (rect, value) => {
      const j0 = rect.u0 + bounds.jMin;
      const k0 = rect.v0 + bounds.kMin;
      const x = edgeX(voxels, positive ? i + 1 : i);
      const corners: readonly [Point, Point, Point, Point] = [
        [x, edgeY(voxels, j0), edgeZ(voxels, k0)],
        [x, edgeY(voxels, j0 + rect.su), edgeZ(voxels, k0)],
        [x, edgeY(voxels, j0 + rect.su), edgeZ(voxels, k0 + rect.sv)],
        [x, edgeY(voxels, j0), edgeZ(voxels, k0 + rect.sv)],
      ];
      const color = decodeColor(value, neighbourSlots);
      const neighbourBone = decodeNeighbourBone(value, neighbourSlots);
      emitQuad(b, { corners, normal: [positive ? 1 : -1, 0, 0], reversed: !positive, color, neighbourBone });
    });
  }
};

/** mask axes: u = k (Z), v = i (X); u x v = +Y, matching meshY's winding convention. */
const maskY = (voxels: Voxels, pass: AxisPass, j: number, dimU: number): Int32Array => {
  const { bounds, boneIndex, positive, neighbourSlots } = pass;
  const mask = new Int32Array(dimU * (bounds.iMax - bounds.iMin + 1));
  for (let i = bounds.iMin; i <= bounds.iMax; i++) {
    for (let k = bounds.kMin; k <= bounds.kMax; k++) {
      if (!owns(voxels, boneIndex, [i, j, k])) {
        continue;
      }
      const nj = positive ? j + 1 : j - 1;
      const neighbourSlot = ownerSlotAt(voxels, [i, nj, k]);
      if (neighbourSlot !== boneIndex + 1) {
        mask[k - bounds.kMin + (i - bounds.iMin) * dimU] = encodeMaskValue(
          colorAt(voxels, [i, j, k]),
          neighbourSlot,
          neighbourSlots,
        );
      }
    }
  }
  return mask;
};

const meshY = (voxels: Voxels, pass: AxisPass, b: Builder): void => {
  const { bounds, positive, neighbourSlots } = pass;
  const dimU = bounds.kMax - bounds.kMin + 1;
  const dimV = bounds.iMax - bounds.iMin + 1;
  for (let j = bounds.jMin; j <= bounds.jMax; j++) {
    const mask = maskY(voxels, pass, j, dimU);
    greedyMerge(dimU, dimV, mask, (rect, value) => {
      const k0 = rect.u0 + bounds.kMin;
      const i0 = rect.v0 + bounds.iMin;
      const y = edgeY(voxels, positive ? j + 1 : j);
      const corners: readonly [Point, Point, Point, Point] = [
        [edgeX(voxels, i0), y, edgeZ(voxels, k0)],
        [edgeX(voxels, i0), y, edgeZ(voxels, k0 + rect.su)],
        [edgeX(voxels, i0 + rect.sv), y, edgeZ(voxels, k0 + rect.su)],
        [edgeX(voxels, i0 + rect.sv), y, edgeZ(voxels, k0)],
      ];
      const color = decodeColor(value, neighbourSlots);
      const neighbourBone = decodeNeighbourBone(value, neighbourSlots);
      emitQuad(b, { corners, normal: [0, positive ? 1 : -1, 0], reversed: !positive, color, neighbourBone });
    });
  }
};

/** mask axes: u = i (X), v = j (Y); u x v = +Z, matching meshZ's winding convention. */
const maskZ = (voxels: Voxels, pass: AxisPass, k: number, dimU: number): Int32Array => {
  const { bounds, boneIndex, positive, neighbourSlots } = pass;
  const mask = new Int32Array(dimU * (bounds.jMax - bounds.jMin + 1));
  for (let j = bounds.jMin; j <= bounds.jMax; j++) {
    for (let i = bounds.iMin; i <= bounds.iMax; i++) {
      if (!owns(voxels, boneIndex, [i, j, k])) {
        continue;
      }
      const nk = positive ? k + 1 : k - 1;
      const neighbourSlot = ownerSlotAt(voxels, [i, j, nk]);
      if (neighbourSlot !== boneIndex + 1) {
        mask[i - bounds.iMin + (j - bounds.jMin) * dimU] = encodeMaskValue(
          colorAt(voxels, [i, j, k]),
          neighbourSlot,
          neighbourSlots,
        );
      }
    }
  }
  return mask;
};

const meshZ = (voxels: Voxels, pass: AxisPass, b: Builder): void => {
  const { bounds, positive, neighbourSlots } = pass;
  const dimU = bounds.iMax - bounds.iMin + 1;
  const dimV = bounds.jMax - bounds.jMin + 1;
  for (let k = bounds.kMin; k <= bounds.kMax; k++) {
    const mask = maskZ(voxels, pass, k, dimU);
    greedyMerge(dimU, dimV, mask, (rect, value) => {
      const i0 = rect.u0 + bounds.iMin;
      const j0 = rect.v0 + bounds.jMin;
      const z = edgeZ(voxels, positive ? k + 1 : k);
      const corners: readonly [Point, Point, Point, Point] = [
        [edgeX(voxels, i0), edgeY(voxels, j0), z],
        [edgeX(voxels, i0 + rect.su), edgeY(voxels, j0), z],
        [edgeX(voxels, i0 + rect.su), edgeY(voxels, j0 + rect.sv), z],
        [edgeX(voxels, i0), edgeY(voxels, j0 + rect.sv), z],
      ];
      const color = decodeColor(value, neighbourSlots);
      const neighbourBone = decodeNeighbourBone(value, neighbourSlots);
      emitQuad(b, { corners, normal: [0, 0, positive ? 1 : -1], reversed: !positive, color, neighbourBone });
    });
  }
};

const meshOneBone = (voxels: Voxels, boneIndex: number, bounds: Bounds, neighbourSlots: number): BoneMesh => {
  const b = newBuilder();
  for (const positive of [true, false]) {
    const pass: AxisPass = { boneIndex, bounds, positive, neighbourSlots };
    meshX(voxels, pass, b);
    meshY(voxels, pass, b);
    meshZ(voxels, pass, b);
  }
  return {
    positions: new Float32Array(b.positions),
    normals: new Float32Array(b.normals),
    colors: new Uint8Array(b.colors),
    neighbourBone: new Int32Array(b.neighbourBone),
    indices: new Uint32Array(b.indices),
    triangles: b.indices.length / 3,
  };
};

/** Meshes every bone that owns at least one voxel; bones with none are left out. */
export const meshBones = (voxels: Voxels, boneCount: number): Map<number, BoneMesh> => {
  const bounds = boneBounds(voxels, boneCount);
  const neighbourSlots = boneCount + 1; // 0 = empty, else ownerBoneIndex + 1 — see encodeMaskValue
  const out = new Map<number, BoneMesh>();
  for (let boneIndex = 0; boneIndex < boneCount; boneIndex++) {
    const bb = bounds[boneIndex];
    if (bb) {
      out.set(boneIndex, meshOneBone(voxels, boneIndex, bb, neighbourSlots));
    }
  }
  return out;
};
