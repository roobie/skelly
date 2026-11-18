import { claimed } from './capabilities.ts';
import { fitIssue } from './cargoSpace.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { MapEntityStore } from './entities.ts';
import { type Item, type ItemState, restoreItem, snapshotItem } from './items.ts';
import type { VehicleFittingDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { Facing } from './templates.ts';
import { placeFitting, supportProblems, vehicleSitesIssues } from './vehicleBlueprint.ts';

/** A site's saved service rules: the work an authored site asks for in place of its part's own. */
type VehicleService = NonNullable<VehicleFittingDef['service']>;
/** Which part-provided site a placement is; saved as this reference, never as the text it resolves to. */
export type VehicleSiteRef = NonNullable<VehicleFittingDef['site']>;
export type VehicleWorkPlacement = Pick<VehicleFittingDef, 'at' | 'mirror' | 'supportedBy'>;
export type VehicleWorkTarget = VehicleWorkPlacement & { id: string };

export const sameVehiclePlacement = (a: VehicleWorkPlacement, b: VehicleWorkPlacement): boolean =>
  a.at.every((value, axis) => value === b.at[axis]) &&
  Boolean(a.mirror) === Boolean(b.mirror) &&
  a.supportedBy.length === b.supportedBy.length &&
  a.supportedBy.every((id) => b.supportedBy.includes(id));

export const validVehicleWorkPlacement = (value: unknown): value is VehicleWorkPlacement => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const placement = value as VehicleWorkPlacement;
  return (
    Array.isArray(placement.at) &&
    placement.at.length === 3 &&
    placement.at.every(Number.isFinite) &&
    (placement.mirror === undefined || placement.mirror === true) &&
    Array.isArray(placement.supportedBy) &&
    placement.supportedBy.every((id) => typeof id === 'string' && id !== '') &&
    new Set(placement.supportedBy).size === placement.supportedBy.length
  );
};

export const copyVehicleWorkPlacement = ({ at, mirror, supportedBy }: VehicleWorkPlacement): VehicleWorkPlacement => ({
  at: [...at],
  supportedBy: [...supportedBy],
  ...(mirror === undefined ? {} : { mirror }),
});

export type VehiclePlacement = Pick<VehicleFittingDef, 'id' | 'at' | 'mirror' | 'supportedBy'> & {
  service?: VehicleService | undefined;
  site?: VehicleSiteRef | undefined;
};

/**
 * A site's name, read from the part that provides it, so a reworded pack relabels saved vehicles and an occupant
 * leaving or changing does not rename its site. Factory and scratch sites resolve alike. A pure read: it takes
 * readonly inputs and changes nothing, so naming never materialises part state
 * (`packages/deadvox/docs/decisions/0011-lazy-part-state.md`, "Decision").
 */
export const vehicleSiteName = (registry: Registry, { provider, key, position }: Readonly<VehicleSiteRef>): string => {
  const names = registry.items.get(provider)?.vehicle?.sites?.[key];
  let name = typeof names === 'string' ? names : undefined;
  if (typeof names === 'object' && position !== undefined) {
    name = names[position];
  }
  if (name === undefined) {
    // Content and save validation admit only references that resolve (`vehicleBlueprint.ts`, `vehicleSitesIssues`).
    throw new Error(`Unresolved vehicle site ${provider}/${key}/${position ?? ''}`);
  }
  return name;
};

/**
 * A build's name. A factory build keeps its blueprint's name. Otherwise a build is what it is built on: its one root,
 * a fitting resting on nothing, names it by that part's item name. Several roots take the content's generic name,
 * which stands beneath a player-given name rather than being the final policy. A live build always has a part, so it
 * always has a name. A pure read, as `vehicleSiteName` is.
 */
export const vehicleName = (
  registry: Registry,
  {
    blueprint,
    fittings,
  }: {
    readonly blueprint?: string | undefined;
    readonly fittings: readonly Readonly<VehiclePlacement & { readonly item: Pick<Item, 'type'> }>[];
  },
): string => {
  if (blueprint !== undefined) {
    return registry.vehicleBlueprints.get(blueprint)!.name;
  }
  const roots = fittings.filter(({ supportedBy }) => supportedBy.length === 0);
  return roots.length === 1
    ? registry.items.get(roots[0]!.item.type)!.name
    : claimed(registry.ui, 'interface')!.screenText.vehicle.assembly;
};
interface VehicleBuild<Node> {
  /**
   * The factory blueprint this build started from, if any. The build stands on its own sites and fittings, so
   * geometry, collision and service never read the blueprint; a scratch-built frame has none.
   */
  readonly blueprint?: string;
  readonly placementKey: string;
  /** World anchor in blocks; fitting offsets stay in metres. */
  readonly origin: Vec3;
  readonly facing: Facing;
  readonly sites: VehiclePlacement[];
  readonly fittings: (VehiclePlacement & { readonly item: Node })[];
}
export interface VehicleInstancesState {
  nextId: number;
  instances: { id: number; vehicle: VehicleBuild<ItemState> }[];
  /** Placement keys of builds that ended, so registering their placement again does not rebuild them. */
  ended: string[];
}
export type VehicleInstance = VehicleBuild<Item>;

