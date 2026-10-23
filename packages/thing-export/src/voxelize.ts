// Samples closed triangle meshes onto a voxel grid and greedy-meshes the result. It knows nothing of assemblies or
// glTF: `glb.ts` feeds it one part's solids (metres, part-local) and writes what comes back.
//
// A solid is sampled by casting rays along each axis through the columns of voxel centres, nudged off the centres by a
// fixed fraction of a voxel so a ray never runs along a mesh edge. The spans between paired crossings are filled, and a
// span too short to hold a centre keeps one voxel, inside the shape the sources make together (see `fillAlong`). Open
// meshes (an odd crossing count) drop the unpaired crossing. What the sources connect stays connected: bodies left
// apart are joined through the cells the sources meet, to each other and to neighbouring parts (see `bridge`).

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

type Span = readonly [from: number, to: number];

/** Per column of the sample lattice, the stretches of the ray inside a solid. */
type Spans = Map<number, Span[]>;

/** Pairs each column's crossings into spans; an open mesh's unpaired last crossing is dropped. */
const spansOf = (columns: Columns): Spans => {
  const spans: Spans = new Map();
  for (const [column, depths] of columns) {
    depths.sort((p, q) => p - q);
    const pairs: Span[] = [];
    for (let i = 0; i + 1 < depths.length; i += 2) {
      pairs.push([depths[i]!, depths[i + 1]!]);
    }
    spans.set(column, pairs);
  }
  return spans;
};

/**
 * Gaps narrower than this many voxels count as a seam between solids that share a face: pieces of one shape compute
 * the shared face separately and round it apart.
 */
const SEAM_VOXELS = 1e-3;

/** All the sources' spans, column by column, joined where they overlap or meet at a seam. */
const joinSpans = (all: readonly Spans[], grain: number): Spans => {
  const joined: Spans = new Map();
  for (const [column, spans] of all.flatMap((source) => [...source])) {
    joined.set(column, [...(joined.get(column) ?? []), ...spans]);
  }
  for (const [column, spans] of joined) {
    const merged: [number, number][] = [];
    for (const [from, to] of spans.sort((p, q) => p[0] - q[0])) {
      const last = merged.at(-1);
      if (last && from <= last[1] + SEAM_VOXELS * grain) {
        last[1] = Math.max(last[1], to);
      } else {
        merged.push([from, to]);
      }
    }
    joined.set(column, merged);
  }
  return joined;
};

/** The first and last voxel whose centre lies in the span; first > last when it holds none. */
const centresIn = ([from, to]: Span, grain: number): [number, number] => [
  Math.ceil(from / grain - 0.5),
  Math.ceil(to / grain - 0.5) - 1,
];

/**
 * Fills the voxels whose centres lie inside the solid along one axis, and says whether it filled any. A span that holds
 * no centre still fills one voxel, so a thin solid keeps one voxel of thickness: the voxel at the span's middle, or,
 * when the span runs on into other sources' spans that hold centres, the one of those centres nearest it. A span cut
 * short by a seam, such as a curve facet clipped at its corner, is no thin solid, and its middle voxel would stick out
 * of the shape as a one-voxel sliver.
 */
