// Service work keeps item ownership in Inventory until its terminal atomic transfer.

import { coreMessage } from './coreText.ts';
import type { Inventory, Location, Target } from './inventory.ts';
import type { VehicleWorkHooks } from './longAction.ts';
import {
  sameVehiclePlacement,
  type VehicleWorkPlacement,
  type VehicleWorkTarget,
  validVehicleWorkPlacement,
} from './vehicleInstances.ts';

export interface VehicleWorkOptions {
  /** Resolves the ordinary output owner when a removal completes. */
  output: () => Target;
  /** Available tool qualities are derived by the interaction/reach owner. */
  quality: (name: string) => number;
}

type WorkKind = 'install' | 'remove';
interface WorkTarget {
  placement: VehicleWorkPlacement;
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
    return inventory.canReachVehicle(place.vehicleId);
  }
  return place?.kind !== 'pile' || inventory.canReach(place.pile.pos);
};

/** Why the selected site cannot take or give up this exact part, before tools are considered. */
const siteRefusal = (
  inventory: Inventory,
  { vehicleId, fittingId, itemUid, placement }: WorkTarget,
): string | undefined => {
  const vehicle = inventory.vehicles.get(vehicleId);
  const site = vehicle?.sites.find(({ id }) => id === fittingId);
  const item = inventory.itemByUid(itemUid);
  if (!(vehicle && site?.service && item)) {
    return coreMessage(inventory.registry, 'gone');
  }
  if (!inventory.canReachVehicle(vehicleId)) {
    return coreMessage(inventory.registry, 'tooFar');
  }
  if (
    !(validVehicleWorkPlacement(placement) && sameVehiclePlacement(site, placement)) ||
    inventory.registry.items.get(item.type)?.vehicle?.mount !== site.service.mount
  ) {
    return coreMessage(inventory.registry, 'partDoesNotFit');
  }
  return inventory.vehiclePlacementService(vehicleId, { ...placement, id: fittingId }, itemUid)
    ? undefined
    : coreMessage(inventory.registry, 'partNeedsSupport');
};

const serviceRefusal = (inventory: Inventory, options: VehicleWorkOptions, target: WorkTarget): string | undefined => {
  const refusal = siteRefusal(inventory, target);
  if (refusal) {
    return refusal;
  }
  const service = inventory.vehiclePlacementService(
    target.vehicleId,
    { ...target.placement, id: target.fittingId },
    target.itemUid,
  )!;
  const missing = Object.entries(service.qualities).find(([quality, level]) => options.quality(quality) < level);
  return missing ? coreMessage(inventory.registry, 'toolNotInReach', { quality: missing[0] }) : undefined;
};

/**
 * Native long-action hooks for one selected vehicle service operation. The descriptor itself
 * contains no output object or closure; see `longAction.ts`, `VehicleWorkHooks`.
 */
export const vehicleWorkHooks = (inventory: Inventory, options: VehicleWorkOptions): VehicleWorkHooks => {
  const validate = (kind: WorkKind, vehicleId: number, placement: VehicleWorkTarget, itemUid: number) => {
    const target = { vehicleId, fittingId: placement.id, itemUid, placement };
    return serviceRefusal(inventory, options, target) ?? sourceRefusal(inventory, kind, target);
  };
  return {
    validate,
    finish: (kind, vehicleId, placement, itemUid) =>
      validate(kind, vehicleId, placement, itemUid) ??
      inventory.vehicleTransfer({
        kind,
        vehicleId,
        fittingId: placement.id,
        itemUid,
        placement,
        ...(kind === 'remove' ? { output: options.output() } : {}),
      }),
  };
};