export const copyVehiclePlacement = ({
  id,
  at,
  mirror,
  supportedBy,
  service,
  site,
}: VehiclePlacement): VehiclePlacement => ({
  id,
  at: [...at],
  ...(mirror === undefined ? {} : { mirror }),
  ...(site === undefined ? {} : { site: { ...site } }),
  ...(service === undefined
    ? {}
    : {
        service: {
          mount: service.mount,
          durationSimSeconds: service.durationSimSeconds,
          qualities: { ...service.qualities },
        },
      }),
  supportedBy: [...supportedBy],
});

const validService = (service: VehiclePlacement['service']): boolean => {
  if (service === undefined) {
    return true;
  }
  return (
    Boolean(service.mount) &&
    Number.isFinite(service.durationSimSeconds) &&
    service.durationSimSeconds > 0 &&
    Object.entries(service.qualities).every(
      ([quality, level]) => Boolean(quality) && Number.isInteger(level) && level >= 1,
    )
  );
};

const validPlacement = (value: VehiclePlacement, ids: Set<string>): boolean =>
  Boolean(value.id) &&
  !ids.has(value.id) &&
  value.at.length === 3 &&
  value.at.every(Number.isFinite) &&
  (value.mirror === undefined || value.mirror) &&
  value.supportedBy.every(Boolean) &&
  new Set(value.supportedBy).size === value.supportedBy.length &&
  validService(value.service);

const assertPlacements = (values: readonly VehiclePlacement[]): void => {
  const ids = new Set<string>();
  for (const value of values) {
    if (!validPlacement(value, ids)) {
      throw new Error('Invalid or duplicate vehicle placement');
    }
    ids.add(value.id);
  }
  const issues = supportProblems(values);
  if (issues.length > 0) {
    throw new Error(`Invalid vehicle supports: ${issues.join('; ')}`);
  }
};

export const assertVehicleState = (state: VehicleInstancesState): void => {
  const store = new MapEntityStore<VehicleBuild<ItemState>>();
  store.restore(
    state.instances.map(({ id, vehicle }) => [id, vehicle]),
    state.nextId,
  );
  const ended = new Set(state.ended);
  if (ended.size !== state.ended.length || state.ended.some((key) => !key)) {
    throw new Error('Invalid ended vehicle placement keys');
  }
  const keys = new Set<string>();
  for (const { vehicle } of state.instances) {
    if (ended.has(vehicle.placementKey)) {
      throw new Error('A live vehicle build reuses an ended placement key');
    }
    if (
      !vehicle.placementKey ||
      vehicle.blueprint === '' ||
      keys.has(vehicle.placementKey) ||
      vehicle.origin.length !== 3 ||
      vehicle.origin.some((v) => !Number.isFinite(v)) ||
      !['n', 'e', 's', 'w'].includes(vehicle.facing)
    ) {
      throw new Error('Invalid vehicle identity or pose');
    }
    keys.add(vehicle.placementKey);
    assertPlacements(vehicle.sites);
    assertPlacements(vehicle.fittings);
  }
};

/** Geometry is a projection of the owned item, never a saved second part type or cargo size. */
const projectVehicleFitting = (registry: Registry, fitting: VehicleInstance['fittings'][number]) => {
  const { service: _service, ...placement } = copyVehiclePlacement(fitting);
  return placeFitting(registry, {
    ...placement,
    part: fitting.item.type,
    ...(fitting.item.cargo ? { cargo: [...fitting.item.cargo] } : {}),
  });
};

/** A build's sites under the same rule content is checked by (`vehicleBlueprint.ts`, `vehicleSitesIssues`). */
const assertSites = (registry: Registry, vehicle: VehicleInstance): void => {
  const fitted = new Map(vehicle.fittings.map(({ id, item }) => [id, item.type]));
  const [issue] = vehicleSitesIssues(registry, vehicle.sites, (support) => fitted.get(support));
  if (issue) {
    throw new Error(`Invalid vehicle site ${vehicle.sites[issue[0]]!.id}: ${issue[2]}`);
  }
};

