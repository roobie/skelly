import type { ModelBox } from '@skelly/thing-core/schema';
import { actionText } from '../core/actionText.ts';
import { bodyInTheWay } from '../core/blockEntities.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { bodyOverlapsBlock } from '../core/physics.ts';
import { vehicleOpeningPlan } from '../core/vehicleOpening.ts';
import type { VehicleParts } from '../core/vehicleParts.ts';
import { vehiclePartCellsAt, vehiclePartSwing } from '../core/vehicleProjection.ts';
import { type DoorActionOptions, heardSwing } from './doorAction.ts';

export const VEHICLE_PART_ACTION = 'vehicle.part';

export interface VehiclePartActionOptions extends Pick<DoorActionOptions, 'player' | 'others' | 'playWorldSound'> {
  readonly queue: HandlingQueue;
  readonly inventory: Inventory;
  readonly parts: Pick<VehicleParts, 'all'>;
  readonly blockSize: number;
  /** What a swing meets: terrain, walls and furniture, and every vehicle but the one whose part swings. */
  readonly solidExceptVehicle: (vehicleId: number, x: number, y: number, z: number) => boolean;
}

/** The middle of a part's boxes in world metres, where it is heard. */
const centreOf = (boxes: readonly ModelBox[]): Vec3 =>
  [0, 1, 2].map(
    (axis) => (Math.min(...boxes.map(({ min }) => min[axis]!)) + Math.max(...boxes.map(({ max }) => max[axis]!))) / 2,
  ) as Vec3;

/**
 * Opens or shuts one vehicle part once its handling is done, replanning it as the router did, so a part that left or
 * fell out of reach meanwhile refuses. Opening sweeps the swing and refuses on anything it meets; shutting refuses
 * while a body stands where the shut part goes, as a building's door does.
 */
export const registerVehiclePartAction = ({
  queue,
  inventory,
  parts,
  blockSize,
  solidExceptVehicle,
  player,
  others,
  playWorldSound,
}: VehiclePartActionOptions): void => {
  const inTheWay = (vehicleId: number, fittingId: string, opening: boolean): 'player' | 'other' | undefined => {
    const vehicle = inventory.vehicles.get(vehicleId)!;
    const cells = opening
      ? vehiclePartSwing(inventory.registry, vehicle, blockSize, fittingId)
      : vehiclePartCellsAt(inventory.registry, vehicle, blockSize, { fittingId, clock: 0 });
    const body = bodyInTheWay(
      (standing) => cells.some((cell) => bodyOverlapsBlock(standing, cell)),
      player(),
      others(),
    );
    const struck = opening && cells.some(([x, y, z]) => solidExceptVehicle(vehicleId, x, y, z));
    return body ?? (struck ? 'other' : undefined);
  };
  queue.registerAction(VEHICLE_PART_ACTION, (params) => {
    const { vehicleId, fittingId } = params;
    if (typeof vehicleId !== 'number' || !Number.isSafeInteger(vehicleId) || typeof fittingId !== 'string') {
      throw new Error('Invalid vehicle part target');
    }
    const plan = vehicleOpeningPlan(inventory, vehicleId, fittingId);
    if (!plan.ok) {
      return plan.reason;
    }
    // Heard where the part stands before it moves.
    const at = centreOf(
      parts.all().find((part) => part.vehicleId === vehicleId && part.fittingId === fittingId)!.boxes,
    );
    const blocker = inTheWay(vehicleId, fittingId, plan.opening);
    if (blocker) {
      return heardSwing(playWorldSound, at, { refusal: actionText(inventory.registry).vehicleParts.inTheWay[blocker] });
    }
    inventory.vehicles.setOpen(inventory.registry, vehicleId, fittingId, plan.opening);
    return heardSwing(playWorldSound, at, { sound: plan.sound });
  });
};
