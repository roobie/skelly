/**
 * Vehicle blueprints as exported content: fittings name part items, whose exported models carry each
 * part's mass, centre of mass, baked collision and datums. Loading places those in the vehicle frame.
 */
import { modelMassKg } from '@skelly/thing-core/mass';
import { mirrorMotion } from '@skelly/thing-core/motion';
import type { ModelBox, ModelParts, Motion } from '@skelly/thing-core/schema';
import { claimed } from './capabilities.ts';
import { type CargoCells, cargoGrid, fitIssue, placementRegion } from './cargoSpace.ts';
import type { Registry } from './content.ts';
import { admitsType } from './holders.ts';
import type { Item } from './items.ts';
import type { ContentSection, ItemDef, VehicleCapability, VehicleFittingDef } from './schema.ts';
import { slotRefusal } from './stowage.ts';
import type { VehicleInstance, VehicleWorkPlacement } from './vehicleInstances.ts';
import { carriedIssues } from './vehiclePose.ts';

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

/** A part the player can open says how, and a part that cannot open says nothing of opening. */
const openingIssue = (registry: Registry, itemId: string): string | undefined => {
  const item = registry.items.get(itemId)!;
  const moves = partMoves(registry, itemId);
  if (moves && !item.vehicle?.opening) {
    return 'a part whose model moves needs an opening';
  }
  return !moves && item.vehicle?.opening ? 'only a part whose model moves has an opening' : undefined;
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

const partMetadataIssues = (part: NonNullable<ItemDef['vehicle']>): PathIssue[] => {
  const issues: PathIssue[] = [];
  if (part.cargoSpace && !part.addon) {
    issues.push(['.vehicle.addon', 'a cargo space needs an add-on face requirement']);
  }
  if (part.service && part.service.mount !== part.mount) {
    issues.push(['.vehicle.service.mount', 'work requirements must match the part mount']);
  }
  const rating = ratingIssue(part);
  if (rating) {
    issues.push(['.vehicle', rating]);
  }
  return issues;
};

/**
 * Why a site reference does not name a part-provided site: its provider is no vehicle part, provides no site under
 * that key, or the position is missing, unknown or given to a site that takes none. Content and saved builds share it.
 */
export const vehicleSiteIssue = (
  registry: Registry,
  { provider, key, position }: Readonly<NonNullable<VehicleFittingDef['site']>>,
): string | undefined => {
  const part = registry.items.get(provider)?.vehicle;
  if (!part) {
    return `provider "${provider}" is not a vehicle part`;
  }
  const names = part.sites?.[key];
  if (names === undefined) {
    return `part "${provider}" provides no site "${key}"`;
  }
  if (typeof names === 'string') {
    return position === undefined ? undefined : `site "${provider}/${key}" takes no position`;
  }
  if (position === undefined) {
    return `site "${provider}/${key}" needs a position`;
  }
  return Object.hasOwn(names, position) ? undefined : `site "${provider}/${key}" has no position "${position}"`;
};

/** A site as both a blueprint fitting and a saved build's site carry it. */
type SitePlacement = Pick<VehicleFittingDef, 'service' | 'site' | 'supportedBy'>;

/**
 * The one site rule for content and saved builds alike. Each serviceable site resting on a part names the
 * part-provided site it is; the part it names as provider is one it rests on; and no two sites read alike. The
 * blueprint only places parts, so the providing part owns the name. A root rests on nothing, so no part provides its
 * site and it carries none; how long a vacant root's site lasts while another root remains is the #322 builder's
 * question. `partOf` gives the part fitted at a support, or nothing while that support stands empty: a site is refused
 * only when every support is fitted and none is its provider, so an emptied support, such as a strut taken off after
 * its wheel, does not invalidate a reachable build. Returns each issue's site index, path within it and message.
 */
export const vehicleSitesIssues = (
  registry: Registry,
  sites: readonly SitePlacement[],
  partOf: (support: string) => string | undefined,
): (readonly [index: number, path: string, message: string])[] => {
  const seen = new Set<string>();
  return sites.flatMap(({ service, site, supportedBy }, i): (readonly [number, string, string])[] => {
    if (!site) {
      return service && supportedBy.length > 0
        ? [[i, '.site', 'a serviceable site resting on a part needs the part-provided site it is']]
        : [];
    }
    const issue = vehicleSiteIssue(registry, site);
    if (issue) {
      return [[i, '.site', issue]];
    }
    const fitted = supportedBy.map(partOf);
    if (!fitted.includes(site.provider) && fitted.every((part) => part !== undefined)) {
      return [[i, '.site.provider', `no part this site rests on is "${site.provider}"`]];
    }
    const identity = JSON.stringify([site.provider, site.key, site.position ?? null]);
    if (seen.has(identity)) {
      return [[i, '.site', 'another site reads alike; give each repeated site its own position']];
    }
    seen.add(identity);
    return [];
  });
};

const siteIssues = (registry: Registry, fittings: readonly VehicleFittingDef[]): PathIssue[] => {
  const partOf = new Map(fittings.map(({ id, part }) => [id, part]));
  return vehicleSitesIssues(registry, fittings, (support) => partOf.get(support)).map(
    ([i, path, message]): PathIssue => [`.fittings[${i}]${path}`, message],
  );
};

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
  ...fittings.flatMap(({ finish }, i): PathIssue[] =>
    finish === undefined || registry.finishes.has(finish) ? [] : [[`.fittings[${i}].finish`, `no finish "${finish}"`]],
  ),
  ...supportProblems(fittings).map((message): PathIssue => ['.fittings', message]),
  ...bracingIssue(registry, fittings),
  ...siteIssues(registry, fittings),
  ...fittings.flatMap((fitting, i) => stowedIssues(registry, fitting, `.fittings[${i}].stowed`)),
  ...fittings.flatMap(({ id, behind }, i): PathIssue[] => {
    const closure = behind === undefined ? undefined : fittings.find((other) => other.id === behind);
    if (behind === undefined || (closure && closure.id !== id && registry.items.get(closure.part)?.vehicle?.opening)) {
      return [];
    }
    return [[`.fittings[${i}].behind`, `no other fitting "${behind}" that opens`]];
  }),
];

