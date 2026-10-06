/**
 * Voxel shapes for vehicle parts: JSON-shaped ops, their rasterization into a sparse grid, and a
 * greedy mesher that turns a grid into merged quads.
 */

export type Axis = 'x' | 'y' | 'z';
export type Vec3i = readonly [x: number, y: number, z: number];
type Point2 = readonly [u: number, v: number];

/** A material named `air` carves; `paint` recolours only voxels that are already there. */
interface OpBase {
  readonly mat: string;
  readonly paint?: true;
}
/** Fills `[from, to)` on each axis. */
interface BoxOp extends OpBase {
  readonly op: 'box';
  readonly from: Vec3i;
  readonly to: Vec3i;
}
/** A polygon in the plane across `axis`, extruded through `[from, to)`; see `PLANE` for the plane's axes. */
interface PrismOp extends OpBase {
  readonly op: 'prism';
  readonly axis: Axis;
  readonly profile: readonly Point2[];
  readonly from: number;
  readonly to: number;
}
/** A disc (or ring, with `inner`) across `axis`, through `[from, to)`; `sectors` keeps alternate wedges. */
interface CylinderOp extends OpBase {
  readonly op: 'cylinder';
  readonly axis: Axis;
  readonly center: Point2;
  readonly radius: number;
  readonly inner?: number;
  readonly from: number;
  readonly to: number;
  readonly sectors?: { readonly count: number; readonly duty: number };
}
export type ShapeOp = BoxOp | PrismOp | CylinderOp;

const AIR = 'air';
export const GLASS = 'glass';

/** Sparse voxels keyed by `voxelKey`, valued by material name. */
export type VoxelGrid = Map<number, string>;

const OFFSET = 512;
const MASK = 1023;
export const voxelKey = (x: number, y: number, z: number): number =>
  (x + OFFSET) | ((y + OFFSET) << 10) | ((z + OFFSET) << 20);
export const keyVoxel = (key: number): [number, number, number] => [
  (key & MASK) - OFFSET,
  ((key >> 10) & MASK) - OFFSET,
  ((key >> 20) & MASK) - OFFSET,
];

/** Indices into [x, y, z] of a plane's u, v and the axis itself: across z the plane is (x, y), across x (z, y), across y (x, z). */
const PLANE: Record<Axis, readonly [number, number, number]> = { x: [2, 1, 0], y: [0, 2, 1], z: [0, 1, 2] };

const compose = (axis: Axis, u: number, v: number, w: number): [number, number, number] => {
  const out: [number, number, number] = [0, 0, 0];
  const [iu, iv, iw] = PLANE[axis];
  out[iu] = u;
  out[iv] = v;
  out[iw] = w;
  return out;
};

const write = (grid: VoxelGrid, [x, y, z]: Vec3i, op: OpBase): void => {
  const key = voxelKey(x, y, z);
  if (op.paint) {
    if (grid.has(key)) {
      grid.set(key, op.mat);
    }
  } else if (op.mat === AIR) {
    grid.delete(key);
  } else {
    grid.set(key, op.mat);
  }
};

const insidePolygon = (u: number, v: number, polygon: readonly Point2[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [ui, vi] = polygon[i]!;
    const [uj, vj] = polygon[j]!;
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) {
      inside = !inside;
    }
  }
  return inside;
};

const applyBox = (grid: VoxelGrid, op: BoxOp): void => {
  const [x0, y0, z0] = op.from;
  const [x1, y1, z1] = op.to;
  for (let x = x0; x < x1; x += 1) {
    for (let y = y0; y < y1; y += 1) {
      for (let z = z0; z < z1; z += 1) {
        write(grid, [x, y, z], op);
      }
    }
  }
};

const extrude = (grid: VoxelGrid, op: PrismOp | CylinderOp, u: number, v: number): void => {
  for (let w = op.from; w < op.to; w += 1) {
    write(grid, compose(op.axis, u, v, w), op);
  }
};

