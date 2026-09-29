// Body -> voxels. See PROJECT-level spec (mobgen milestone 1, phase A) for the
// algorithm; the short version:
//   1. Per bone, smin its 'add' features into a field; hard-min across bones
//      (never smoothed across bones, so distinct limbs don't fuse).
//   2. Fill where the field is close enough to the surface (a slight
//      dilation so thin limbs survive at coarse voxel sizes).
//   3. Subtract 'carve' features.
//   4. Rasterize the skeleton itself ("marrow") as forced-filled voxels, so
//      the body is always one connected, correctly-owned structure even if
//      the flesh around a joint is thin or was carved away.
//   5. Materials: nearest add feature of the owning bone, then 'paint'
//      features override in order; a shade 0-3 comes from value noise mixed
//      with a per-voxel hash.

import type { Body, Feature, Material } from './body.ts';
import { MATERIALS } from './body.ts';
import { length, sub, type Vec3 } from './math.ts';
import { noise3 } from './random.ts';
import { type Aabb, aabbOf, evalShape, expand, smin, union } from './sdf.ts';

const NEIGHBOR_OFFSETS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface Voxels {
  readonly size: number;
  /** Grid-index of local (0, 0, 0): world x = (origin[0] + i) * size, etc. (see conventions.ts). */
  readonly origin: readonly [number, number, number];
  readonly dims: readonly [number, number, number];
  /** Bone index + 1 (index into Body.bones); 0 = empty. */
  readonly owner: Uint8Array;
  /** Material index (into MATERIALS) * 4 + shade (0-3); meaningful only where owner != 0. */
  readonly color: Uint8Array;
}

export const SHADES = 4;
export const materialOf = (colorByte: number): Material => MATERIALS[Math.floor(colorByte / SHADES)]!;
export const shadeOf = (colorByte: number): number => colorByte % SHADES;

export const cellIndex = (dims: Voxels['dims'], i: number, j: number, k: number): number =>
  i + j * dims[0] + k * dims[0] * dims[1];

export const worldPosition = (voxels: Pick<Voxels, 'size' | 'origin'>, i: number, j: number, k: number): Vec3 => {
  const { size, origin } = voxels;
  return [(origin[0] + i) * size, (origin[1] + j + 0.5) * size, (origin[2] + k) * size];
};

/** Filled if the field is within this much of the surface: a slight dilation so thin limbs survive. */
const fillTolerance = (v: number): number => 0.15 * v;
const DEFAULT_BLEND = 0.02;

/** The grid geometry plus the per-cell arrays every pass below reads or writes. Bundled so each
 * pass (field, carve, marrow, repair, material) can be its own top-level function. */
interface Grid {
  readonly size: number;
  readonly origin: readonly [number, number, number];
  readonly dims: readonly [number, number, number];
  readonly nCells: number;
  readonly field: Float32Array;
  readonly filled: Uint8Array;
  readonly owner: Uint8Array;
  readonly carvedMask: Uint8Array;
  readonly exposedBone: Uint8Array;
}

const inBounds = (dims: Voxels['dims'], i: number, j: number, k: number): boolean =>
  i >= 0 && i < dims[0] && j >= 0 && j < dims[1] && k >= 0 && k < dims[2];

const indexRange = (aabb: Aabb, v: number, dims: Voxels['dims'], origin: Voxels['origin']) => {
  // X, Z voxel centres are at i*v / k*v; Y centres are at (j + 0.5)*v.
  const lo = (min: number, centerOffset: number) => Math.floor(min / v - centerOffset) - 1;
  const hi = (max: number, centerOffset: number) => Math.ceil(max / v - centerOffset) + 1;
  const clip = (x: number, max: number) => Math.max(0, Math.min(max, x));
  const iMin = clip(lo(aabb.min[0], 0) - origin[0], dims[0] - 1);
  const iMax = clip(hi(aabb.max[0], 0) - origin[0], dims[0] - 1);
  const jMin = clip(lo(aabb.min[1], 0.5) - origin[1], dims[1] - 1);
  const jMax = clip(hi(aabb.max[1], 0.5) - origin[1], dims[1] - 1);
  const kMin = clip(lo(aabb.min[2], 0) - origin[2], dims[2] - 1);
  const kMax = clip(hi(aabb.max[2], 0) - origin[2], dims[2] - 1);
  return { iMin, iMax, jMin, jMax, kMin, kMax };
};