/** A load-out names slot pockets of the part's container, each with an item that slot seats and the container admits. */
const stowedIssues = (registry: Registry, { part, stowed }: VehicleFittingDef, path: string): PathIssue[] =>
  Object.entries(stowed ?? {}).flatMap(([slot, type]): PathIssue[] => {
    const container = registry.items.get(part)?.container;
    const item = registry.items.get(type);
    if (!container?.pockets.some((pocket) => pocket.slot === slot)) {
      return [[`${path}.${slot}`, `part "${part}" has no slot pocket "${slot}"`]];
    }
    if (!item) {
      return [[`${path}.${slot}`, `no item "${type}"`]];
    }
    const refusal = admitsType(container, item)
      ? slotRefusal(registry, { owner: part, id: slot }, { type, count: 1 }, [])
      : 'slotNotFor';
    return refusal ? [[`${path}.${slot}`, `slot "${slot}" does not seat "${type}"`]] : [];
  });

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

/** Spinning fittings that cannot roll: a rim whose collision stops at or above its axle would spin without limit. */
const spinIssues = (registry: Registry, vehicle: string, fittings: readonly VehicleFittingDef[]): PathIssue[] =>
  fittings.flatMap((fitting, i): PathIssue[] => {
    if (!fitting.spin) {
      return [];
    }
    const radius = rollingRadius(fitting.at, placeFitting(registry, fitting).collision);
    return radius > 0 && Number.isFinite(radius)
      ? []
      : [
          [
            `.fittings[${i}].spin`,
            `vehicle "${vehicle}" fitting "${fitting.id}" spins with rolling radius ${radius}; its collision must reach below its axle`,
          ],
        ];
  });

