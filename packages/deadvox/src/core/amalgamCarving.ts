// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { cellIndex } from '@mobgen/core/voxelize.ts';
import { type AmalgamFigure, amalgamSeveredBones } from './amalgamFigure.ts';
import type { Vec3 } from './coords.ts';
import { raycast } from './raycast.ts';
import type { ZombieDef } from './schema.ts';
import { type PosedBoneBox, posedBoxEntry } from './zombieRegions.ts';

// A damaging hit on an amalgam knocks out the voxels around where it struck, leaving a hole. The hole is
// simulation state (Zombie.carved), so it survives a save and a replay. It never changes region health,
// damage or severing, but later hits see it: a shot enters a hole and strikes the flesh behind, and passes
// through a hole that goes all the way (`fleshHit`).

export type AmalgamCarving = NonNullable<ZombieDef['carving']>;

/** A ray in the figure's rest voxel grid, where floor() of a point is its cell (i, j, k). */
interface GridRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

/** rᵀ · p for a row-major 3×3 rotation. */
const applyTransposed = (r: readonly number[], p: Vec3): Vec3 => [
  r[0]! * p[0] + r[3]! * p[1] + r[6]! * p[2],
  r[1]! * p[0] + r[4]! * p[1] + r[7]! * p[2],
  r[2]! * p[0] + r[5]! * p[1] + r[8]! * p[2],
];

const restBoxCenters = new WeakMap<AmalgamFigure, ReadonlyMap<string, readonly number[]>>();

/** Each bone's unposed box centre, in the figure's unscaled rest space. */
const restBoxCenter = (figure: AmalgamFigure, bone: string): readonly number[] => {
  let centers = restBoxCenters.get(figure);
  if (!centers) {
    centers = new Map(Object.values(figure.boxes).flatMap((boxes) => boxes.map((box) => [box.bone, box.center])));
    restBoxCenters.set(figure, centers);
  }
  const center = centers.get(bone);
  if (!center) {
    throw new Error(`Amalgam has no region box for bone ${bone}`);
  }
  return center;
};

/**
 * Maps a hit on a posed region box into the rest voxel grid. The posed box is the rest box moved by its
 * bone's pose and the body's yaw, so its rotation and centre undo that move.
 * `point` and `box` are in block coordinates; `direction` is a unit vector.
 */
const gridRayForHit = (
  figure: AmalgamFigure,
  box: PosedBoneBox,
  hit: { readonly point: Vec3; readonly direction: Vec3 },
  blockSize: number,
): GridRay => {
  const { size, origin } = figure.realized.voxels;
  const center = restBoxCenter(figure, box.bone);
  const toRest = blockSize / figure.scale;
  const offset = applyTransposed(box.rotation, [
    hit.point[0] - box.center[0],
    hit.point[1] - box.center[1],
    hit.point[2] - box.center[2],
  ]);
  const rest: Vec3 = [
    center[0]! + offset[0] * toRest,
    center[1]! + offset[1] * toRest,
    center[2]! + offset[2] * toRest,
  ];
  return {
    // Cell i's centre is at (origin + i) × size on x and z, and (origin + j + 0.5) × size on y.
    origin: [rest[0] / size - origin[0] + 0.5, rest[1] / size - origin[1], rest[2] / size - origin[2] + 0.5],
    direction: applyTransposed(box.rotation, hit.direction),
  };
};

/**
 * The flesh a hit can no longer take: cells already carved, and the voxels of severed members, which the
 * hit test and the renderer no longer show.
 */
export interface MissingFlesh {
  readonly carved: ReadonlySet<number>;
  /** Voxel owners (bone index + 1) of the severed bones. */
  readonly severedOwners: ReadonlySet<number>;
}

export const missingFlesh = (
  figure: AmalgamFigure,
  zombie: { readonly carved: readonly number[]; readonly severed: readonly string[] },
): MissingFlesh => {
  const hidden = amalgamSeveredBones(figure, zombie.severed);
  return {
    carved: new Set(zombie.carved),
    severedOwners: new Set(
      figure.realized.body.bones.flatMap((bone, index) => (hidden.has(bone.id) ? [index + 1] : [])),
    ),
  };
};

/** The cell's index if it holds visible flesh that hasn't been carved, else undefined. */
const fleshAt = (figure: AmalgamFigure, missing: MissingFlesh, [i, j, k]: Vec3): number | undefined => {
  const { dims, owner } = figure.realized.voxels;
  const inside = i >= 0 && j >= 0 && k >= 0 && i < dims[0] && j < dims[1] && k < dims[2];
  const index = inside ? cellIndex(dims, i, j, k) : -1;
  const bone = inside ? owner[index]! : 0;
  return bone > 0 && !missing.severedOwners.has(bone) && !missing.carved.has(index) ? index : undefined;
};

const boneOwners = new WeakMap<AmalgamFigure, ReadonlyMap<string, number>>();

/** A bone's voxel owner value (bone index + 1). */
const ownerOf = (figure: AmalgamFigure, bone: string): number => {
  let owners = boneOwners.get(figure);
  if (!owners) {
    owners = new Map(figure.realized.body.bones.map((entry, index) => [entry.id, index + 1]));
    boneOwners.set(figure, owners);
  }
  return owners.get(bone)!;
};

export interface FleshHit {
  /** From the ray's origin to the struck voxel's face, in blocks. */
  readonly distance: number;
  readonly box: PosedBoneBox;
  /** The struck voxel's cell in the rest grid. */
  readonly cell: number;
}