const applyPrism = (grid: VoxelGrid, op: PrismOp): void => {
  const us = op.profile.map(([u]) => u);
  const vs = op.profile.map(([, v]) => v);
  for (let u = Math.floor(Math.min(...us)); u < Math.ceil(Math.max(...us)); u += 1) {
    for (let v = Math.floor(Math.min(...vs)); v < Math.ceil(Math.max(...vs)); v += 1) {
      if (insidePolygon(u + 0.5, v + 0.5, op.profile)) {
        extrude(grid, op, u, v);
      }
    }
  }
};

const inSector = (du: number, dv: number, sectors: CylinderOp['sectors']): boolean => {
  if (!sectors) {
    return true;
  }
  const turn = (Math.atan2(dv, du) / (2 * Math.PI) + 1) % 1;
  return (turn * sectors.count) % 1 < sectors.duty;
};

const applyCylinder = (grid: VoxelGrid, op: CylinderOp): void => {
  const [cu, cv] = op.center;
  for (let u = Math.floor(cu - op.radius); u < Math.ceil(cu + op.radius); u += 1) {
    for (let v = Math.floor(cv - op.radius); v < Math.ceil(cv + op.radius); v += 1) {
      const du = u + 0.5 - cu;
      const dv = v + 0.5 - cv;
      const distance = Math.hypot(du, dv);
      if (distance < op.radius && distance >= (op.inner ?? 0) && inSector(du, dv, op.sectors)) {
        extrude(grid, op, u, v);
      }
    }
  }
};

export const rasterize = (ops: readonly ShapeOp[]): VoxelGrid => {
  const grid: VoxelGrid = new Map();
  for (const op of ops) {
    if (op.op === 'box') {
      applyBox(grid, op);
    } else if (op.op === 'prism') {
      applyPrism(grid, op);
    } else {
      applyCylinder(grid, op);
    }
  }
  return grid;
};

const shiftPlane = (axis: Axis, [u, v]: Point2, origin: Vec3i): Point2 => {
  const [iu, iv] = PLANE[axis];
  return [u - origin[iu]!, v - origin[iv]!];
};

/** The same op with `origin` moved to (0, 0, 0). */
export const translateOp = (op: ShapeOp, origin: Vec3i): ShapeOp => {
  if (op.op === 'box') {
    const [ox, oy, oz] = origin;
    return {
      ...op,
      from: [op.from[0] - ox, op.from[1] - oy, op.from[2] - oz],
      to: [op.to[0] - ox, op.to[1] - oy, op.to[2] - oz],
    };
  }
  const w = origin[PLANE[op.axis][2]]!;
  if (op.op === 'prism') {
    return {
      ...op,
      profile: op.profile.map((point) => shiftPlane(op.axis, point, origin)),
      from: op.from - w,
      to: op.to - w,
    };
  }
  return { ...op, center: shiftPlane(op.axis, op.center, origin), from: op.from - w, to: op.to - w };
};

/** The smallest corner any op can write to (carving ops included). */
export const opsMinimum = (ops: readonly ShapeOp[]): [number, number, number] => {
  const low: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const take = (corner: readonly number[]): void => {
    for (let i = 0; i < 3; i += 1) {
      low[i] = Math.min(low[i]!, Math.floor(corner[i]!));
    }
  };
  for (const op of ops) {
    if (op.op === 'box') {
      take(op.from);
    } else if (op.op === 'prism') {
      for (const [u, v] of op.profile) {
        take(compose(op.axis, u, v, op.from));
      }
    } else {
      take(compose(op.axis, op.center[0] - op.radius, op.center[1] - op.radius, op.from));
    }
  }
  return low;
};

/** Reflects local z about the plane between -1 and 0, so a mirrored fitting is placed at `2 × centre − at`. */
export const mirrorZ = (grid: VoxelGrid): VoxelGrid => {
  const mirrored: VoxelGrid = new Map();
  for (const [key, mat] of grid) {
    const [x, y, z] = keyVoxel(key);
    mirrored.set(voxelKey(x, y, -1 - z), mat);
  }
  return mirrored;
};

