// Service work keeps item ownership in Inventory until its terminal atomic transfer.

import { coreMessage } from './coreText.ts';
import type { Inventory, Location, Target } from './inventory.ts';
import type { VehicleWorkHooks } from './longAction.ts';

export interface VehicleWorkOptions {
  /** Resolves the ordinary output owner when a removal completes. */
  output: () => Target;
  /** Available tool qualities are derived by the interaction/reach owner. */
  quality: (name: string) => number;
}

type WorkKind = 'install' | 'remove';
interface WorkTarget {
  vehicleId: number;
  fittingId: string;
  itemUid: number;
}

const sourceRefusal = (
  inventory: Inventory,
  kind: WorkKind,
  { vehicleId, fittingId, itemUid }: WorkTarget,
): string | undefined => {
  const item = inventory.itemByUid(itemUid);
  const location = item && inventory.locate(item);
  if (!(item && location) || (kind === 'install' && location.kind === 'vehicle')) {
    return coreMessage(inventory.registry, 'gone');
  }
  // Refused before work starts as well as at the transfer, so no work time is spent on a part that can't come off.
  if (
    kind === 'remove' &&
    inventory.vehicles.get(vehicleId)?.fittings.some(({ supportedBy }) => supportedBy.includes(fittingId))
  ) {
    return coreMessage(inventory.registry, 'partSupportsOthers');
  }
  if (kind === 'install' && !reachableSource(inventory, location)) {
    return coreMessage(inventory.registry, 'tooFar');
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

/** Why the selected site cannot take or give up this exact part, before tools are considered. */
const siteRefusal = (inventory: Inventory, { vehicleId, fittingId, itemUid }: WorkTarget): string | undefined => {
  const vehicle = inventory.vehicles.get(vehicleId);
  const site = vehicle?.sites.find(({ id }) => id === fittingId);
  const item = inventory.itemByUid(itemUid);
  if (!(vehicle && site?.service && item)) {
    return coreMessage(inventory.registry, 'gone');
  }
  if (!inventory.canReachVehicle(vehicle.origin)) {
    return coreMessage(inventory.registry, 'tooFar');
  }
  if (inventory.registry.items.get(item.type)?.vehicle?.mount !== site.service.mount) {
    return coreMessage(inventory.registry, 'partDoesNotFit');
  }
  return inventory.vehicleService(vehicleId, fittingId, itemUid)
    ? undefined
    : coreMessage(inventory.registry, 'partNeedsSupport');
};

const serviceRefusal = (inventory: Inventory, options: VehicleWorkOptions, target: WorkTarget): string | undefined => {
  const refusal = siteRefusal(inventory, target);
  if (refusal) {
    return refusal;
  }
  const service = inventory.vehicleService(target.vehicleId, target.fittingId, target.itemUid)!;
  const missing = Object.entries(service.qualities).find(([quality, level]) => options.quality(quality) < level);
  return missing ? coreMessage(inventory.registry, 'toolNotInReach', { quality: missing[0] }) : undefined;
};

/**
 * Native long-action hooks for one selected vehicle service operation. The descriptor itself
 * contains no output object or closure; see `longAction.ts`, `VehicleWorkHooks`.
 */
export const vehicleWorkHooks = (inventory: Inventory, options: VehicleWorkOptions): VehicleWorkHooks => {
  const validate = (kind: WorkKind, vehicleId: number, fittingId: string, itemUid: number) => {
    const target = { vehicleId, fittingId, itemUid };
    return serviceRefusal(inventory, options, target) ?? sourceRefusal(inventory, kind, target);
  };
  return {
    validate,
    finish: (kind, vehicleId, fittingId, itemUid) =>
      validate(kind, vehicleId, fittingId, itemUid) ??
      inventory.vehicleTransfer({
        kind,
        vehicleId,
        fittingId,
        itemUid,
        ...(kind === 'remove' ? { output: options.output() } : {}),
      }),
  };
};
