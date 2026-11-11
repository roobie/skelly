import type { BlockEntities } from '../core/blockEntities.ts';
import { worldOpaque, worldSolid } from '../core/collision.ts';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { Inventory } from '../core/inventory.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { SkyBounds } from '../core/skylight.ts';
import { projectVehicleParts } from '../core/vehicleProjection.ts';
import type { World } from '../core/world.ts';

export const layoutVehiclePlacements = (registry: Registry, site: string, blockSize: number) =>
  (registry.layouts.get(site)?.vehicles ?? []).map(({ position, ...vehicle }) => ({
    ...vehicle,
    origin: position.map((value) => value / blockSize) as Vec3,
  }));

export const registerLayoutVehicles = (
  inventory: Inventory,
  registry: Registry,
  site: string,
  blockSize: number,
): void => {
  for (const placement of layoutVehiclePlacements(registry, site, blockSize)) {
    inventory.registerVehicle(placement);
  }
};

/**
 * Each parked vehicle's whole envelope in blocks, as a sky field box, so it shades wherever the layout parks it. A
 * vehicle with no parts blocks nothing and gets no box.
 */
export const layoutVehicleSkyBoxes = (registry: Registry, site: string, blockSize: number): SkyBounds[] => {
  const inventory = new Inventory(registry);
  registerLayoutVehicles(inventory, registry, site, blockSize);
  return [...inventory.vehicles.records].flatMap(([vehicleId, vehicle]) => {
    const boxes = projectVehicleParts(registry, vehicleId, vehicle, blockSize).flatMap((part) => part.boxes);
    if (boxes.length === 0) {
      return [];
    }
    const axes = [0, 1, 2] as const;
    return {
      min: axes.map((axis) => Math.floor(Math.min(...boxes.map((box) => box.min[axis])) / blockSize)) as Vec3,
      max: axes.map((axis) => Math.ceil(Math.max(...boxes.map((box) => box.max[axis])) / blockSize)) as Vec3,
    };
  });
};

/**
 * Solid and sight queries that count the site's parked vehicles, for callers that run without a session
 * (benchmarks): a session derives the same rule from its own inventory, so both agree on where a vehicle stands.
 */
export const layoutVehicleQueries = ({
  world,
  registry,
  entities,
  site,
  blockSize,
}: {
  world: World;
  registry: Registry;
  entities: BlockEntities;
  site: string;
  blockSize: number;
}): { isSolid: SolidAt; isOpaque: SolidAt } => {
  const inventory = new Inventory(registry, undefined, entities);
  registerLayoutVehicles(inventory, registry, site, blockSize);
  const { vehicles } = inventory;
  return {
    isSolid: worldSolid(world, registry, entities, { vehicles, blockSize }),
    isOpaque: worldOpaque(world, registry, entities, { vehicles, blockSize }),
  };
};
