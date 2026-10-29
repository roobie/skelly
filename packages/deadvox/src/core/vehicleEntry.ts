import type { PlayerState } from '../game/player.ts';
import { coreMessage } from './coreText.ts';
import type { Vec3 } from './coords.ts';
import type { Inventory } from './inventory.ts';
import type { VehicleWorkHooks } from './longAction.ts';
import { vehicleFittingPoint } from './vehicleProjection.ts';

export interface VehicleEntryOptions {
  blockSize: number;
  seated: () => PlayerState['seated'];
  /** Commits the pose and player-record reference together. */
  place: (position: Vec3, seated: PlayerState['seated']) => void;
  clear: (position: Vec3) => boolean;
  handsOnLadder: () => boolean;
}

export const vehicleEntryHooks = (inventory: Inventory, options: VehicleEntryOptions): VehicleWorkHooks => {
  const resolve = (vehicleId: number, fittingId: string, itemUid: number) => {
    const vehicle = inventory.vehicles.get(vehicleId);
    const fitting = vehicle?.fittings.find(({ id, item }) => id === fittingId && item.uid === itemUid);
    const seat = fitting && inventory.registry.items.get(fitting.item.type)?.vehicle?.seat;
    return vehicle && fitting && seat ? { vehicle, fitting, seat } : undefined;
  };
  const destination = (kind: 'enter' | 'exit', target: NonNullable<ReturnType<typeof resolve>>) => {
    const points = kind === 'enter' ? target.seat.entryCells : target.seat.exitCells;
    return points.map((point) => vehicleFittingPoint(target.vehicle, target.fitting, point, options.blockSize))
      .find(options.clear);
  };
  const validate: VehicleWorkHooks['validate'] = (kind, vehicleId, fittingId, itemUid) => {
    if (kind !== 'enter' && kind !== 'exit') return coreMessage(inventory.registry, 'gone');
    const target = resolve(vehicleId, fittingId, itemUid);
    if (!target) return coreMessage(inventory.registry, 'gone');
    const seated = options.seated();
    if (kind === 'enter' && (seated || options.handsOnLadder())) return coreMessage(inventory.registry, 'seatOccupied');
    if (kind === 'exit' && !(seated?.vehicleId === vehicleId && seated.fittingId === fittingId)) return coreMessage(inventory.registry, 'notSeated');
    if (!inventory.canReachVehicle(vehicleId)) return coreMessage(inventory.registry, 'tooFar');
    if (!destination(kind, target)) return coreMessage(inventory.registry, kind === 'enter' ? 'entryBlocked' : 'exitBlocked');
    return undefined;
  };
  return {
    validate,
    finish: (kind, vehicleId, fittingId, itemUid) => {
      const refusal = validate(kind, vehicleId, fittingId, itemUid);
      if (refusal) return refusal;
      if (kind !== 'enter' && kind !== 'exit') return coreMessage(inventory.registry, 'gone');
      const target = resolve(vehicleId, fittingId, itemUid)!;
      options.place(kind === 'enter'
        ? vehicleFittingPoint(target.vehicle, target.fitting, target.seat.position, options.blockSize)
        : destination(kind, target)!, kind === 'enter' ? { vehicleId, fittingId } : undefined);
      return undefined;
    },
  };
};