const fillAlong = (
  target: { readonly grid: Grid; readonly group: number; readonly grain: number },
  axes: Axes,
  sampled: { readonly own: Spans; readonly joined: Spans },
): boolean => {
  const { grid, group, grain } = target;
  let filled = false;
  for (const [column, spans] of sampled.own) {
    const lattice = [Math.floor(column / RANGE) - HALF_RANGE, (column % RANGE) - HALF_RANGE];
    const set = (ray: number): void => {
      const voxel = [0, 0, 0];
      voxel[axes.across[0]] = lattice[0]!;
      voxel[axes.across[1]] = lattice[1]!;
      voxel[axes.ray] = checkedIndex((ray + 0.5) * grain, grain);
      grid.set(keyOf(voxel[0]!, voxel[1]!, voxel[2]!), group);
      filled = true;
    };
    for (const span of spans) {
      const [first, last] = centresIn(span, grain);
      if (first > last) {
        const [from, to] = span;
        const middle = Math.floor((from + to) / 2 / grain);
        const whole = sampled.joined.get(column)?.find(([a, b]) => a <= from && to <= b) ?? span;
        const [low, high] = centresIn(whole, grain);
        set(low > high ? middle : Math.min(Math.max(middle, low), high));
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
 * A solid is sampled along every axis, so any stretch of it thinner than the grain, such as a guard's bar or a tube's
 * wall, keeps a voxel's thickness wherever a sample line crosses it; a solid's size says nothing about how thin its
 * stretches are. One that no sample line crosses at all, a speck or an open sheet, takes the cells its surface meets,
 * so it stays where it touches its neighbours.
 */
const fillSource = (
  target: { readonly grid: Grid; readonly group: number; readonly grain: number },
  sampled: readonly { readonly own: Spans; readonly joined: Spans }[],
  surface: () => Grid,
): void => {
  const crossed = THIN_AXES.map((axes, index) => fillAlong(target, axes, sampled[index]!));
  if (!crossed.includes(true)) {
    for (const [key, group] of surface()) {
      target.grid.set(key, group);
    }
  }
};

type Vec = readonly [number, number, number];

const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const UNITS: readonly Vec[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

interface SeparatingAxis {
  readonly axis: Vec;
  /** The triangle's extent along the axis. */
  readonly low: number;
  readonly high: number;
  /** A cell's half-extent along the axis. */
  readonly reach: number;
}

/** The axes that can separate a triangle from a closed cell of half-width `half`: the units, its normal, unit × edge. */
const separatingAxes = (triangle: readonly Vec[], half: number): SeparatingAxis[] => {
  const edges = [0, 1, 2].map((i) => {
    const [p, q] = [triangle[i]!, triangle[(i + 1) % 3]!];
    return [q[0] - p[0], q[1] - p[1], q[2] - p[2]] as const;
  });
  const axes = [
    ...UNITS,
    cross(edges[0]!, edges[1]!),
    ...UNITS.flatMap((unit) => edges.map((edge) => cross(unit, edge))),
  ];
  return axes.map((axis) => {
    const projected = triangle.map((p) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]);
    return {
      axis,
      low: Math.min(...projected),
      high: Math.max(...projected),
      reach: half * (Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2])) * (1 + 1e-9),
    };
  });
};

/** Whether the triangle whose separating axes these are meets the cell centred at `centre`. */
const meetsCell = (axes: readonly SeparatingAxis[], centre: Vec): boolean => {
  for (const { axis, low, high, reach } of axes) {
    const at = centre[0] * axis[0] + centre[1] * axis[1] + centre[2] * axis[2];
    if (low - at > reach || high - at < -reach) {
      return false;
    }
  }
  return true;
};

/** Every cell the source's surface meets, with the source's group. */
const surfaceCells = (source: VoxelSource, grain: number): Grid => {
  const reach: Grid = new Map();
  const { positions, indices } = source;
  const point = (vertex: number): Vec => [
    positions[vertex * 3]!,
    positions[vertex * 3 + 1]!,
    positions[vertex * 3 + 2]!,
  ];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const triangle = [point(indices[t]!), point(indices[t + 1]!), point(indices[t + 2]!)];
    const axes = separatingAxes(triangle, grain / 2);
    const [low, high] = [Math.min, Math.max].map((pick) =>
      [0, 1, 2].map((axis) => checkedIndex(pick(...triangle.map((p) => p[axis]!)) / grain, 1)),
    );
    for (let x = low![0]! - 1; x <= high![0]! + 1; x += 1) {
      for (let y = low![1]! - 1; y <= high![1]! + 1; y += 1) {
        for (let z = low![2]! - 1; z <= high![2]! + 1; z += 1) {
          if (meetsCell(axes, [(x + 0.5) * grain, (y + 0.5) * grain, (z + 0.5) * grain])) {
            reach.set(keyOf(x, y, z), source.group);
          }
        }
      }
    }
  }
  return reach;
};

const NEIGHBOURS = [1, -1, RANGE, -RANGE, RANGE * RANGE, -RANGE * RANGE];

/** The 6-connected bodies of the grid, largest first, as sets of keys. */
const bodiesOf = (grid: Grid): Set<number>[] => {
  const seen = new Set<number>();
  const bodies: Set<number>[] = [];
  for (const start of grid.keys()) {
    if (seen.has(start)) {
      continue;
    }
    const body = new Set([start]);
    seen.add(start);
    const stack = [start];
    while (stack.length > 0) {
      const key = stack.pop()!;
      for (const step of NEIGHBOURS) {
        const next = key + step;
        if (grid.has(next) && !seen.has(next)) {
          seen.add(next);
          body.add(next);
          stack.push(next);
        }
      }
    }
    bodies.push(body);
  }
  return bodies.sort((a, b) => b.size - a.size);
};

/**
 * The shortest walk from the joined cells, through cells the sources meet, to a grid cell outside them: each cell's
 * step back towards the joined cells, and the cell it ends on. Undefined when no walk reaches one.
 */
const walkOut = (
  grid: Grid,
  reach: Grid,
  joined: ReadonlySet<number>,
): { readonly from: ReadonlyMap<number, number>; readonly end: number } | undefined => {
  const from = new Map<number, number>([...joined].map((key) => [key, key]));
  const open = (cell: number): boolean => !from.has(cell) && (reach.has(cell) || grid.has(cell));
  let frontier = [...joined];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const key of frontier) {
      for (const cell of NEIGHBOURS.map((step) => key + step).filter(open)) {
        from.set(cell, key);
        if (grid.has(cell)) {
          return { from, end: cell };
        }
        next.push(cell);
      }
    }
    frontier = next;
  }
  return undefined;
};

