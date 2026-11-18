import type { ModelBox } from '@skelly/thing-core/schema';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { vehicleOpeningPlan } from '../core/vehicleOpening.ts';
import type { VehicleParts } from '../core/vehicleParts.ts';
import { type DoorActionOptions, heardSwing } from './doorAction.ts';

export const VEHICLE_PART_ACTION = 'vehicle.part';

export interface VehiclePartActionOptions {
  readonly queue: HandlingQueue;
  readonly inventory: Inventory;
  readonly parts: Pick<VehicleParts, 'all'>;
  readonly playWorldSound: DoorActionOptions['playWorldSound'];
}

/** The middle of a part's boxes in world metres, where it is heard. */
const centreOf = (boxes: readonly ModelBox[]): Vec3 =>
  [0, 1, 2].map(
    (axis) => (Math.min(...boxes.map(({ min }) => min[axis]!)) + Math.max(...boxes.map(({ max }) => max[axis]!))) / 2,
  ) as Vec3;

/**
 * Opens or shuts one vehicle part once its handling is done, replanning it as the router did, so a part that left or
 * fell out of reach meanwhile refuses. Nothing on a parked vehicle stops a part shutting, so nothing else can.
 */
export const registerVehiclePartAction = ({
  queue,
  inventory,
  parts,
  playWorldSound,
}: VehiclePartActionOptions): void => {
  queue.registerAction(VEHICLE_PART_ACTION, (params) => {
    const { vehicleId, fittingId } = params;
    if (typeof vehicleId !== 'number' || !Number.isSafeInteger(vehicleId) || typeof fittingId !== 'string') {
      throw new Error('Invalid vehicle part target');
    }
    const plan = vehicleOpeningPlan(inventory, vehicleId, fittingId);
    if (!plan.ok) {
      return plan.reason;
    }
    // Where the part stands at rest, as its sound is placed before it moves.
    const at = centreOf(
      parts.all().find((part) => part.vehicleId === vehicleId && part.fittingId === fittingId)!.boxes,
    );
    inventory.vehicles.setOpen(inventory.registry, vehicleId, fittingId, plan.opening);
    return heardSwing(playWorldSound, at, { sound: plan.sound });
  });
};