const nearestIndex = (p: Vec3, v: number, origin: Voxels['origin']): readonly [number, number, number] => [
  Math.round(p[0] / v) - origin[0],
  Math.round(p[1] / v - 0.5) - origin[1],
  Math.round(p[2] / v) - origin[2],
];

interface FeaturesByRole {
  readonly addByBone: ReadonlyMap<string, readonly Feature[]>;
  readonly carves: readonly Feature[];
  readonly paints: readonly Feature[];
}

const classifyFeatures = (body: Body): FeaturesByRole => {
  const addByBone = new Map<string, Feature[]>();
  const carves: Feature[] = [];
  const paints: Feature[] = [];
  for (const f of body.features) {
    if (f.op === 'add') {
      const list = addByBone.get(f.bone) ?? [];
      list.push(f);
      addByBone.set(f.bone, list);
    } else if (f.op === 'carve') {
      carves.push(f);
    } else {
      paints.push(f);
    }
  }
  return { addByBone, carves, paints };
};

const boneAabb = (feats: readonly Feature[] | undefined, size: number): Aabb | undefined => {
  if (!feats || feats.length === 0) {
    return;
  }
  const maxBlend = Math.max(...feats.map((f) => f.blend ?? DEFAULT_BLEND));
  return expand(union(feats.map((f) => aabbOf(f.shape))), maxBlend + size);
};

/** Per-bone AABB (undefined for a bone with no flesh of its own), used both to size the grid and to
 * prune each bone's own field-evaluation loop to its own neighbourhood. */
const boneAabbsOf = (body: Body, addByBone: FeaturesByRole['addByBone'], size: number): (Aabb | undefined)[] => {
  const aabbs: (Aabb | undefined)[] = [];
  for (const bone of body.bones) {
    aabbs.push(boneAabb(addByBone.get(bone.id), size));
  }
  return aabbs;
};

const newGrid = (size: number, gridAabb: Aabb): Grid => {
  const origin: [number, number, number] = [
    Math.floor(gridAabb.min[0] / size) - 1,
    Math.floor(gridAabb.min[1] / size - 0.5) - 1,
    Math.floor(gridAabb.min[2] / size) - 1,
  ];
  const dims: [number, number, number] = [
    Math.ceil(gridAabb.max[0] / size) + 1 - origin[0] + 1,
    Math.ceil(gridAabb.max[1] / size - 0.5) + 1 - origin[1] + 1,
    Math.ceil(gridAabb.max[2] / size) + 1 - origin[2] + 1,
  ];
  const nCells = dims[0] * dims[1] * dims[2];
  return {
    size,
    origin,
    dims,
    nCells,
    field: new Float32Array(nCells).fill(Number.POSITIVE_INFINITY),
    filled: new Uint8Array(nCells),
    owner: new Uint8Array(nCells),
    carvedMask: new Uint8Array(nCells),
    exposedBone: new Uint8Array(nCells),
  };
};

/** smin of one bone's own add features at a single point — the field value it contributes there. */
const boneFieldAt = (feats: readonly Feature[], p: Vec3): number => {
  let acc = Number.POSITIVE_INFINITY;
  for (const f of feats) {
    const d = evalShape(f.shape, p);
    acc = acc === Number.POSITIVE_INFINITY ? d : smin(acc, d, f.blend ?? DEFAULT_BLEND);
  }
  return acc;
};

interface BoneField {
  readonly boneIndex: number;
  readonly feats: readonly Feature[];
  readonly aabb: Aabb;
}

/** One bone's contribution to the field: smin its own add features at every cell in its own AABB,
 * keeping the result only where it beats whatever's already there (the hard-min/argmin across bones). */
const evaluateBoneField = (grid: Grid, rawOwner: Uint8Array, bone: BoneField): void => {
  const { dims, origin, size } = grid;
  const { iMin, iMax, jMin, jMax, kMin, kMax } = indexRange(bone.aabb, size, dims, origin);
  for (let k = kMin; k <= kMax; k++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const acc = boneFieldAt(bone.feats, worldPosition(grid, i, j, k));
        const idx = cellIndex(dims, i, j, k);
        if (acc < grid.field[idx]!) {
          grid.field[idx] = acc;
          rawOwner[idx] = bone.boneIndex + 1;
        }
      }
    }
  }
};