const IN_PLANE: Record<Axis, readonly Vec3i[]> = {
  x: [[0, -1, 0]],
  y: [[-1, 0, 0]],
  z: [
    [-1, 0, 0],
    [0, -1, 0],
  ],
};

/**
 * Panel lines: `mat` voxels on a panel's edge become `seam`. Only the rear (−x) and lower (−y) edges
 * count, so two panels meeting edge to edge draw one line between them, not two. `normal` is the
 * panel's facing axis; edges across the car are authored where a panel needs them.
 */
export const markSeams = (grid: VoxelGrid, normal: Axis, mat: string, seam: string): void => {
  const edges: number[] = [];
  for (const [key, value] of grid) {
    if (value !== mat) {
      continue;
    }
    const [x, y, z] = keyVoxel(key);
    if (IN_PLANE[normal].some(([dx, dy, dz]) => !grid.has(voxelKey(x + dx, y + dy, z + dz)))) {
      edges.push(key);
    }
  }
  for (const key of edges) {
    grid.set(key, seam);
  }
};

export interface GridBounds {
  readonly min: Vec3i;
  readonly max: Vec3i;
}

/** Inclusive voxel bounds of a non-empty grid. */
export const gridBounds = (grid: VoxelGrid): GridBounds => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const key of grid.keys()) {
    const voxel = keyVoxel(key);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i]!, voxel[i]!);
      max[i] = Math.max(max[i]!, voxel[i]!);
    }
  }
  return { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] };
};

export type Rgb = readonly [r: number, g: number, b: number];

export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  readonly quads: number;
}

/** One mesh pass over a grid, and the buffers it fills. */
interface Pass {
  readonly grid: VoxelGrid;
  readonly bounds: GridBounds;
  readonly colorOf: (mat: string) => Rgb;
  readonly include: (mat: string) => boolean;
  readonly blocks: (neighbour: string | undefined) => boolean;
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly indices: number[];
}

/** Faces whose normal is `sign` along axis `d` (0 = x); `u` and `v` are the next two axes, cyclically. */
interface Sweep {
  readonly d: number;
  readonly u: number;
  readonly v: number;
  readonly sign: 1 | -1;
  readonly step: Vec3i;
}

type Mask = (string | undefined)[];
type Rect = readonly [u: number, v: number, width: number, height: number];

const emitQuad = (pass: Pass, sweep: Sweep, { plane, rect, mat }: { plane: number; rect: Rect; mat: string }): void => {
  const [u0, v0, width, height] = rect;
  const corners: [number, number][] = [
    [u0, v0],
    [u0 + width, v0],
    [u0 + width, v0 + height],
    [u0, v0 + height],
  ];
  if (sweep.sign < 0) {
    corners.reverse();
  }
  const base = pass.positions.length / 3;
  const rgb = pass.colorOf(mat);
  for (const [cu, cv] of corners) {
    const position = [0, 0, 0];
    position[sweep.d] = plane;
    position[sweep.u] = cu;
    position[sweep.v] = cv;
    pass.positions.push(...position);
    pass.normals.push(...sweep.step);
    pass.colors.push(...rgb);
  }
  pass.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
};

const runWidth = (mask: Mask, start: number, limit: number): number => {
  let width = 1;
  while (width < limit && mask[start + width] === mask[start]) {
    width += 1;
  }
  return width;
};

const rowMatches = (mask: Mask, start: number, width: number, mat: string): boolean => {
  for (let k = 0; k < width; k += 1) {
    if (mask[start + k] !== mat) {
      return false;
    }
  }
  return true;
};

/** Merges equal neighbours of a slice's mask into rectangles: widest run first, then as many rows as match. */
const greedyRectangles = (
  mask: Mask,
  [du, dv]: readonly [number, number],
  emit: (rect: Rect, mat: string) => void,
): void => {
  for (let j = 0; j < dv; j += 1) {
    for (let i = 0; i < du; ) {
      const start = i + j * du;
      const mat = mask[start];
      if (mat === undefined) {
        i += 1;
        continue;
      }
      const width = runWidth(mask, start, du - i);
      let height = 1;
      while (j + height < dv && rowMatches(mask, start + height * du, width, mat)) {
        height += 1;
      }
      for (let row = 0; row < height; row += 1) {
        mask.fill(undefined, start + row * du, start + row * du + width);
      }
      emit([i, j, width, height], mat);
      i += width;
    }
  }
};

