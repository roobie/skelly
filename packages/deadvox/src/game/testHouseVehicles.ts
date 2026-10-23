import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { HOUSE_OFFSET } from './testHouse.ts';

export const testHouseVehiclePlacement = (floorMetres: number, blockSize: number) => ({
  blueprint: 'hatchback',
  placementKey: 'testHouse.parked-hatchback',
  origin: [HOUSE_OFFSET[0] - 4, floorMetres, HOUSE_OFFSET[1] - 4].map((value) => value / blockSize) as Vec3,
  facing: 'e' as const,
});

export const registerTestHouseVehicles = (
  inventory: Inventory,
  site: string,
  floorMetres: number,
  blockSize: number,
): number | undefined => {
  if (site !== 'testHouse') {
    return undefined;
  }
  return inventory.registerVehicle(testHouseVehiclePlacement(floorMetres, blockSize));
};
