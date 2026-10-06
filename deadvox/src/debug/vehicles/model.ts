/**
 * Vehicles as parts: a part type is immutable, content-shaped data; a fitting is one part placed on
 * one vehicle. A build is a vehicle with some fittings left off.
 */
import { BLOCK_SIZE } from '../../core/scale.ts';
import {
  type Axis,
  GLASS,
  type GridBounds,
  gridBounds,
  keyVoxel,
  markSeams,
  mirrorZ,
  rasterize,
  type ShapeOp,
  type Vec3i,
  type VoxelGrid,
  voxelKey,
} from './voxels.ts';

/** The part lattice: four cells per world block, the 4×4 addressing from the darker_yet spike. */
const CELLS_PER_BLOCK = 4;
export const VOXELS_PER_CELL = 4;
export const PART_CELL = BLOCK_SIZE / CELLS_PER_BLOCK;
export const VOXEL = PART_CELL / VOXELS_PER_CELL;

export const PART_LAYERS = ['frame', 'under', 'interior', 'body', 'roof'] as const;
export type PartLayer = (typeof PART_LAYERS)[number];

export interface PartType {
  readonly id: string;
  readonly label: string;
  readonly layer: PartLayer;
  readonly massKg: number;
  /** Voxel ops in the part's own frame; materials name entries of the vehicle's palette, or are `#rrggbb`. */
  readonly shape: readonly ShapeOp[];
  /** The facing axis of a flat body panel, whose `paint` edges become `seam` (voxels.ts, `markSeams`). */
  readonly panel?: Axis;
  /** The point a fitting turns about, in the part's frame: a wheel's axle, a door's hinge line. */
  readonly pivot?: readonly [x: number, y: number, z: number];
  readonly noise?: PartNoise;
}

/**
 * How a part sounds to a listener outside, in Deadvox's noise units: a source's hearing radius, like a
 * sound's `noise.radiusMetres`, or a damper's scale on that radius, like the senses' `hearingRangeScale`.
 */
export interface PartNoise {
  /** A source, heard this far away at idle: the engine. */
  readonly radiusMetres?: number;
  /** A damper, at most 1: multiplies the radius of every source while it's fitted (a silencer, the bonnet). */
  readonly rangeScale?: number;
}

export interface Fitting {
  readonly id: string;
  readonly type: string;
  /** Vehicle-local voxel position of the part's origin: x forward, y up, z toward the near side. */
  readonly at: Vec3i;
  /** Reflected across the vehicle's centre plane: the far-side twin of a near-side fitting. */
  readonly mirror?: true;
  /** Every fitting it rests on. All must be fitted before it is, and none can come off while it's on. */
  readonly supportedBy: readonly string[];
  /** Spins about the type's pivot on the z axis (a wheel on an axle), or swings on it about y (a door). */
  readonly motion?: 'spin' | 'hinge';
  /** Off unless the player fits it. */
  readonly optional?: true;
}

export interface Vehicle {
  readonly id: string;
  readonly label: string;
  /** The lattice envelope in cells; the vehicle's origin is its centre on the ground. */
  readonly lattice: Vec3i;
  readonly palette: Readonly<Record<string, string>>;
  readonly parts: Readonly<Record<string, PartType>>;
  readonly fittings: readonly Fitting[];
}

export const latticeVoxels = (vehicle: Vehicle): Vec3i => {
  const [x, y, z] = vehicle.lattice;
  return [x * VOXELS_PER_CELL, y * VOXELS_PER_CELL, z * VOXELS_PER_CELL];
};

export const partTypeOf = (vehicle: Vehicle, fitting: Fitting): PartType => {
  const type = vehicle.parts[fitting.type];
  if (!type) {
    throw new Error(`${vehicle.id}: fitting ${fitting.id} names unknown part type ${fitting.type}`);
  }
  return type;
};

export const isClearMaterial = (mat: string): boolean => mat === GLASS;

/** Rasterizes a part type once per vehicle, with its seams. */
const partGrid = (type: PartType): VoxelGrid => {
  const grid = rasterize(type.shape);
  if (type.panel) {
    markSeams(grid, type.panel, 'paint', 'seam');
  }
  return grid;
};

export interface PlacedPart {
  readonly grid: VoxelGrid;
  /** Voxel bounds and mass-weighted centre in vehicle-local voxels, mirror applied. */
  readonly bounds: GridBounds;
  readonly centroid: readonly [number, number, number];
}

/** Caches each part type's grid and places fittings in vehicle space. */
export class PartLibrary {
  readonly #grids = new Map<string, VoxelGrid>();
  readonly #placed = new Map<string, PlacedPart>();
  readonly vehicle: Vehicle;

  constructor(vehicle: Vehicle) {
    this.vehicle = vehicle;
  }

  /** The type's local grid, mirrored for a far-side fitting. */
  grid(typeId: string, mirror: boolean): VoxelGrid {
    const key = `${typeId}:${mirror}`;
    let grid = this.#grids.get(key);
    if (!grid) {
      const type = this.vehicle.parts[typeId];
      if (!type) {
        throw new Error(`${this.vehicle.id}: unknown part type ${typeId}`);
      }
      grid = mirror ? mirrorZ(this.grid(typeId, false)) : partGrid(type);
      this.#grids.set(key, grid);
    }
    return grid;
  }

