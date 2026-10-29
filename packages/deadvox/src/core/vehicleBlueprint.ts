/**
 * Vehicle blueprints as exported content: fittings name part items, whose exported models carry each
 * part's mass, centre of mass, baked collision and datums. Loading places those in the vehicle frame.
 */
import { modelMassKg } from '@skelly/thing-core/mass';
import type { ModelBox, ModelParts } from '@skelly/thing-core/schema';
import { supportProblems } from '../vehicles/model.ts';
import { type CargoCells, cargoGrid, fitIssue } from './cargoSpace.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { ContentSection, ItemDef, VehicleCapability, VehicleFittingDef } from './schema.ts';

type Vec3 = readonly [number, number, number];

interface VehicleIssue {
  readonly section: ContentSection;
  readonly id: string;
  readonly path: string;
  readonly message: string;
}

const partModelIssue = (registry: Registry, itemId: string): string | undefined => {
  const item = registry.items.get(itemId)!;
  if (item.model === undefined) {
    return 'a vehicle part needs a model';
  }
  const parts = registry.models.get(item.model)?.parts;
  if (parts === undefined) {
    // A missing model is reported with the item's other references.
    return registry.models.has(item.model) ? `model "${item.model}" exports no part masses` : undefined;
  }
  const bare = Object.keys(parts).filter((id) => parts[id]!.collision === undefined);
  return bare.length === 0 ? undefined : `model "${item.model}" has no baked collision for ${bare.join(', ')}`;
};

const ratingIssue = ({
  capabilities,
  ratedLoadKg,
}: {
  capabilities: readonly VehicleCapability[];
  ratedLoadKg?: number | undefined;
}) => {
  const lifts = capabilities.includes('lift');
  if (lifts && ratedLoadKg === undefined) {
    return 'a lifting part needs a rated load';
  }
  return !lifts && ratedLoadKg !== undefined ? 'only a lifting part has a rated load' : undefined;
};

type PathIssue = readonly [path: string, message: string];

const cargoSizeIssue = (item: ItemDef, fitting: VehicleFittingDef): string | undefined => {
  if (item.vehicle?.cargoSpace) {
    return fitting.cargo ? undefined : 'a cargo space needs its size';
  }
  return fitting.cargo && `item "${item.id}" is not a cargo space`;
};

const bracingIssue = (registry: Registry, fittings: readonly VehicleFittingDef[]): PathIssue[] => {
  const fitted = fittings.flatMap(({ part }) => registry.items.get(part)?.vehicle?.capabilities ?? []);
  return fitted.includes('lift') && !fitted.includes('stabiliser')
    ? [['.fittings', 'a vehicle that lifts needs a stabiliser fitted']]
    : [];
};

/** Fittings naming no vehicle part, cargo sizes on the wrong parts, broken supports, and lifting unbraced. */
const fittingIssues = (registry: Registry, fittings: readonly VehicleFittingDef[]): PathIssue[] => [
  ...fittings.flatMap((fitting, i): PathIssue[] => {
    const item = registry.items.get(fitting.part);
    if (!item?.vehicle) {
      const message = item ? `item "${fitting.part}" is not a vehicle part` : `no item "${fitting.part}"`;
      return [[`.fittings[${i}].part`, message]];
    }
    const message = cargoSizeIssue(item, fitting);
    return message ? [[`.fittings[${i}].cargo`, message]] : [];
  }),
  ...supportProblems(fittings).map((message): PathIssue => ['.fittings', message]),
  ...bracingIssue(registry, fittings),
];

/** Each fitting placed beside all the others: cargo spaces off their free floor, and parts inside one. */
const placementIssues = (
  registry: Registry,
  fittings: readonly VehicleFittingDef[],
  cellMetres: number | undefined,
): PathIssue[] => {
  if (cellMetres === undefined) {
    return [['.fittings', 'a cargo space needs the inventory cell size']];
  }
  const placed = fittings.map((fitting) => placeFitting(registry, fitting));
  return placed.flatMap((fitting, i): PathIssue[] => {
    const message = fitIssue(
      placed.filter((other) => other !== fitting),
      fitting,
      cellMetres,
    );
    return message ? [[`.fittings[${i}]`, message]] : [];
  });
};