/**
 * Joins the grid's bodies that the sources connect, to each other and to the neighbours' voxels in `anchor`: each pass
 * walks out from what is joined through cells the sources meet, and the shortest walk that reaches another body is
 * filled. When no walk reaches one, the largest body left starts a new joined set. Sources that do not meet stay apart.
 */
const bridge = (grid: Grid, reach: Grid, anchor: Grid): void => {
  const bodies = bodiesOf(grid);
  const bodyOf = new Map<number, number>();
  bodies.forEach((body, index) => {
    for (const key of body) {
      bodyOf.set(key, index);
    }
  });
  const joined = new Set(anchor.keys());
  const merged = new Set<number>();
  const join = (index: number): void => {
    merged.add(index);
    for (const key of bodies[index]!) {
      joined.add(key);
    }
  };
  while (merged.size < bodies.length) {
    const walk = walkOut(grid, reach, joined);
    if (walk === undefined) {
      join(bodies.findIndex((_, index) => !merged.has(index)));
      continue;
    }
    for (let cell = walk.from.get(walk.end)!; !joined.has(cell); cell = walk.from.get(cell)!) {
      grid.set(cell, reach.get(cell)!);
      joined.add(cell);
    }
    join(bodyOf.get(walk.end)!);
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

const checkedGrain = (grain: number): void => {
  if (!(Number.isFinite(grain) && grain > 0)) {
    throw new Error(`Voxel grain must be a positive number of metres, got ${grain}`);
  }
};

/**
 * Fills each source's voxels into `filled(index)`, sampled together so thinness is judged on the shape they make, and,
 * with `met`, records the cells their surfaces touch.
 */
const sample = (
  solids: readonly VoxelSource[],
  lattice: { readonly grain: number; readonly origin: readonly number[] },
  filled: (index: number) => Grid,
  met?: Grid,
): void => {
  const { grain, origin } = lattice;
  const locals = solids.map((source) => ({ ...source, positions: shifted(source.positions, origin, -1) }));
  const spans = locals.map((local) => THIN_AXES.map((axes) => spansOf(crossings(local, grain, axes))));
  const joined = THIN_AXES.map((_, axis) =>
    joinSpans(
      spans.map((own) => own[axis]!),
      grain,
    ),
  );
  for (const [index, local] of locals.entries()) {
    let surface: Grid | undefined;
    const surfaceOf = (): Grid => {
      surface ??= surfaceCells(local, grain);
      return surface;
    };
    fillSource(
      { grid: filled(index), group: local.group, grain },
      spans[index]!.map((own, axis) => ({ own, joined: joined[axis]! })),
      surfaceOf,
    );
    for (const [key, group] of met ? surfaceOf() : []) {
      met!.set(key, group);
    }
  }
};

export interface VoxelMeasure {
  /** Corners of the voxels' bounds, in the sources' metres. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** Mean of the voxel centres. */
  readonly centroid: readonly [number, number, number];
  readonly voxels: number;
}

/**
 * Measures, source by source, the voxels `voxelize` fills when it samples these sources together on the same lattice,
 * before bridging joins them to anything, so a datum read off one solid follows the voxels that solid draws beside its
 * siblings. A source that fills no voxels measures undefined.
 */
export const measureVoxels = (
  sources: readonly VoxelSource[],
  grain: number,
  origin: readonly number[] = [0, 0, 0],
): (VoxelMeasure | undefined)[] => {
  checkedGrain(grain);
  const grids: Grid[] = sources.map(() => new Map());
  sample(sources, { grain, origin }, (index) => grids[index]!);
  const at = (axis: number, cells: number): number => cells * grain + origin[axis]!;
  return grids.map((grid) => {
    if (grid.size === 0) {
      return;
    }
    const [low, high] = boundsOf(grid);
    const sum = [0, 0, 0];
    for (const key of grid.keys()) {
      voxelOf(key).forEach((index, axis) => {
        sum[axis] = sum[axis]! + index;
      });
    }
    return {
      min: [at(0, low[0]!), at(1, low[1]!), at(2, low[2]!)],
      max: [at(0, high[0]! + 1), at(1, high[1]! + 1), at(2, high[2]! + 1)],
      centroid: [at(0, sum[0]! / grid.size + 0.5), at(1, sum[1]! / grid.size + 0.5), at(2, sum[2]! / grid.size + 0.5)],
      voxels: grid.size,
    };
  });
};

/**
 * Voxelizes the sources at `grain` metres, on a lattice anchored at `origin` (part-local metres, the part origin by
 * default) so a caller can put the voxels of parts placed at fractions of a voxel on one shared lattice. `neighbours`
 * are the solids of other parts that may touch these (part-local metres): they are not drawn, but a piece of these
 * sources that meets one is joined to its voxels, so a part that holds on through its neighbour stays on. Empty input
 * gives no groups.
 */
export const voxelize = (
  sources: readonly VoxelSource[],
  grain: number,
  origin: readonly number[] = [0, 0, 0],
  neighbours: readonly VoxelSource[] = [],
): Voxelized => {
  checkedGrain(grain);
  const lattice = { grain, origin };
  const grid: Grid = new Map();
  const reach: Grid = new Map();
  sample(sources, lattice, () => grid, reach);
  const anchor: Grid = new Map();
  sample(neighbours, lattice, () => anchor);
  bridge(grid, reach, anchor);
  if (grid.size === 0) {
    return { groups: new Map(), stats: { voxels: 0, faces: 0, quads: 0 } };
  }
  const { groups, stats } = meshGrid(grid, grain);
  return {
    groups: new Map([...groups].map(([group, b]) => [group, { ...b, positions: shifted(b.positions, origin, 1) }])),
    stats,
  };
};