/** Filled where the argmin bone's field is close enough to the surface (fillTolerance's dilation). */
const finalizeFill = (grid: Grid, rawOwner: Uint8Array): void => {
  const tol = fillTolerance(grid.size);
  for (let idx = 0; idx < grid.nCells; idx++) {
    const isFilled = rawOwner[idx] !== 0 && grid.field[idx]! <= tol;
    grid.filled[idx] = isFilled ? 1 : 0;
    grid.owner[idx] = isFilled ? rawOwner[idx]! : 0;
  }
};

/** Per bone: smin its own add features into a field, then hard-min (argmin) across bones — see the
 * module doc comment. Fills `grid.filled`/`grid.owner` from the result. */
const computeField = (
  grid: Grid,
  body: Body,
  addByBone: FeaturesByRole['addByBone'],
  boneAabbs: readonly (Aabb | undefined)[],
): void => {
  const rawOwner = new Uint8Array(grid.nCells);
  for (const [bi, bone] of body.bones.entries()) {
    const feats = addByBone.get(bone.id);
    const aabb = boneAabbs[bi];
    if (feats && aabb) {
      evaluateBoneField(grid, rawOwner, { boneIndex: bi, feats, aabb });
    }
  }
  finalizeFill(grid, rawOwner);
};

const markCarved = (grid: Grid, carve: Feature): void => {
  const { dims, origin, size } = grid;
  const { iMin, iMax, jMin, jMax, kMin, kMax } = indexRange(aabbOf(carve.shape), size, dims, origin);
  for (let k = kMin; k <= kMax; k++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        if (evalShape(carve.shape, worldPosition(grid, i, j, k)) <= 0) {
          grid.carvedMask[cellIndex(dims, i, j, k)] = 1;
        }
      }
    }
  }
};

const applyCarves = (grid: Grid, carves: readonly Feature[]): void => {
  for (const f of carves) {
    markCarved(grid, f);
  }
  for (let idx = 0; idx < grid.nCells; idx++) {
    if (grid.carvedMask[idx]) {
      grid.filled[idx] = 0;
      grid.owner[idx] = 0;
    }
  }
};

/** head -> tail, and (when it doesn't already start where the parent ends) parent.head -> bone.head,
 * so the skeleton stays one connected structure even across an offset joint. */
const marrowSegments = (body: Body): { readonly bone: string; readonly a: Vec3; readonly b: Vec3 }[] => {
  const byId = new Map(body.bones.map((b) => [b.id, b]));
  const segments: { bone: string; a: Vec3; b: Vec3 }[] = [];
  for (const bone of body.bones) {
    segments.push({ bone: bone.id, a: bone.head, b: bone.tail });
    const parent = bone.parent ? byId.get(bone.parent) : undefined;
    if (
      parent &&
      length([bone.head[0] - parent.tail[0], bone.head[1] - parent.tail[1], bone.head[2] - parent.tail[2]]) > 1e-6
    ) {
      segments.push({ bone: bone.id, a: parent.head, b: bone.head });
    }
  }
  return segments;
};

/** Rasterizes every bone's marrow as forced-filled, forced-owned voxels: the skeleton is always one
 * connected structure, however thin the flesh around a joint is or however much of it was carved away
 * (a marrow voxel a carve removed is flagged `exposedBone`, painted as bone rather than skin/material). */
const applyMarrow = (grid: Grid, body: Body, boneIndexById: ReadonlyMap<string, number>): void => {
  const { dims, origin, size } = grid;
  for (const seg of marrowSegments(body)) {
    const bi = boneIndexById.get(seg.bone)!;
    const segLen = length([seg.b[0] - seg.a[0], seg.b[1] - seg.a[1], seg.b[2] - seg.a[2]]);
    const steps = Math.max(1, Math.ceil(segLen / (size / 3)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p: Vec3 = [
        seg.a[0] + (seg.b[0] - seg.a[0]) * t,
        seg.a[1] + (seg.b[1] - seg.a[1]) * t,
        seg.a[2] + (seg.b[2] - seg.a[2]) * t,
      ];
      const [i, j, k] = nearestIndex(p, size, origin);
      if (!inBounds(dims, i, j, k)) {
        continue;
      }
      const idx = cellIndex(dims, i, j, k);
      if (grid.carvedMask[idx]) {
        grid.exposedBone[idx] = 1;
      }
      grid.filled[idx] = 1;
      grid.owner[idx] = bi + 1;
    }
  }
};

/** Which axis (and which of its two directions) a bone's own head->tail segment mostly points along —
 * used to pick a neighbour cell "toward the child" or "toward the parent" for the joint repair below. */
const dominantAxis = (from: Vec3, to: Vec3): { readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 } => {
  const d = sub(to, from);
  const absD: readonly [number, number, number] = [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])];
  let axis: 0 | 1 | 2 = 0;
  if (absD[1] > absD[axis]) {
    axis = 1;
  }
  if (absD[2] > absD[axis]) {
    axis = 2;
  }
  return { axis, sign: d[axis] >= 0 ? 1 : -1 };
};