/** The exposed faces of one slice of the sweep, as a u-by-v mask of materials. */
const sliceMask = (pass: Pass, sweep: Sweep, w: number): Mask => {
  const { min, max } = pass.bounds;
  const du = max[sweep.u]! - min[sweep.u]! + 1;
  const dv = max[sweep.v]! - min[sweep.v]! + 1;
  const [sx, sy, sz] = sweep.step;
  const mask: Mask = new Array(du * dv);
  const at = [0, 0, 0];
  at[sweep.d] = w;
  for (let j = 0; j < dv; j += 1) {
    for (let i = 0; i < du; i += 1) {
      at[sweep.u] = min[sweep.u]! + i;
      at[sweep.v] = min[sweep.v]! + j;
      const [x, y, z] = at as [number, number, number];
      const mat = pass.grid.get(voxelKey(x, y, z));
      if (mat !== undefined && pass.include(mat) && !pass.blocks(pass.grid.get(voxelKey(x + sx, y + sy, z + sz)))) {
        mask[i + j * du] = mat;
      }
    }
  }
  return mask;
};

const sweepSlices = (pass: Pass, sweep: Sweep): void => {
  const { min, max } = pass.bounds;
  const size = [max[sweep.u]! - min[sweep.u]! + 1, max[sweep.v]! - min[sweep.v]! + 1] as const;
  for (let w = min[sweep.d]!; w <= max[sweep.d]!; w += 1) {
    const plane = w + (sweep.sign > 0 ? 1 : 0);
    greedyRectangles(sliceMask(pass, sweep, w), size, ([i, j, width, height], mat) =>
      emitQuad(pass, sweep, { plane, rect: [min[sweep.u]! + i, min[sweep.v]! + j, width, height], mat }),
    );
  }
};

const meshPass = (
  grid: VoxelGrid,
  include: Pass['include'],
  blocks: Pass['blocks'],
  colorOf: Pass['colorOf'],
): MeshBuffers => {
  if (grid.size === 0) {
    return {
      positions: new Float32Array(),
      normals: new Float32Array(),
      colors: new Float32Array(),
      indices: new Uint32Array(),
      quads: 0,
    };
  }
  const pass: Pass = {
    grid,
    bounds: gridBounds(grid),
    colorOf,
    include,
    blocks,
    positions: [],
    normals: [],
    colors: [],
    indices: [],
  };
  for (let d = 0; d < 3; d += 1) {
    for (const sign of [1, -1] as const) {
      const step: [number, number, number] = [0, 0, 0];
      step[d] = sign;
      sweepSlices(pass, { d, u: (d + 1) % 3, v: (d + 2) % 3, sign, step });
    }
  }
  return {
    positions: new Float32Array(pass.positions),
    normals: new Float32Array(pass.normals),
    colors: new Float32Array(pass.colors),
    indices: new Uint32Array(pass.indices),
    quads: pass.indices.length / 6,
  };
};

/**
 * Greedy-meshes a grid in voxel units, as two buffers: `solid` draws every opaque face that isn't
 * against another opaque voxel (so faces behind glass are kept), and `clear` draws glass faces that
 * touch nothing at all.
 */
export const meshGrid = (
  grid: VoxelGrid,
  colorOf: (mat: string) => Rgb,
  isClear: (mat: string) => boolean,
): { readonly solid: MeshBuffers; readonly clear: MeshBuffers } => ({
  solid: meshPass(
    grid,
    (mat) => !isClear(mat),
    (neighbour) => neighbour !== undefined && !isClear(neighbour),
    colorOf,
  ),
  clear: meshPass(grid, isClear, (neighbour) => neighbour !== undefined, colorOf),
});