/**
 * Parts without exported physics or a lift rating; blueprints with broken references, supports or bracing;
 * cargo spaces off their free floor, and parts inside a cargo space.
 */
export const vehicleContentIssues = (registry: Registry): VehicleIssue[] => {
  const issues: VehicleIssue[] = [];
  const unsound = new Set<string>();
  for (const item of registry.items.values()) {
    const message = item.vehicle && partModelIssue(registry, item.id);
    if (message) {
      issues.push({ section: 'items', id: item.id, path: '.model', message });
    }
    if (item.vehicle && (message || !registry.models.get(item.model!)?.parts)) {
      unsound.add(item.id);
    }
    if (item.vehicle && item.vehicle.capabilities.includes('seat') !== Boolean(item.vehicle.seat)) {
      issues.push({ section: 'items', id: item.id, path: '.vehicle.seat', message: 'seat capability needs seat data, and only seats have it' });
    }
    const rating = item.vehicle && ratingIssue(item.vehicle);
    if (rating) {
      issues.push({ section: 'items', id: item.id, path: '.vehicle', message: rating });
    }
  }
  const cellMetres = registry.inventory.get(CORE_CONTENT_IDS.player)?.cellMetres;
  for (const { id, fittings } of registry.vehicleBlueprints.values()) {
    let found = fittingIssues(registry, fittings);
    if (found.length === 0 && fittings.some(({ cargo }) => cargo) && fittings.every(({ part }) => !unsound.has(part))) {
      found = placementIssues(registry, fittings, cellMetres);
    }
    issues.push(...found.map(([path, message]) => ({ section: 'vehicleBlueprints' as const, id, path, message })));
  }
  return issues;
};

/** One fitting in the vehicle frame, metres: everything its export says, reflected when it is mirrored. */
export interface PlacedFitting {
  readonly id: string;
  readonly part: string;
  readonly capabilities: readonly VehicleCapability[];
  /** Every fitting it rests on. */
  readonly supportedBy: readonly string[];
  readonly massKg: number;
  readonly centreOfMass: Vec3;
  readonly collision: readonly ModelBox[];
  readonly datums: Readonly<Record<string, Vec3>>;
  /** The voxel lattice its drawn collision lies on: planes `grain` metres apart through `origin`. */
  readonly lattice?: { readonly grain: number; readonly origin: Vec3 };
  /** A cargo space's size, its pocket and the clearance it assumes where nothing is above. */
  readonly cargo?: {
    readonly cells: CargoCells;
    readonly grid: ReturnType<typeof cargoGrid>;
    readonly openClearanceCells: number;
  };
}

export interface LoadedVehicle {
  readonly id: string;
  readonly fittings: readonly PlacedFitting[];
  readonly massKg: number;
  readonly centreOfMass: Vec3;
}

const place = ({ at, mirror }: VehicleFittingDef, [x, y, z]: Vec3): Vec3 => [
  at[0] + x,
  at[1] + y,
  mirror ? at[2] - z : at[2] + z,
];

const placeBox = (fitting: VehicleFittingDef, { min, max }: ModelBox): ModelBox => {
  const [a, b] = [place(fitting, min), place(fitting, max)];
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
};

const massCentre = (masses: readonly { readonly massKg: number; readonly centreOfMass: Vec3 }[]): Vec3 => {
  const total = masses.reduce((sum, { massKg }) => sum + massKg, 0);
  const moment = (axis: 0 | 1 | 2) =>
    masses.reduce((sum, { massKg, centreOfMass }) => sum + massKg * centreOfMass[axis], 0) / (total || 1);
  return [moment(0), moment(1), moment(2)];
};

