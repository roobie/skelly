/**
 * Vehicles as parts. Content: a catalogue of immutable part types, and blueprints that list a
 * factory build's fittings. State: a vehicle instance, which owns its fittings, made from a
 * blueprint and changed one fitting at a time.
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
  /**
   * Voxel ops in the part's own frame. A material is `paint` or `seam`, which take the vehicle's
   * paint, a name in the shared material table (`materials.ts`, `MATERIALS`), or `#rrggbb`.
   */
  readonly shape: readonly ShapeOp[];
  /** The facing axis of a flat body panel, whose `paint` edges become `seam` (voxels.ts, `markSeams`). */
  readonly panel?: Axis;
  /** The point a fitting turns about, in the part's frame: a wheel's axle, a door's hinge line. */
  readonly pivot?: readonly [x: number, y: number, z: number];
  /** Where a rider's hips sit on this part, in its frame: the saddle of a bike with no cabin to sit in. */
  readonly rider?: readonly [x: number, y: number, z: number];
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
  /** Unique within one vehicle. */
  readonly id: string;
  /** A part type id in the catalogue. */
  readonly type: string;
  /**
   * Vehicle-local voxel position of the part's origin: x forward, y up, z toward the near side. It is
   * where the fitting is, mirrored or not, so it needs nothing else to place the part.
   */
  readonly at: Vec3i;
  /** The shape is reflected across z in its own frame, about `at`: the far-side twin of a near-side part. */
  readonly mirror?: true;
  /** Every fitting it rests on. All must be fitted before it is, and none can come off while it's on. */
  readonly supportedBy: readonly string[];
  /** Spins about the type's pivot on the z axis (a wheel on an axle), or swings on it about y (a door). */
  readonly motion?: 'spin' | 'hinge';
}

/** A vehicle's paint: the body colour, and the darker line its panel seams take. */
export interface Paint {
  readonly body: string;
  readonly seam: string;
}

/** Every part type, by an id that is unique across all vehicles: content blueprints and items name. */
export type PartCatalogue = Readonly<Record<string, PartType>>;

/** One entry per id; a type shared by two blueprints is the same object, listed by both. */
export const catalogueOf = (types: readonly PartType[]): PartCatalogue => {
  const catalogue: Record<string, PartType> = {};
  for (const type of types) {
    const known = catalogue[type.id];
    if (known && known !== type) {
      throw new Error(`Two part types share the id ${type.id}`);
    }
    catalogue[type.id] = type;
  }
  return catalogue;
};

/** A factory build: content. A new vehicle starts as a copy of its fittings, in its paint. */
export interface Blueprint {
  readonly id: string;
  readonly label: string;
  /** The display envelope in cells; the vehicle's origin is its centre on the ground. */
  readonly lattice: Vec3i;
  readonly paint: Paint;
  readonly fittings: readonly Fitting[];
}

/**
 * One vehicle: state. It owns its fittings, so a part can come off, go on or come from elsewhere
 * without its blueprint changing, and two vehicles of one blueprint change independently.
 */
export interface VehicleInstance {
  readonly id: string;
  /** The blueprint it was made from. */
  readonly blueprint: string;
  readonly paint: Paint;
  readonly fittings: Fitting[];
}

/** A vehicle as its blueprint builds it, less the fittings in `without`. */
export const newInstance = (blueprint: Blueprint, id: string, without: readonly string[] = []): VehicleInstance => {
  const off = new Set(without);
  return {
    id,
    blueprint: blueprint.id,
    paint: blueprint.paint,
    fittings: blueprint.fittings.filter((fitting) => !off.has(fitting.id)),
  };
};

export const latticeVoxels = ({ lattice }: Pick<Blueprint, 'lattice'>): Vec3i => {
  const [x, y, z] = lattice;
  return [x * VOXELS_PER_CELL, y * VOXELS_PER_CELL, z * VOXELS_PER_CELL];
};