/** A blueprint's own issues; it is placed only once its references and parts are sound. */
const blueprintIssues = (
  registry: Registry,
  { id, fittings }: { readonly id: string; readonly fittings: readonly VehicleFittingDef[] },
  unsound: ReadonlySet<string>,
  cellMetres: number | undefined,
): PathIssue[] => {
  const found = fittingIssues(registry, fittings);
  if (found.length > 0 || fittings.some(({ part }) => unsound.has(part))) {
    return found;
  }
  const addons = fittings.some(({ part }) => registry.items.get(part)?.vehicle?.addon);
  return [
    ...spinIssues(registry, id, fittings),
    ...carriedIssues(fittings.map((fitting) => ({ ...fitting, moves: partMoves(registry, fitting.part) }))).map(
      (issue): PathIssue => ['.fittings', issue],
    ),
    ...(addons ? placementIssues(registry, fittings, cellMetres) : []),
  ];
};

/** Whether a part's model moves it of its own: what decides, in content and saves alike, what else it may carry. */
export const partMoves = (registry: Registry, part: string): boolean => {
  const model = registry.items.get(part)?.model;
  return model !== undefined && registry.models.get(model)?.motion !== undefined;
};

/**
 * Parts without exported physics, a lift rating or, when they move, an opening; blueprints with broken references, supports or bracing;
 * spinning fittings that cannot roll, cargo spaces off their free floor, and parts inside a cargo space.
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
    const opening = item.vehicle && openingIssue(registry, item.id);
    if (opening) {
      issues.push({ section: 'items', id: item.id, path: '.vehicle.opening', message: opening });
    }
    if (item.vehicle) {
      issues.push(
        ...partMetadataIssues(item.vehicle).map(([path, problem]) => ({
          section: 'items' as const,
          id: item.id,
          path,
          message: problem,
        })),
      );
    }
  }
  const cellMetres = claimed(registry.inventory, 'player')?.cellMetres;
  for (const blueprint of registry.vehicleBlueprints.values()) {
    const { id } = blueprint;
    const found = blueprintIssues(registry, blueprint, unsound, cellMetres);
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
  /** How it moves from rest to its stop, in the vehicle frame; absent for a fitting that stays put. */
  readonly motion?: Motion;
  /** The voxel lattice its drawn collision lies on: planes `grain` metres apart through `origin`. */
  readonly lattice?: { readonly grain: number; readonly origin: Vec3 };
  readonly addon?: NonNullable<NonNullable<ItemDef['vehicle']>['addon']>;
  /** A cargo space's size and pocket. */
  readonly cargo?: {
    readonly cells: CargoCells;
    readonly grid: ReturnType<typeof cargoGrid>;
  };
}

export interface LoadedVehicle {
  readonly id: string;
  readonly fittings: readonly PlacedFitting[];
  readonly massKg: number;
  readonly centreOfMass: Vec3;
}

const place = ({ at, mirror }: VehicleFittingDef, [x, y, z]: Vec3): Vec3 => [
  mirror ? at[0] - x : at[0] + x,
  at[1] + y,
  at[2] + z,
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
  const cell = claimed(registry.inventory, 'player')?.cellMetres;
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

/** A part's motion in the vehicle frame: reflected when the fitting is mirrored, its axis ends moved to where it stands. */
const placeMotion = (fitting: VehicleFittingDef, motion: Motion): Motion => {
  const shifted = ([x, y, z]: Vec3): Vec3 => [fitting.at[0] + x, fitting.at[1] + y, fitting.at[2] + z];
  return (fitting.mirror ? mirrorMotion(motion) : motion).map((stage) =>
    stage.kind === 'hinge' ? { ...stage, axis: { from: shifted(stage.axis.from), to: shifted(stage.axis.to) } } : stage,
  ) as unknown as Motion;
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
    ...(item.vehicle.addon ? { addon: item.vehicle.addon } : {}),
    supportedBy: fitting.supportedBy,
    massKg: modelMassKg({ parts: model.parts }),
    ...(cells ? cargoBody(registry, fitting, cells) : partBody(fitting, Object.values(model.parts))),
    datums: Object.fromEntries(
      Object.entries(model.anchors ?? {}).map(([id, point]) => [id, place(fitting, grow(point))]),
    ),
    ...(model.motion ? { motion: placeMotion(fitting, model.motion) } : {}),
    ...(cells && space ? { cargo: { cells, grid: cargoGrid(cells, space) } } : {}),
  };
};