const validateBuild = (registry: Registry, vehicle: VehicleInstance): void => {
  if (vehicle.blueprint !== undefined && !registry.vehicleBlueprints.has(vehicle.blueprint)) {
    throw new Error(`Unknown vehicle blueprint ${vehicle.blueprint}`);
  }
  if (vehicle.fittings.length === 0) {
    throw new Error('A vehicle build with no parts has ended');
  }
  assertSites(registry, vehicle);
  for (const { item } of vehicle.fittings) {
    if (item.count !== 1 || !registry.items.get(item.type)?.vehicle) {
      throw new Error('Invalid fitted vehicle item');
    }
    if (Boolean(registry.items.get(item.type)?.vehicle?.cargoSpace) !== Boolean(item.cargo)) {
      throw new Error('Invalid vehicle cargo size');
    }
  }
  const placed = vehicle.fittings.map((fitting) => projectVehicleFitting(registry, fitting));
  const cell = claimed(registry.inventory, 'player')!.cellMetres;
  for (const fitting of placed) {
    const issue = fitIssue(
      placed.filter((other) => other !== fitting),
      fitting,
      cell,
    );
    if (issue) {
      throw new Error(`Invalid vehicle cargo containment: ${issue}`);
    }
  }
};

export class VehicleInstances {
  private readonly store = new MapEntityStore<VehicleInstance>();
  private ended = new Set<string>();
  /** Changes with a build or pose replacement, so derived physical projections rebuild. */
  version = 0;

  get records(): IterableIterator<[number, VehicleInstance]> {
    return this.store.entries();
  }

  get(id: number): VehicleInstance | undefined {
    return this.store.get(id);
  }

  idForPlacementKey(key: string): number | undefined {
    for (const [id, vehicle] of this.records) {
      if (vehicle.placementKey === key) {
        return id;
      }
    }
    return undefined;
  }

  /** Whether the build placed under `key` ended; its placement then stays empty. */
  hasEnded(key: string): boolean {
    return this.ended.has(key);
  }

  add(registry: Registry, vehicle: VehicleInstance): number {
    if (this.idForPlacementKey(vehicle.placementKey) !== undefined || this.ended.has(vehicle.placementKey)) {
      throw new Error('Duplicate vehicle placement key');
    }
    validateBuild(registry, vehicle);
    assertVehicleState({ nextId: 2, instances: [{ id: 1, vehicle }], ended: [] });
    const id = this.store.add(vehicle);
    this.version += 1;
    return id;
  }

  /** Replaces one validated build without disturbing other instance identities or projections. */
  replace(registry: Registry, id: number, vehicle: VehicleInstance): void {
    if (!this.store.get(id)) {
      throw new Error(`Unknown vehicle ${id}`);
    }
    const sameKey = this.idForPlacementKey(vehicle.placementKey);
    if (sameKey !== undefined && sameKey !== id) {
      throw new Error('Duplicate vehicle placement key');
    }
    validateBuild(registry, vehicle);
    assertVehicleState({ nextId: 2, instances: [{ id: 1, vehicle }], ended: [] });
    if (!this.store.replace(id, vehicle)) {
      throw new Error(`Unknown vehicle ${id}`);
    }
    this.version += 1;
  }

  /**
   * Ends a build whose last part has left: an assembly is its parts, so with none left nothing remains to be the
   * vehicle. This holds for every build, whatever it started from. Its id is never reused, because the store's next
   * id only rises, and part state seeded from an assembly id (ADR 0011) must not pass to a later build. Its placement
   * key is kept, so registering the placement again does not rebuild it.
   */
  end(id: number): void {
    const vehicle = this.store.get(id);
    if (!(vehicle && this.store.remove(id))) {
      throw new Error(`Unknown vehicle ${id}`);
    }
    this.ended.add(vehicle.placementKey);
    this.version += 1;
  }

  snapshotState(foodAt?: number): Readonly<VehicleInstancesState> {
    return freezeSnapshot({
      nextId: this.store.nextId,
      instances: [...this.records].map(([id, vehicle]) => ({
        id,
        vehicle: {
          ...(vehicle.blueprint === undefined ? {} : { blueprint: vehicle.blueprint }),
          placementKey: vehicle.placementKey,
          origin: [...vehicle.origin],
          facing: vehicle.facing,
          sites: vehicle.sites.map(copyVehiclePlacement),
          fittings: vehicle.fittings.map((fitting) => ({
            ...copyVehiclePlacement(fitting),
            item: snapshotItem(fitting.item, foodAt),
          })),
        },
      })),
      ended: [...this.ended],
    });
  }

  restoreState(registry: Registry, state: VehicleInstancesState): void {
    assertVehicleState(state);
    const entries = state.instances.map(({ id, vehicle }): [number, VehicleInstance] => {
      const build = {
        ...vehicle,
        origin: [...vehicle.origin] as Vec3,
        sites: vehicle.sites.map(copyVehiclePlacement),
        fittings: vehicle.fittings.map((fitting) => ({
          ...copyVehiclePlacement(fitting),
          item: restoreItem(registry, fitting.item),
        })),
      };
      validateBuild(registry, build);
      return [id, build];
    });
    this.store.restore(entries, state.nextId);
    this.ended = new Set(state.ended);
    this.version += 1;
  }
}
