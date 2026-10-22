// Samples closed triangle meshes onto a voxel grid and greedy-meshes the result. It knows nothing of assemblies or
// glTF: `glb.ts` feeds it one part's solids (metres, part-local) and writes what comes back.
//
// A solid is sampled by casting a ray along z through each column of voxel centres, nudged off the centres by a fixed
// fraction of a voxel so a ray never runs along a mesh edge. The spans between paired crossings are filled. A solid
// with a side shorter than the grain would miss most rays, so it is sampled along all three axes and keeps at least one
// voxel of thickness instead of vanishing; thicker solids are not thickened. Open meshes (an odd crossing count) drop
// the unpaired crossing.

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
const NUDGE_X = 0.013_7;
const NUDGE_Y = 0.029_1;

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

/** The ray-axis coordinate of every triangle crossing, per column of the sample lattice. */
const crossings = (source: VoxelSource, grain: number, axes: Axes): Map<number, number[]> => {
  const { positions, indices } = source;
  const [ax, ay] = axes.across;
  const columns = new Map<number, number[]>();
  const at = (vertex: number, axis: number): number => positions[vertex * 3 + axis]!;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const area = (at(b, ax) - at(a, ax)) * (at(c, ay) - at(a, ay)) - (at(c, ax) - at(a, ax)) * (at(b, ay) - at(a, ay));
    if (Math.abs(area) < 1e-18) {
      continue;
    }
    const lo = (axis: number): number => Math.min(at(a, axis), at(b, axis), at(c, axis));
    const hi = (axis: number): number => Math.max(at(a, axis), at(b, axis), at(c, axis));
    const columnsOf = (axis: number, nudge: number): [number, number] => [
      Math.ceil(lo(axis) / grain - 0.5 - nudge),
      Math.floor(hi(axis) / grain - 0.5 - nudge),
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
        if (wa >= 0 && wb >= 0 && wc >= 0) {
          const key = (checkedIndex(px, grain) + HALF_RANGE) * RANGE + (checkedIndex(py, grain) + HALF_RANGE);
          const depth = wa * at(a, axes.ray) + wb * at(b, axes.ray) + wc * at(c, axes.ray);
          const list = columns.get(key);
          if (list) {
            list.push(depth);
          } else {
            columns.set(key, [depth]);
          }
        }
      }
    }
  }
  return columns;
};

/**
 * Fills the voxels whose centres lie inside the solid along one axis. With `rescue`, a span that holds no centre still
 * fills the voxel at its middle, so a thin solid keeps one voxel of thickness.
 */
const fillAlong = (grid: Grid, source: VoxelSource, grain: number, axes: Axes, rescue: boolean): void => {
  for (const [column, depths] of crossings(source, grain, axes)) {
    const lattice = [Math.floor(column / RANGE) - HALF_RANGE, (column % RANGE) - HALF_RANGE];
    depths.sort((p, q) => p - q);
    const set = (ray: number): void => {
      const voxel = [0, 0, 0];
      voxel[axes.across[0]] = lattice[0]!;
      voxel[axes.across[1]] = lattice[1]!;
      voxel[axes.ray] = checkedIndex((ray + 0.5) * grain, grain);
      grid.set(keyOf(voxel[0]!, voxel[1]!, voxel[2]!), source.group);
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
};

const THIN_AXES: readonly Axes[] = [
  { across: [0, 1], ray: 2 },
  { across: [1, 2], ray: 0 },
  { across: [2, 0], ray: 1 },
];

/** A solid with a side shorter than the grain is thin: it is sampled along every axis so it keeps a voxel's thickness. */
const fillSource = (grid: Grid, source: VoxelSource, grain: number): void => {
  const extent = [0, 1, 2].map((axis) => {
    const values = Array.from({ length: source.positions.length / 3 }, (_, v) => source.positions[v * 3 + axis]!);
    return Math.max(...values) - Math.min(...values);
  });
  const thin = Math.min(...extent) < grain;
  for (const axes of thin ? THIN_AXES : THIN_AXES.slice(0, 1)) {
    fillAlong(grid, source, grain, axes, thin);
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

/** Merges equal neighbours of one slice into rectangles: widest run first, then as many rows as match. */
const greedy = (mask: Int32Array, [du, dv]: readonly [number, number], emit: (rect: number[], group: number) => void) => {
  for (let j = 0; j < dv; j += 1) {
    for (let i = 0; i < du; ) {
      const start = i + j * du;
      const group = mask[start]!;
      if (group < 0) {
        i += 1;
        continue;
      }
      let width = 1;
      while (i + width < du && mask[start + width] === group) {
        width += 1;
      }
      let height = 1;
      const rowMatches = (row: number): boolean => {
        for (let k = 0; k < width; k += 1) {
          if (mask[start + row * du + k] !== group) {
            return false;
          }
        }
        return true;
      };
      while (j + height < dv && rowMatches(height)) {
        height += 1;
      }
      for (let row = 0; row < height; row += 1) {
        mask.fill(-1, start + row * du, start + row * du + width);
      }
      emit([i, j, width, height], group);
      i += width;
    }
  }
};

const meshGrid = (grid: Grid, grain: number): Voxelized => {
  const voxels = [...grid].map(([key, group]) => ({ at: voxelOf(key), group }));
  const builders = new Map<number, Builder>();
  const builderOf = (group: number): Builder => {
    let builder = builders.get(group);
    if (!builder) {
      builder = { positions: [], normals: [], indices: [] };
      builders.set(group, builder);
    }
    return builder;
  };
  const min = [0, 1, 2].map((axis) => Math.min(...voxels.map(({ at }) => at[axis]!)));
  const max = [0, 1, 2].map((axis) => Math.max(...voxels.map(({ at }) => at[axis]!)));
  const bounds: Bounds = [min, max];
  let faces = 0;
  let quads = 0;
  for (let d = 0; d < 3; d += 1) {
    for (const sign of [1, -1] as const) {
      const sweep: Sweep = { d, u: (d + 1) % 3, v: (d + 2) % 3, sign };
      const slices = new Map<number, Face[]>();
      for (const { at, group } of voxels) {
        const next: [number, number, number] = [at[0], at[1], at[2]];
        next[d] = at[d]! + sign;
        if (!grid.has(keyOf(...next))) {
          const slice = slices.get(at[d]!) ?? [];
          slice.push({ u: at[sweep.u]!, v: at[sweep.v]!, group });
          slices.set(at[d]!, slice);
          faces += 1;
        }
      }
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

/** Voxelizes the sources at `grain` metres, on a lattice anchored at the part origin. Empty input gives no groups. */
export const voxelize = (sources: readonly VoxelSource[], grain: number): Voxelized => {
  if (!(Number.isFinite(grain) && grain > 0)) {
    throw new Error(`Voxel grain must be a positive number of metres, got ${grain}`);
  }
  const grid: Grid = new Map();
  for (const source of sources) {
    fillSource(grid, source, grain);
  }
  return grid.size === 0 ? { groups: new Map(), stats: { voxels: 0, faces: 0, quads: 0 } } : meshGrid(grid, grain);
};