export const partTypeOf = (catalogue: PartCatalogue, fitting: Fitting): PartType => {
  const type = catalogue[fitting.type];
  if (!type) {
    throw new Error(`Fitting ${fitting.id} names unknown part type ${fitting.type}`);
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

/** Caches each part type's grid, and each fitting's voxels in vehicle space. */
export class PartLibrary {
  readonly #grids = new Map<string, VoxelGrid>();
  readonly #placed = new WeakMap<Fitting, PlacedPart>();
  readonly catalogue: PartCatalogue;

  constructor(catalogue: PartCatalogue) {
    this.catalogue = catalogue;
  }

  /** The type's local grid, mirrored for a far-side fitting. */
  grid(typeId: string, mirror: boolean): VoxelGrid {
    const key = `${typeId}:${mirror}`;
    let grid = this.#grids.get(key);
    if (!grid) {
      const type = this.catalogue[typeId];
      if (!type) {
        throw new Error(`Unknown part type ${typeId}`);
      }
      grid = mirror ? mirrorZ(this.grid(typeId, false)) : partGrid(type);
      this.#grids.set(key, grid);
    }
    return grid;
  }

  placed(fitting: Fitting): PlacedPart {
    let placed = this.#placed.get(fitting);
    if (!placed) {
      const local = this.grid(fitting.type, fitting.mirror === true);
      const [ox, oy, oz] = fitting.at;
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
      this.#placed.set(fitting, placed);
    }
    return placed;
  }
}

export const fittingById = (fittings: readonly Fitting[]): ReadonlyMap<string, Fitting> =>
  new Map(fittings.map((fitting) => [fitting.id, fitting]));

/** Fittings that rest on `id`; while any remain, `id` can't come off. */
export const dependentsOf = (fittings: readonly Fitting[], id: string): readonly Fitting[] =>
  fittings.filter((fitting) => fitting.supportedBy.includes(id));

/** Supports of `fitting` that aren't among `fittings`; it can't go on until they are. */
export const missingSupports = (fittings: readonly Fitting[], fitting: Fitting): readonly string[] => {
  const present = fittingById(fittings);
  return fitting.supportedBy.filter((support) => !present.has(support));
};

/** Takes a fitting off the vehicle unless something rests on it, and returns what does. */
export const removeFitting = (vehicle: VehicleInstance, id: string): readonly Fitting[] => {
  const blockers = dependentsOf(vehicle.fittings, id);
  const index = vehicle.fittings.findIndex((fitting) => fitting.id === id);
  if (blockers.length === 0 && index >= 0) {
    vehicle.fittings.splice(index, 1);
  }
  return blockers;
};

/** Fits a part to the vehicle once all its supports are on, and returns the supports that aren't. */
export const addFitting = (vehicle: VehicleInstance, fitting: Fitting): readonly string[] => {
  const missing = missingSupports(vehicle.fittings, fitting);
  if (missing.length === 0 && !vehicle.fittings.some(({ id }) => id === fitting.id)) {
    vehicle.fittings.push(fitting);
  }
  return missing;
};

/** Fittings resting on something that isn't there, and support cycles. */
export const supportProblems = (fittings: readonly Fitting[]): readonly string[] => {
  const byId = fittingById(fittings);
  const problems: string[] = [];
  for (const fitting of fittings) {
    for (const support of fitting.supportedBy) {
      if (!byId.has(support)) {
        problems.push(`${fitting.id} rests on absent ${support}`);
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
  for (const fitting of fittings) {
    visit(fitting.id, []);
  }
  return problems;
};

export interface MassReport {
  readonly massKg: number;
  /** Centre of mass in vehicle-local voxels. */
  readonly centre: readonly [x: number, y: number, z: number];
}

/** Mass and centre of mass of the fittings, each part's mass at the centre of its voxels. */
export const measure = (library: PartLibrary, fittings: readonly Fitting[]): MassReport => {
  let massKg = 0;
  const moment: [number, number, number] = [0, 0, 0];
  for (const fitting of fittings) {
    const mass = partTypeOf(library.catalogue, fitting).massKg;
    const [cx, cy, cz] = library.placed(fitting).centroid;
    massKg += mass;
    moment[0] += cx * mass;
    moment[1] += cy * mass;
    moment[2] += cz * mass;
  }
  const divisor = massKg || 1;
  return { massKg, centre: [moment[0]! / divisor, moment[1]! / divisor, moment[2]! / divisor] };
};

/**
 * The hearing radius of the fittings at idle, in metres. Sources add as sound intensity does, which
 * falls with the square of distance, so their radii add in quadrature. Each fitted damper then scales
 * the total, so taking one off never makes the vehicle quieter.
 */
export const noiseRadius = (catalogue: PartCatalogue, fittings: readonly Fitting[]): number => {
  let power = 0;
  let scale = 1;
  for (const fitting of fittings) {
    const { noise } = partTypeOf(catalogue, fitting);
    power += (noise?.radiusMetres ?? 0) ** 2;
    scale *= noise?.rangeScale ?? 1;
  }
  return Math.sqrt(power) * scale;
};
