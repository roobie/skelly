// Samples closed triangle meshes onto a voxel grid and greedy-meshes the result. It knows nothing of assemblies or
// glTF: `glb.ts` feeds it one part's solids (metres, part-local) and writes what comes back.
//
// A solid is sampled by casting a ray along z through each column of voxel centres, nudged off the centres by a fixed
// fraction of a voxel so a ray never runs along a mesh edge. The spans between paired crossings are filled. No solid
// vanishes: one too thin or small to hold a voxel centre keeps at least one voxel (see `fillSource`); solids that hold
// one are not thickened. Open meshes (an odd crossing count) drop the unpaired crossing.

export interface VoxelSource {
  /** Part-local metres, three numbers per vertex. */
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
  /** Voxels take the group of the last source that covers them; each group meshes on its own. */
  readonly group: number;
}

export interface VoxelBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

export interface Voxelized {
  readonly groups: ReadonlyMap<number, VoxelBuffers>;
  readonly stats: { readonly voxels: number; readonly faces: number; readonly quads: number };
}

const HALF_RANGE = 1024;
const RANGE = 2 * HALF_RANGE;
const NUDGE_X = 0.0137;
const NUDGE_Y = 0.0291;

const keyOf = (x: number, y: number, z: number): number =>
  ((x + HALF_RANGE) * RANGE + (y + HALF_RANGE)) * RANGE + (z + HALF_RANGE);
const voxelOf = (key: number): [number, number, number] => {
  const z = key % RANGE;
  const y = Math.floor(key / RANGE) % RANGE;
  return [Math.floor(key / RANGE / RANGE) - HALF_RANGE, y - HALF_RANGE, z - HALF_RANGE];
};

type Grid = Map<number, number>;

const checkedIndex = (value: number, grain: number): number => {
  const index = Math.floor(value / grain);
  if (Math.abs(index) >= HALF_RANGE) {
    throw new Error(`Voxel grain ${grain} m is too fine for a model this large`);
  }
  return index;
};

/** `ray` is the axis the rays run along; `across` are the two axes of the lattice of columns they start from. */
interface Axes {
  readonly across: readonly [number, number];
  readonly ray: number;
}

type Columns = Map<number, number[]>;

/** Adds the crossing of one triangle with each column of the sample lattice it covers. */
const addTriangle = (
  columns: Columns,
  at: (vertex: number, axis: number) => number,
  triangle: readonly [number, number, number],
  sampling: { readonly axes: Axes; readonly grain: number },
): void => {
  const [a, b, c] = triangle;
  const { grain, axes } = sampling;
  const [ax, ay] = axes.across;
  const area = (at(b, ax) - at(a, ax)) * (at(c, ay) - at(a, ay)) - (at(c, ax) - at(a, ax)) * (at(b, ay) - at(a, ay));
  if (Math.abs(area) < 1e-18) {
    return;
  }
  const columnsOf = (axis: number, nudge: number): [number, number] => [
    Math.ceil(Math.min(at(a, axis), at(b, axis), at(c, axis)) / grain - 0.5 - nudge),
    Math.floor(Math.max(at(a, axis), at(b, axis), at(c, axis)) / grain - 0.5 - nudge),
  ];
  const [x0, x1] = columnsOf(ax, NUDGE_X);
  const [y0, y1] = columnsOf(ay, NUDGE_Y);
  for (let ix = x0; ix <= x1; ix += 1) {
    for (let iy = y0; iy <= y1; iy += 1) {
      const px = (ix + 0.5 + NUDGE_X) * grain;
      const py = (iy + 0.5 + NUDGE_Y) * grain;
      const wa = ((at(b, ax) - px) * (at(c, ay) - py) - (at(c, ax) - px) * (at(b, ay) - py)) / area;
      const wb = ((at(c, ax) - px) * (at(a, ay) - py) - (at(a, ax) - px) * (at(c, ay) - py)) / area;
      const wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) {
        continue;
      }
      const key = (checkedIndex(px, grain) + HALF_RANGE) * RANGE + (checkedIndex(py, grain) + HALF_RANGE);
      const depth = wa * at(a, axes.ray) + wb * at(b, axes.ray) + wc * at(c, axes.ray);
      columns.set(key, [...(columns.get(key) ?? []), depth]);
    }
  }
};

/** The ray-axis coordinate of every triangle crossing, per column of the sample lattice. */
const crossings = (source: VoxelSource, grain: number, axes: Axes): Columns => {
  const { positions, indices } = source;
  const columns: Columns = new Map();
  const at = (vertex: number, axis: number): number => positions[vertex * 3 + axis]!;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    addTriangle(columns, at, [indices[t]!, indices[t + 1]!, indices[t + 2]!], { axes, grain });
  }
  return columns;
};

/**
 * Fills the voxels whose centres lie inside the solid along one axis, and says whether it filled any. With `rescue`, a
 * span that holds no centre still fills the voxel at its middle, so a thin solid keeps one voxel of thickness.
 */