/**
 * The first visible flesh along a ray through an amalgam's posed region boxes, in block units. For each box
 * the ray enters, it walks that box's own bone's voxels in the rest grid, skipping carved cells. So a ray
 * beside the flesh but inside a box misses, a ray into a hole strikes the flesh behind it, and a ray through
 * a hole that goes all the way meets nothing there. `direction` is a unit vector.
 */
export const fleshHit = ({
  figure,
  missing,
  boxes,
  origin,
  direction,
  blockSize,
}: {
  readonly figure: AmalgamFigure;
  readonly missing: MissingFlesh;
  readonly boxes: readonly PosedBoneBox[];
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly blockSize: number;
}): FleshHit | undefined => {
  const { dims, owner, size } = figure.realized.voxels;
  const cellBlocks = (size * figure.scale) / blockSize;
  let nearest: FleshHit | undefined;
  for (const box of boxes) {
    const entry = posedBoxEntry(box, origin, direction, blockSize);
    if (entry === undefined || (nearest !== undefined && entry >= nearest.distance)) {
      continue;
    }
    const point: Vec3 = [
      origin[0] + direction[0] * entry,
      origin[1] + direction[1] * entry,
      origin[2] + direction[2] * entry,
    ];
    const ray = gridRayForHit(figure, box, { point, direction }, blockSize);
    const bone = ownerOf(figure, box.bone);
    // The box is the bone's voxels plus half a voxel, so its far side is within its diagonal.
    const across = (2 * Math.hypot(...box.halfSize)) / (size * figure.scale) + 1;
    const hit = raycast(ray.origin, ray.direction, across, (i, j, k) => {
      if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) {
        return false;
      }
      const index = cellIndex(dims, i, j, k);
      return owner[index] === bone && !missing.carved.has(index);
    });
    if (!hit) {
      continue;
    }
    const distance = entry + hit.distance * cellBlocks;
    if (nearest === undefined || distance < nearest.distance) {
      nearest = { distance, box, cell: cellIndex(dims, hit.block[0], hit.block[1], hit.block[2]) };
    }
  }
  return nearest;
};

const cellOf = (dims: readonly number[], index: number): Vec3 => [
  index % dims[0]!,
  Math.floor(index / dims[0]!) % dims[1]!,
  Math.floor(index / (dims[0]! * dims[1]!)),
];

const protectedCells = new WeakMap<AmalgamFigure, number>();

/**
 * The core cell nearest the core's interior point. It is never carved, so the core keeps flesh however
 * many hits land on it, and the tentacle's root (that same point) stays inside it.
 */
export const protectedCoreCell = (figure: AmalgamFigure): number => {
  const cached = protectedCells.get(figure);
  if (cached !== undefined) {
    return cached;
  }
  const { dims, owner, size, origin } = figure.realized.voxels;
  const coreOwner = figure.realized.body.bones.findIndex((bone) => bone.id === 'core') + 1;
  const point = figure.coreInteriorPoint;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < owner.length; index++) {
    if (owner[index] !== coreOwner) {
      continue;
    }
    const [i, j, k] = cellOf(dims, index);
    const distance =
      ((origin[0] + i) * size - point[0]) ** 2 +
      ((origin[1] + j + 0.5) * size - point[1]) ** 2 +
      ((origin[2] + k) * size - point[2]) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  if (best < 0) {
    throw new Error(`Amalgam seed ${figure.seed} has no core voxels`);
  }
  protectedCells.set(figure, best);
  return best;
};

/** The struck cell nearest the mean of several: one shot's pellets make one hole. */
export const centralCell = (figure: AmalgamFigure, cells: readonly number[]): number => {
  const { dims } = figure.realized.voxels;
  const points = cells.map((cell) => cellOf(dims, cell));
  const mean = points
    .reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0])
    .map((total) => total / points.length);
  const fromMean = (point: Vec3): number =>
    (point[0] - mean[0]!) ** 2 + (point[1] - mean[1]!) ** 2 + (point[2] - mean[2]!) ** 2;
  let best = 0;
  for (let index = 1; index < points.length; index++) {
    if (fromMean(points[index]!) < fromMean(points[best]!)) {
      best = index;
    }
  }
  return cells[best]!;
};

/**
 * The cells a hit of `damage` knocks out: the struck cell and every visible flesh cell whose centre lies
 * within the carving radius of it, never the protected core cell. Ascending.
 */
export const carveAround = ({
  figure,
  carving,
  missing,
  struck,
  damage,
}: {
  readonly figure: AmalgamFigure;
  readonly carving: AmalgamCarving;
  readonly missing: MissingFlesh;
  readonly struck: number;
  readonly damage: number;
}): number[] => {
  const { dims, size } = figure.realized.voxels;
  const radius = Math.min(carving.maxRadiusMetres, carving.radiusMetresPerDamage * damage) / (size * figure.scale);
  const reach = Math.floor(radius);
  const [i0, j0, k0] = cellOf(dims, struck);
  const keep = protectedCoreCell(figure);
  const removed: number[] = [];
  for (let dk = -reach; dk <= reach; dk++) {
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        if (di * di + dj * dj + dk * dk > radius * radius) {
          continue;
        }
        const index = fleshAt(figure, missing, [i0 + di, j0 + dj, k0 + dk]);
        if (index !== undefined && index !== keep) {
          removed.push(index);
        }
      }
    }
  }
  return removed.sort((a, b) => a - b);
};