const directlyTouches = (grid: Grid, cells: readonly number[], childIdx: number, parentIdx: number): boolean => {
  const [nx, ny, nz] = grid.dims;
  for (const idx of cells) {
    if (grid.owner[idx] !== childIdx + 1) {
      continue;
    }
    const k = Math.floor(idx / (nx * ny));
    const j = Math.floor((idx - k * nx * ny) / nx);
    const i = idx - k * nx * ny - j * nx;
    for (const [di, dj, dk] of NEIGHBOR_OFFSETS) {
      const ni = i + di;
      const nj = j + dj;
      const nk = k + dk;
      if (ni >= 0 && ni < nx && nj >= 0 && nj < ny && nk >= 0 && nk < nz) {
        if (grid.owner[cellIndex(grid.dims, ni, nj, nk)] === parentIdx + 1) {
          return true;
        }
      }
    }
  }
  return false;
};

/** `cell` itself plus its 6 face-neighbours, as flattened indices (out-of-bounds ones left out). */
const withNeighbors = (dims: Voxels['dims'], cell: readonly [number, number, number]): number[] => {
  const [ci, cj, ck] = cell;
  const cells = [cellIndex(dims, ci, cj, ck)];
  for (const [di, dj, dk] of NEIGHBOR_OFFSETS) {
    const neighbor: readonly [number, number, number] = [ci + di, cj + dj, ck + dk];
    if (inBounds(dims, ...neighbor)) {
      cells.push(cellIndex(dims, ...neighbor));
    }
  }
  return cells;
};

interface JointRepair {
  readonly cell: readonly [number, number, number];
  readonly childIdx: number;
  readonly parentIdx: number;
  readonly axis: 0 | 1 | 2;
  readonly sign: 1 | -1;
}

/** Forces one cell to each side of the joint along its dominant axis: one owned by the child, one by
 * the parent, guaranteeing 6-neighbour adjacency regardless of how the marrow rasterized. */
const forceJointCells = (grid: Grid, repair: JointRepair): void => {
  const { dims } = grid;
  const [ci, cj, ck] = repair.cell;
  const off: [number, number, number] = [0, 0, 0];
  off[repair.axis] = repair.sign;
  const childCell: readonly [number, number, number] = [ci + off[0], cj + off[1], ck + off[2]];
  const parentCell: readonly [number, number, number] = [ci - off[0], cj - off[1], ck - off[2]];
  if (inBounds(dims, ...childCell)) {
    const idx = cellIndex(dims, ...childCell);
    grid.filled[idx] = 1;
    grid.owner[idx] = repair.childIdx + 1;
  }
  if (inBounds(dims, ...parentCell)) {
    const idx = cellIndex(dims, ...parentCell);
    grid.filled[idx] = 1;
    grid.owner[idx] = repair.parentIdx + 1;
  }
};

/** A joint whose segments are shorter than a voxel can have its shared boundary cell fully claimed by
 * whichever bone's marrow was rasterized last (see the `attached` rule), even though both bones are
 * present nearby. If the joint isn't already face-adjacent, force one cell to each side of it. */
const repairJointAdjacency = (grid: Grid, body: Body, boneIndexById: ReadonlyMap<string, number>): void => {
  for (const bone of body.bones) {
    if (bone.parent === null) {
      continue;
    }
    const childIdx = boneIndexById.get(bone.id)!;
    const parentIdx = boneIndexById.get(bone.parent)!;
    const cell = nearestIndex(bone.head, grid.size, grid.origin);
    if (!inBounds(grid.dims, ...cell)) {
      continue;
    }
    const nearby = withNeighbors(grid.dims, cell);
    if (directlyTouches(grid, nearby, childIdx, parentIdx)) {
      continue;
    }
    const { axis, sign } = dominantAxis(bone.head, bone.tail);
    forceJointCells(grid, { cell, childIdx, parentIdx, axis, sign });
  }
};