export interface LegalAddonPlacements {
  readonly support: string;
  readonly cells: readonly VehicleWorkPlacement[];
}

export const legalAddonPlacements = (
  registry: Registry,
  item: Item,
  vehicle: VehicleInstance,
): LegalAddonPlacements[] => {
  const part = registry.items.get(item.type)?.vehicle;
  if (!part?.addon || (part.cargoSpace && !item.cargo)) {
    return [];
  }
  const cell = claimed(registry.inventory, 'player')!.cellMetres;
  const prototype = placeFitting(registry, {
    id: `addon:${item.uid}`,
    part: item.type,
    at: [0, 0, 0],
    supportedBy: [],
    ...(item.cargo ? { cargo: [...item.cargo] } : {}),
  });
  const min = [0, 1, 2].map((axis) => Math.min(...prototype.collision.map((box) => box.min[axis]!)));
  const present = vehicle.fittings
    .filter((fitting) => fitting.item.uid !== item.uid)
    .map((fitting) =>
      placeFitting(registry, {
        id: fitting.id,
        at: fitting.at,
        mirror: fitting.mirror,
        supportedBy: fitting.supportedBy,
        part: fitting.item.type,
        ...(fitting.item.cargo ? { cargo: [...fitting.item.cargo] } : {}),
      }),
    );
  return present.flatMap(({ id }) => {
    const floor = placementRegion(present, id, cell, prototype.addon!);
    if (!floor) {
      return [];
    }
    const cells: VehicleWorkPlacement[] = [];
    for (const key of floor.clearance.keys()) {
      const [i, k] = key.split(',').map(Number) as [number, number];
      const at: [number, number, number] = [0, 0, 0];
      at[floor.face.normal] = floor.plane - min[floor.face.normal]!;
      at[floor.face.tangents[0]] = i * cell - min[floor.face.tangents[0]]!;
      at[floor.face.tangents[1]] = k * cell - min[floor.face.tangents[1]]!;
      const placement: VehicleWorkPlacement = { at, supportedBy: [id] };
      const candidate = placeFitting(registry, {
        id: prototype.id,
        part: item.type,
        ...placement,
        ...(item.cargo ? { cargo: [...item.cargo] } : {}),
      });
      if (!fitIssue(present, candidate, cell)) {
        cells.push(placement);
      }
    }
    return [{ support: id, cells }];
  });
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

/** A part rolls on its lowest point, so its axle's height above it is the radius at which the rim keeps ground speed. */
export const rollingRadius = (at: VehicleFittingDef['at'], collision: PlacedFitting['collision']): number =>
  at[1] - Math.min(...collision.map((box) => box.min[1]));

/** A fitting as the support graph sees it: blueprint fittings and saved builds alike. */
interface Supported {
  readonly id: string;
  /** Every fitting it rests on. */
  readonly supportedBy: readonly string[];
}

const fittingById = <F extends Supported>(fittings: readonly F[]): ReadonlyMap<string, F> =>
  new Map(fittings.map((fitting) => [fitting.id, fitting]));

/** Fittings resting on something that isn't there, and support cycles. */
export const supportProblems = (fittings: readonly Supported[]): readonly string[] => {
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
