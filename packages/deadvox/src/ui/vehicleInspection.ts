import type { Inventory } from '../core/inventory.ts';

/** A read-only inspection command anchors every displayed service location to its live instance. */
interface VehicleInspectionCommand {
  readonly kind: 'vehicle.inspect';
  readonly vehicleId: number;
  readonly siteId: string;
}

interface VehicleInspectionSiteViewModel {
  readonly id: string;
  readonly itemUid: number | undefined;
  readonly command: VehicleInspectionCommand;
}

export interface VehicleInspectionViewModel {
  readonly vehicleId: number;
  readonly sites: readonly VehicleInspectionSiteViewModel[];
}

/**
 * The inspection surface reads sites from the live build, including vacant ones. It only
 * identifies selections in this package; installation and removal own mutations later.
 */
export const vehicleInspectionViewModel = (
  inventory: Pick<Inventory, 'vehicles'>,
  vehicleId: number,
): VehicleInspectionViewModel | undefined => {
  const vehicle = inventory.vehicles.get(vehicleId);
  if (!vehicle) {
    return undefined;
  }
  return {
    vehicleId,
    sites: vehicle.sites.map((site) => {
      const fitting = vehicle.fittings.find((candidate) => candidate.id === site.id);
      return {
        id: site.id,
        itemUid: fitting?.item.uid,
        command: { kind: 'vehicle.inspect', vehicleId, siteId: site.id },
      };
    }),
  };
};