  /** Where the fitting's local origin sits in vehicle voxels: a mirrored fitting's origin is reflected too. */
  origin(fitting: Fitting): Vec3i {
    const [x, y, z] = fitting.at;
    return fitting.mirror ? [x, y, latticeVoxels(this.vehicle)[2] - z] : [x, y, z];
  }

  placed(fitting: Fitting): PlacedPart {
    let placed = this.#placed.get(fitting.id);
    if (!placed) {
      const local = this.grid(fitting.type, fitting.mirror === true);
      const [ox, oy, oz] = this.origin(fitting);
      const grid: VoxelGrid = new Map();
      const sum: [number, number, number] = [0, 0, 0];
      for (const [key, mat] of local) {
        const [x, y, z] = keyVoxel(key);
        const voxel = [x + ox, y + oy, z + oz] as const;
        grid.set(voxelKey(...voxel), mat);
        sum[0] += voxel[0] + 0.5;
        sum[1] += voxel[1] + 0.5;
        sum[2] += voxel[2] + 0.5;
      }
      const count = Math.max(local.size, 1);
      placed = { grid, bounds: gridBounds(grid), centroid: [sum[0]! / count, sum[1]! / count, sum[2]! / count] };
      this.#placed.set(fitting.id, placed);
    }
    return placed;
  }
}

export const fittingById = (vehicle: Vehicle): ReadonlyMap<string, Fitting> =>
  new Map(vehicle.fittings.map((fitting) => [fitting.id, fitting]));

/** The fittings a build starts with: every non-optional fitting not in `removed`. */
export const initialFittings = (vehicle: Vehicle, removed: readonly string[]): Set<string> => {
  const off = new Set(removed);
  return new Set(vehicle.fittings.filter((fitting) => !(fitting.optional || off.has(fitting.id))).map(({ id }) => id));
};

/** Installed fittings that rest on `id`; while any remain, `id` can't come off. */
export const dependentsOf = (vehicle: Vehicle, installed: ReadonlySet<string>, id: string): readonly Fitting[] =>
  vehicle.fittings.filter((fitting) => installed.has(fitting.id) && fitting.supportedBy.includes(id));

/** Supports of `id` that aren't fitted; `id` can't go on until they are. */
export const missingSupports = (vehicle: Vehicle, installed: ReadonlySet<string>, id: string): readonly string[] =>
  fittingById(vehicle)
    .get(id)
    ?.supportedBy.filter((support) => !installed.has(support)) ?? [];

/** Unknown support ids, cycles, and installed fittings resting on something absent. */
export const supportProblems = (vehicle: Vehicle, installed: ReadonlySet<string>): readonly string[] => {
  const byId = fittingById(vehicle);
  const problems: string[] = [];
  for (const fitting of vehicle.fittings) {
    for (const support of fitting.supportedBy) {
      if (!byId.has(support)) {
        problems.push(`${fitting.id} rests on unknown ${support}`);
      } else if (installed.has(fitting.id) && !installed.has(support)) {
        problems.push(`${fitting.id} is fitted without ${support}`);
      }
    }
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (done.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      problems.push(`support cycle: ${[...path, id].join(' → ')}`);
      return;
    }
    visiting.add(id);
    for (const support of byId.get(id)?.supportedBy ?? []) {
      visit(support, [...path, id]);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const fitting of vehicle.fittings) {
    visit(fitting.id, []);
  }
  return problems;
};

export interface MassReport {
  readonly massKg: number;
  /** Centre of mass in metres from the vehicle's origin: forward, up and toward the near side. */
  readonly centre: readonly [x: number, y: number, z: number];
}

/** Mass and centre of mass from the installed fittings, each part's mass at the centre of its voxels. */
export const measure = (library: PartLibrary, installed: ReadonlySet<string>): MassReport => {
  const { vehicle } = library;
  const [lx, , lz] = latticeVoxels(vehicle);
  let massKg = 0;
  const moment: [number, number, number] = [0, 0, 0];
  for (const fitting of vehicle.fittings) {
    if (!installed.has(fitting.id)) {
      continue;
    }
    const mass = partTypeOf(vehicle, fitting).massKg;
    const [cx, cy, cz] = library.placed(fitting).centroid;
    massKg += mass;
    moment[0] += (cx - lx / 2) * VOXEL * mass;
    moment[1] += cy * VOXEL * mass;
    moment[2] += (cz - lz / 2) * VOXEL * mass;
  }
  const divisor = massKg || 1;
  return { massKg, centre: [moment[0]! / divisor, moment[1]! / divisor, moment[2]! / divisor] };
};

/**
 * The hearing radius of the installed fittings at idle, in metres. Sources add as sound intensity does,
 * which falls with the square of distance, so their radii add in quadrature. Each fitted damper then
 * scales the total, so taking one off never makes the vehicle quieter.
 */
export const noiseRadius = (vehicle: Vehicle, installed: ReadonlySet<string>): number => {
  let power = 0;
  let scale = 1;
  for (const fitting of vehicle.fittings) {
    if (!installed.has(fitting.id)) {
      continue;
    }
    const { noise } = partTypeOf(vehicle, fitting);
    power += (noise?.radiusMetres ?? 0) ** 2;
    scale *= noise?.rangeScale ?? 1;
  }
  return Math.sqrt(power) * scale;
};
