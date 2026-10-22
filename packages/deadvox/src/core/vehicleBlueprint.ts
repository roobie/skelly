/**
 * Vehicle blueprints as exported content: fittings name part items, whose exported models carry each
 * part's mass, centre of mass, baked collision and datums. Loading places those in the vehicle frame.
 */
import { modelMassKg } from '@skelly/thing-core/mass';
import type { ModelBox } from '@skelly/thing-core/schema';
import { supportProblems } from '../vehicles/model.ts';
import type { Registry } from './content.ts';
import type { ContentSection, VehicleCapability, VehicleFittingDef } from './schema.ts';

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

/** Parts without exported physics or a lift rating, and blueprints with broken references, supports or bracing. */
export const vehicleContentIssues = (registry: Registry): VehicleIssue[] => {
  const issues: VehicleIssue[] = [];
  for (const item of registry.items.values()) {
    const message = item.vehicle && partModelIssue(registry, item.id);
    if (message) {
      issues.push({ section: 'items', id: item.id, path: '.model', message });
    }
    const rating = item.vehicle && ratingIssue(item.vehicle);
    if (rating) {
      issues.push({ section: 'items', id: item.id, path: '.vehicle', message: rating });
    }
  }
  for (const blueprint of registry.vehicleBlueprints.values()) {
    const capabilities = new Set<VehicleCapability>();
    blueprint.fittings.forEach((fitting, i) => {
      const item = registry.items.get(fitting.part);
      if (!item?.vehicle) {
        const message = item ? `item "${fitting.part}" is not a vehicle part` : `no item "${fitting.part}"`;
        issues.push({ section: 'vehicleBlueprints', id: blueprint.id, path: `.fittings[${i}].part`, message });
      }
      for (const capability of item?.vehicle?.capabilities ?? []) {
        capabilities.add(capability);
      }
    });
    for (const message of supportProblems(blueprint.fittings)) {
      issues.push({ section: 'vehicleBlueprints', id: blueprint.id, path: '.fittings', message });
    }
    if (capabilities.has('lift') && !capabilities.has('stabiliser')) {
      const message = 'a vehicle that lifts needs a stabiliser fitted';
      issues.push({ section: 'vehicleBlueprints', id: blueprint.id, path: '.fittings', message });
    }
  }
  return issues;
};

/** One fitting in the vehicle frame, metres: everything its export says, reflected when it is mirrored. */
export interface PlacedFitting {
  readonly id: string;
  readonly part: string;
  readonly capabilities: readonly VehicleCapability[];
  readonly massKg: number;
  readonly centreOfMass: Vec3;
  readonly collision: readonly ModelBox[];
  readonly datums: Readonly<Record<string, Vec3>>;
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

/** Places a fitting of validated content; mass and centre come only from the part's export. */
const placeFitting = (registry: Registry, fitting: VehicleFittingDef): PlacedFitting => {
  const item = registry.items.get(fitting.part);
  const model = item?.model === undefined ? undefined : registry.models.get(item.model);
  if (!(item?.vehicle && model?.parts)) {
    throw new Error(`Fitting ${fitting.id} names ${fitting.part}, which is not a loaded vehicle part`);
  }
  const parts = Object.values(model.parts).map((part) => ({
    ...part,
    centreOfMass: place(fitting, part.centreOfMass),
  }));
  return {
    id: fitting.id,
    part: fitting.part,
    capabilities: item.vehicle.capabilities,
    massKg: modelMassKg({ parts: model.parts }),
    centreOfMass: parts.length > 0 ? massCentre(parts) : place(fitting, [0, 0, 0]),
    collision: Object.values(model.parts).flatMap((part) =>
      (part.collision ?? []).map((box) => placeBox(fitting, box)),
    ),
    datums: Object.fromEntries(Object.entries(model.anchors ?? {}).map(([id, point]) => [id, place(fitting, point)])),
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
