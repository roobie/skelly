import { supportProblems } from '../vehicles/model.ts';
import { fitIssue } from './cargoSpace.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import { MapEntityStore } from './entities.ts';
import { type Item, type ItemState, restoreItem, snapshotItem } from './items.ts';
import type { VehicleFittingDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { Facing } from './templates.ts';
import { placeFitting } from './vehicleBlueprint.ts';

export type VehiclePlacement = Pick<VehicleFittingDef, 'id' | 'at' | 'mirror' | 'supportedBy' | 'service'>;
interface VehicleBuild<Node> {
  readonly blueprint: string;
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
}
export type VehicleInstance = VehicleBuild<Item>;

export const copyVehiclePlacement = ({ id, at, mirror, supportedBy, service }: VehiclePlacement): VehiclePlacement => ({
  id,
  at: [...at],
  ...(mirror === undefined ? {} : { mirror }),
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

const assertPlacements = (values: readonly VehiclePlacement[]): void => {
  const ids = new Set<string>();
  for (const value of values) {
    if (
      !value.id ||
      ids.has(value.id) ||
      value.at.length !== 3 ||
      value.at.some((v) => !Number.isFinite(v)) ||
      (value.mirror !== undefined && value.mirror !== true) ||
      value.supportedBy.some((id) => !id) ||
      new Set(value.supportedBy).size !== value.supportedBy.length ||
      (value.service !== undefined &&
        (!value.service.mount ||
          !Number.isFinite(value.service.durationSimSeconds) ||
          value.service.durationSimSeconds <= 0 ||
          Object.entries(value.service.qualities).some(
            ([quality, level]) => !quality || !Number.isInteger(level) || level < 1,
          )))
    ) {
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
  const keys = new Set<string>();
  for (const { vehicle } of state.instances) {
    if (
      !(vehicle.blueprint && vehicle.placementKey) ||
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
const projectVehicleFitting = (registry: Registry, fitting: VehicleInstance['fittings'][number]) =>
  placeFitting(registry, {
    ...copyVehiclePlacement(fitting),
    part: fitting.item.type,
    ...(fitting.item.cargo ? { cargo: [...fitting.item.cargo] } : {}),
  });

const validateBuild = (registry: Registry, vehicle: VehicleInstance): void => {
  if (!registry.vehicleBlueprints.has(vehicle.blueprint)) {
    throw new Error(`Unknown vehicle blueprint ${vehicle.blueprint}`);
  }
  for (const { item } of vehicle.fittings) {
    if (item.count !== 1 || !registry.items.get(item.type)?.vehicle) {
      throw new Error('Invalid fitted vehicle item');
    }
    if (Boolean(registry.items.get(item.type)?.vehicle?.cargoSpace) !== Boolean(item.cargo)) {
      throw new Error('Invalid vehicle cargo size');
    }
  }
  const placed = vehicle.fittings.map((fitting) => projectVehicleFitting(registry, fitting));
  const cell = registry.inventory.get(CORE_CONTENT_IDS.player)!.cellMetres;
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

  add(registry: Registry, vehicle: VehicleInstance): number {
    if (this.idForPlacementKey(vehicle.placementKey) !== undefined) {
      throw new Error('Duplicate vehicle placement key');
    }
    validateBuild(registry, vehicle);
    assertVehicleState({ nextId: 2, instances: [{ id: 1, vehicle }] });
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
    assertVehicleState({ nextId: 2, instances: [{ id: 1, vehicle }] });
    if (!this.store.replace(id, vehicle)) {
      throw new Error(`Unknown vehicle ${id}`);
    }
    this.version += 1;
  }

  snapshotState(): Readonly<VehicleInstancesState> {
    return freezeSnapshot({
      nextId: this.store.nextId,
      instances: [...this.records].map(([id, vehicle]) => ({
        id,
        vehicle: {
          blueprint: vehicle.blueprint,
          placementKey: vehicle.placementKey,
          origin: [...vehicle.origin],
          facing: vehicle.facing,
          sites: vehicle.sites.map(copyVehiclePlacement),
          fittings: vehicle.fittings.map((fitting) => ({
            ...copyVehiclePlacement(fitting),
            item: snapshotItem(fitting.item),
          })),
        },
      })),
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
    this.version += 1;
  }
}