const fillAlong = (
  target: { readonly grid: Grid; readonly source: VoxelSource; readonly grain: number },
  axes: Axes,
  rescue: boolean,
): boolean => {
  const { grid, source, grain } = target;
  let filled = false;
  for (const [column, depths] of crossings(source, grain, axes)) {
    const lattice = [Math.floor(column / RANGE) - HALF_RANGE, (column % RANGE) - HALF_RANGE];
    depths.sort((p, q) => p - q);
    const set = (ray: number): void => {
      const voxel = [0, 0, 0];
      voxel[axes.across[0]] = lattice[0]!;
      voxel[axes.across[1]] = lattice[1]!;
      voxel[axes.ray] = checkedIndex((ray + 0.5) * grain, grain);
      grid.set(keyOf(voxel[0]!, voxel[1]!, voxel[2]!), source.group);
      filled = true;
    };
    for (let i = 0; i + 1 < depths.length; i += 2) {
      const first = Math.ceil(depths[i]! / grain - 0.5);
      const last = Math.ceil(depths[i + 1]! / grain - 0.5) - 1;
      if (first > last && rescue) {
        set(Math.floor((depths[i]! + depths[i + 1]!) / 2 / grain));
      }
      for (let ray = first; ray <= last; ray += 1) {
        set(ray);
      }
    }
  }
  return filled;
};

const THIN_AXES: readonly Axes[] = [
  { across: [0, 1], ray: 2 },
  { across: [1, 2], ray: 0 },
  { across: [2, 0], ray: 1 },
];

/**
 * A solid with a side shorter than the grain is thin: it is sampled along every axis so it keeps a voxel's thickness. A
 * solid wider than the grain can still hold no voxel centre, such as a cylinder whose chords fall between them, so one
 * that fills nothing is sampled as thin; one that no sample line crosses at all takes the voxel holding its centre.
 */
const fillSource = (grid: Grid, source: VoxelSource, grain: number): void => {
  const bounds = [0, 1, 2].map((axis) => {
    const values = Array.from({ length: source.positions.length / 3 }, (_, v) => source.positions[v * 3 + axis]!);
    return [Math.min(...values), Math.max(...values)] as const;
  });
  const target = { grid, source, grain };
  if (Math.min(...bounds.map(([min, max]) => max - min)) >= grain && fillAlong(target, THIN_AXES[0]!, false)) {
    return;
  }
  const crossed = THIN_AXES.map((axes) => fillAlong(target, axes, true));
  if (!crossed.includes(true)) {
    const [x, y, z] = bounds.map(([min, max]) => checkedIndex((min + max) / 2, grain));
    grid.set(keyOf(x!, y!, z!), source.group);
  }
};

interface Sweep {
  readonly d: number;
  readonly u: number;
  readonly v: number;
  readonly sign: 1 | -1;
}

interface Face {
  readonly u: number;
  readonly v: number;
  readonly group: number;
}

interface Builder {
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
}

type Bounds = readonly [min: readonly number[], max: readonly number[]];

const emitQuad = (
  out: Builder,
  sweep: Sweep,
  quad: { readonly plane: number; readonly rect: readonly [number, number, number, number] },
  grain: number,
): void => {
  const [u0, v0, width, height] = quad.rect;
  const corners: [number, number][] = [
    [u0, v0],
    [u0 + width, v0],
    [u0 + width, v0 + height],
    [u0, v0 + height],
  ];
  if (sweep.sign < 0) {
    corners.reverse();
  }
  const base = out.positions.length / 3;
  for (const [cu, cv] of corners) {
    const position = [0, 0, 0];
    position[sweep.d] = quad.plane * grain;
    position[sweep.u] = cu * grain;
    position[sweep.v] = cv * grain;
    out.positions.push(...position);
    const normal = [0, 0, 0];
    normal[sweep.d] = sweep.sign;
    out.normals.push(...normal);
  }
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
};

/** The widest run from `start`, then as many rows below as match it, as [width, height]. */
const rectFrom = (
  mask: Int32Array,
  [du, dv]: readonly [number, number],
  at: readonly [number, number],
): [number, number] => {
  const [i, j] = at;
  const start = i + j * du;
  const group = mask[start]!;
  let width = 1;
  while (i + width < du && mask[start + width] === group) {
    width += 1;
  }
  const rowMatches = (row: number): boolean => {
    for (let k = 0; k < width; k += 1) {
      if (mask[start + row * du + k] !== group) {
        return false;
      }
    }
    return true;
  };
  let height = 1;
  while (j + height < dv && rowMatches(height)) {
    height += 1;
  }
  return [width, height];
};

