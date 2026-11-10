import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';

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
