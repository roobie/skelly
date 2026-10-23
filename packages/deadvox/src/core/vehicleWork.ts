// Service work keeps item ownership in Inventory until its terminal atomic transfer.

import type { Inventory, Location, Target } from './inventory.ts';
import type { VehicleWorkHooks } from './longAction.ts';

export interface VehicleWorkOptions {
  /** The ordinary output owner selected by the caller for a removal. */
  output: Target;
  /** Available tool qualities are derived by the interaction/reach owner. */
  quality: (name: string) => number;
}

type WorkKind = 'install' | 'remove';
interface WorkTarget {
  vehicleId: number;
  fittingId: string;
  itemUid: number;
}

const sourceRefusal = (inventory: Inventory, kind: WorkKind, itemUid: number): string | undefined => {
  const item = inventory.itemByUid(itemUid);
  const location = item && inventory.locate(item);
  if (!(item && location) || (kind === 'install' && location.kind === 'vehicle')) {
    return 'Vehicle service source changed';
  }
  if (kind === 'install' && !reachableSource(inventory, location)) {
    return 'Vehicle service source changed';
  }
  return undefined;
};

const reachableSource = (inventory: Inventory, location: Location): boolean => {
  const place = inventory.placeOf(location);
  if (place?.kind === 'vehicle') {
    return inventory.canReachVehicle(place.origin);
  }
  return place?.kind !== 'pile' || inventory.canReach(place.pile.pos);
};

const serviceRefusal = (
  inventory: Inventory,
  options: VehicleWorkOptions,
  { vehicleId, fittingId, itemUid }: WorkTarget,
): string | undefined => {
  const service = inventory.vehicleService(vehicleId, fittingId, itemUid);
  const vehicle = inventory.vehicles.get(vehicleId);
  if (!(service && vehicle && inventory.canReachVehicle(vehicle.origin))) {
    return 'Vehicle service target is unavailable';
  }
  if (Object.entries(service.qualities).some(([quality, level]) => options.quality(quality) < level)) {
    return 'Required tool is unavailable';
  }
  return undefined;
};

/**
 * Native long-action hooks for one selected vehicle service operation. The descriptor itself
 * contains no output object or closure; see `longAction.ts`, `VehicleWorkHooks`.
 */
export const vehicleWorkHooks = (inventory: Inventory, options: VehicleWorkOptions): VehicleWorkHooks => {
  const validate = (kind: WorkKind, vehicleId: number, fittingId: string, itemUid: number) =>
    serviceRefusal(inventory, options, { vehicleId, fittingId, itemUid }) ?? sourceRefusal(inventory, kind, itemUid);
  return {
    validate,
    finish: (kind, vehicleId, fittingId, itemUid) =>
      validate(kind, vehicleId, fittingId, itemUid) ??
      inventory.vehicleTransfer({ kind, vehicleId, fittingId, itemUid, output: options.output }),
  };
};