/** The one grain every part of a model is drawn at, if they share one. */
const sharedGrain = (parts: readonly { readonly voxelGrain?: number | undefined }[]): number | undefined => {
  const [first, ...rest] = parts.map(({ voxelGrain }) => voxelGrain);
  return rest.every((grain) => grain === first) ? first : undefined;
};

type Body = Pick<PlacedFitting, 'centreOfMass' | 'collision' | 'lattice'>;
type ModelPart = ModelParts[string];

/** A part's exported body, placed: its parts' collision, mass centre and the lattice they are drawn on. */
const partBody = (fitting: VehicleFittingDef, parts: readonly ModelPart[]): Body => {
  const grain = sharedGrain(parts);
  return {
    centreOfMass:
      parts.length > 0
        ? massCentre(parts.map((part) => ({ ...part, centreOfMass: place(fitting, part.centreOfMass) })))
        : place(fitting, [0, 0, 0]),
    collision: parts.flatMap((part) => (part.collision ?? []).map((box) => placeBox(fitting, box))),
    ...(grain === undefined ? {} : { lattice: { grain, origin: fitting.at } }),
  };
};

/**
 * A cargo space's body is its cells, standing on `at` and centred over it, so the voxels its one-cell model is
 * drawn in leave its size whole; `cargoSpace.ts` snaps that block onto its load floor's lattice.
 */
const cargoBody = (registry: Registry, fitting: VehicleFittingDef, [x, y, z]: CargoCells): Body => {
  const cell = registry.inventory.get(CORE_CONTENT_IDS.player)?.cellMetres;
  if (cell === undefined) {
    throw new Error(`Fitting ${fitting.id} is a cargo space, which needs the inventory cell size`);
  }
  return {
    centreOfMass: place(fitting, [0, (y * cell) / 2, 0]),
    collision: [
      placeBox(fitting, {
        min: [(-x * cell) / 2, 0, (-z * cell) / 2],
        max: [(x * cell) / 2, y * cell, (z * cell) / 2],
      }),
    ],
  };
};

/** Places a fitting of validated content; mass and centre come only from the part's export. */
export const placeFitting = (registry: Registry, fitting: VehicleFittingDef): PlacedFitting => {
  const item = registry.items.get(fitting.part);
  const model = item?.model === undefined ? undefined : registry.models.get(item.model);
  if (!(item?.vehicle && model?.parts)) {
    throw new Error(`Fitting ${fitting.id} names ${fitting.part}, which is not a loaded vehicle part`);
  }
  const space = item.vehicle.cargoSpace;
  const cells = space && fitting.cargo;
  const grow = ([x, y, z]: Vec3): Vec3 => (cells ? [x * cells[0], y * cells[1], z * cells[2]] : [x, y, z]);
  return {
    id: fitting.id,
    part: fitting.part,
    capabilities: item.vehicle.capabilities,
    supportedBy: fitting.supportedBy,
    massKg: modelMassKg({ parts: model.parts }),
    ...(cells ? cargoBody(registry, fitting, cells) : partBody(fitting, Object.values(model.parts))),
    datums: Object.fromEntries(
      Object.entries(model.anchors ?? {}).map(([id, point]) => [id, place(fitting, grow(point))]),
    ),
    ...(cells && space
      ? { cargo: { cells, grid: cargoGrid(cells, space), openClearanceCells: space.openClearanceCells } }
      : {}),
  };
};

/** A vehicle of these placed fittings, such as a blueprint with some of its fittings taken off. */
export const assembledVehicle = (id: string, fittings: readonly PlacedFitting[]): LoadedVehicle => ({
  id,
  fittings,
  massKg: fittings.reduce((sum, { massKg }) => sum + massKg, 0),
  centreOfMass: massCentre(fittings),
});

export const loadVehicleBlueprint = (registry: Registry, id: string): LoadedVehicle => {
  const blueprint = registry.vehicleBlueprints.get(id);
  if (!blueprint) {
    throw new Error(`No vehicle blueprint ${id}`);
  }
  return assembledVehicle(
    id,
    blueprint.fittings.map((fitting) => placeFitting(registry, fitting)),
  );
};