/** Merges equal neighbours of one slice into rectangles. */
const greedy = (mask: Int32Array, size: readonly [number, number], emit: (rect: number[], group: number) => void) => {
  const [du, dv] = size;
  for (let j = 0; j < dv; j += 1) {
    for (let i = 0; i < du; ) {
      const group = mask[i + j * du]!;
      if (group < 0) {
        i += 1;
        continue;
      }
      const [width, height] = rectFrom(mask, size, [i, j]);
      for (let row = 0; row < height; row += 1) {
        mask.fill(-1, i + (j + row) * du, i + (j + row) * du + width);
      }
      emit([i, j, width, height], group);
      i += width;
    }
  }
};

/** The faces of the voxels that have no neighbour in the sweep's direction, bucketed by slice. */
const exposedFaces = (grid: Grid, sweep: Sweep): { readonly slices: Map<number, Face[]>; readonly count: number } => {
  const { d, sign } = sweep;
  const slices = new Map<number, Face[]>();
  let count = 0;
  for (const [key, group] of grid) {
    const at = voxelOf(key);
    const next: [number, number, number] = [at[0], at[1], at[2]];
    next[d] = at[d]! + sign;
    if (grid.has(keyOf(...next))) {
      continue;
    }
    const slice = slices.get(at[d]!) ?? [];
    slice.push({ u: at[sweep.u]!, v: at[sweep.v]!, group });
    slices.set(at[d]!, slice);
    count += 1;
  }
  return { slices, count };
};

const boundsOf = (grid: Grid): Bounds => {
  const voxels = [...grid.keys()].map(voxelOf);
  return [
    [0, 1, 2].map((axis) => Math.min(...voxels.map((at) => at[axis]!))),
    [0, 1, 2].map((axis) => Math.max(...voxels.map((at) => at[axis]!))),
  ];
};

const meshGrid = (grid: Grid, grain: number): Voxelized => {
  const builders = new Map<number, Builder>();
  const builderOf = (group: number): Builder => {
    let builder = builders.get(group);
    if (!builder) {
      builder = { positions: [], normals: [], indices: [] };
      builders.set(group, builder);
    }
    return builder;
  };
  const bounds = boundsOf(grid);
  let faces = 0;
  let quads = 0;
  for (let d = 0; d < 3; d += 1) {
    for (const sign of [1, -1] as const) {
      const sweep: Sweep = { d, u: (d + 1) % 3, v: (d + 2) % 3, sign };
      const exposed = exposedFaces(grid, sweep);
      const { slices } = exposed;
      faces += exposed.count;
      const du = bounds[1][sweep.u]! - bounds[0][sweep.u]! + 1;
      const dv = bounds[1][sweep.v]! - bounds[0][sweep.v]! + 1;
      for (const [w, slice] of [...slices].sort(([p], [q]) => p - q)) {
        const mask = new Int32Array(du * dv).fill(-1);
        for (const face of slice) {
          mask[face.u - bounds[0][sweep.u]! + (face.v - bounds[0][sweep.v]!) * du] = face.group;
        }
        greedy(mask, [du, dv], ([i, j, width, height], group) => {
          quads += 1;
          emitQuad(
            builderOf(group),
            sweep,
            {
              plane: w + (sign > 0 ? 1 : 0),
              rect: [bounds[0][sweep.u]! + i!, bounds[0][sweep.v]! + j!, width!, height!],
            },
            grain,
          );
        });
      }
    }
  }
  const groups = new Map<number, VoxelBuffers>(
    [...builders].map(([group, builder]) => [
      group,
      {
        positions: new Float32Array(builder.positions),
        normals: new Float32Array(builder.normals),
        indices: new Uint32Array(builder.indices),
      },
    ]),
  );
  return { groups, stats: { voxels: grid.size, faces, quads } };
};

const shifted = (values: ArrayLike<number>, by: readonly number[], sign: 1 | -1): Float32Array =>
  Float32Array.from({ length: values.length }, (_, i) => values[i]! + sign * by[i % 3]!);

/**
 * Voxelizes the sources at `grain` metres, on a lattice anchored at `origin` (part-local metres, the part origin by
 * default) so a caller can put the voxels of parts placed at fractions of a voxel on one shared lattice. Empty input
 * gives no groups.
 */
export const voxelize = (
  sources: readonly VoxelSource[],
  grain: number,
  origin: readonly number[] = [0, 0, 0],
): Voxelized => {
  if (!(Number.isFinite(grain) && grain > 0)) {
    throw new Error(`Voxel grain must be a positive number of metres, got ${grain}`);
  }
  const grid: Grid = new Map();
  for (const source of sources) {
    fillSource(grid, { ...source, positions: shifted(source.positions, origin, -1) }, grain);
  }
  if (grid.size === 0) {
    return { groups: new Map(), stats: { voxels: 0, faces: 0, quads: 0 } };
  }
  const { groups, stats } = meshGrid(grid, grain);
  return {
    groups: new Map([...groups].map(([group, b]) => [group, { ...b, positions: shifted(b.positions, origin, 1) }])),
    stats,
  };
};