const nearestMaterial = (feats: readonly Feature[], p: Vec3): number => {
  let bestDist = Number.POSITIVE_INFINITY;
  let bestMat: Material = 'skin';
  for (const f of feats) {
    const d = Math.abs(evalShape(f.shape, p));
    if (d < bestDist) {
      bestDist = d;
      bestMat = f.material;
    }
  }
  return MATERIALS.indexOf(bestMat);
};

interface MaterialContext {
  readonly addByBone: FeaturesByRole['addByBone'];
  readonly paints: readonly Feature[];
  readonly seed: number;
}

/** i, j, k from a flattened cell index — the inverse of cellIndex. */
const cellCoords = (dims: Voxels['dims'], idx: number): readonly [number, number, number] => {
  const k = Math.floor(idx / (dims[0] * dims[1]));
  const j = Math.floor((idx - k * dims[0] * dims[1]) / dims[0]);
  const i = idx - k * dims[0] * dims[1] - j * dims[0];
  return [i, j, k];
};

/** A filled voxel's material: the owning bone's nearest add feature (or exposed bone, if marrow was
 * carved), then every paint feature that covers it, in Body.features order. Shade comes from low-
 * frequency noise mixed with a per-voxel hash, so neighbouring voxels tend to agree and faces merge. */
const paintMaterial = (grid: Grid, body: Body, ctx: MaterialContext, idx: number): number => {
  const [i, j, k] = cellCoords(grid.dims, idx);
  const p = worldPosition(grid, i, j, k);
  const bone = body.bones[grid.owner[idx]! - 1]!;
  const boneMaterialIndex = MATERIALS.indexOf('bone');
  let matIdx = grid.exposedBone[idx] ? boneMaterialIndex : nearestMaterial(ctx.addByBone.get(bone.id) ?? [], p);
  for (const paint of ctx.paints) {
    if (evalShape(paint.shape, p) > 0) {
      continue;
    }
    if (paint.onto && !paint.onto.includes(MATERIALS[matIdx]!)) {
      continue;
    }
    if (paint.noise) {
      const n = noise3(p[0] / paint.noise.scale, p[1] / paint.noise.scale, p[2] / paint.noise.scale, ctx.seed);
      if (n >= paint.noise.threshold) {
        continue;
      }
    }
    matIdx = MATERIALS.indexOf(paint.material);
  }
  const coarse = noise3(p[0] / 0.12, p[1] / 0.12, p[2] / 0.12, ctx.seed);
  const fine = noise3(i * 3.1, j * 3.1, k * 3.1, ctx.seed ^ 0x9e_37_79_b9);
  const shade = Math.min(SHADES - 1, Math.floor((coarse * 0.7 + fine * 0.3) * SHADES));
  return matIdx * SHADES + shade;
};

const assignMaterials = (grid: Grid, body: Body, ctx: MaterialContext): Uint8Array => {
  const color = new Uint8Array(grid.nCells);
  for (let idx = 0; idx < grid.nCells; idx++) {
    if (grid.filled[idx]) {
      color[idx] = paintMaterial(grid, body, ctx, idx);
    }
  }
  return color;
};

export const voxelize = (body: Body, size: number, seed: number): Voxels => {
  const { addByBone, carves, paints } = classifyFeatures(body);
  const boneAabbs = boneAabbsOf(body, addByBone, size);
  const gridAabb = expand(union(boneAabbs.filter((a): a is Aabb => a !== undefined)), size);
  const grid = newGrid(size, gridAabb);
  const boneIndexById = new Map(body.bones.map((b, i) => [b.id, i]));

  computeField(grid, body, addByBone, boneAabbs);
  applyCarves(grid, carves);
  applyMarrow(grid, body, boneIndexById);
  repairJointAdjacency(grid, body, boneIndexById);
  const color = assignMaterials(grid, body, { addByBone, paints, seed });

  return { size: grid.size, origin: grid.origin, dims: grid.dims, owner: grid.owner, color };
};
