import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { createColumnSupply } from './columnSupply.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import { planVehicleRemovalPiles } from './furnitureMove.ts';
import type { Inventory, VehicleTransfer } from './inventory.ts';
import { projectVehicleParts, VehicleOccupancy } from './vehicleProjection.ts';

interface RemovalContext {
  readonly terrain: CanonicalTerrain;
  readonly supply: ReturnType<ReturnType<typeof createColumnSupply>['project']>;
  readonly blockSize: number;
  readonly feet: Vec3;
}

const expanded = Symbol('vehicle removal supply expanded');

const attemptRemoval = (context: RemovalContext, request: VehicleTransfer): string | undefined => {
  const { terrain, supply, blockSize, feet } = context;
  const { minCy, maxCy } = terrain.terrain.scale;
  const { revision } = supply;
  if (supply.readColumn(toChunk(feet[0]), toChunk(feet[2]))) {
    throw expanded;
  }
  const { inventory } = supply;
  const vehicle = inventory.vehicles.get(request.vehicleId);
  const fitting = vehicle?.fittings.find(
    (entry) => entry.id === request.fittingId && entry.item.uid === request.itemUid,
  );
  if (!(vehicle && fitting)) {
    return coreMessage(inventory.registry, 'gone');
  }
  const part = projectVehicleParts(inventory.registry, request.vehicleId, vehicle, blockSize).find(
    (entry) => entry.fittingId === request.fittingId,
  )!;
  const boxes = part.boxes.map(({ min, max }) => {
    const pos = min.map((value) => Math.floor(value / blockSize)) as Vec3;
    const size = max.map((value, axis) => Math.ceil(value / blockSize) - pos[axis]!) as Vec3;
    if (supply.read({ x0: pos[0], x1: pos[0] + size[0], z0: pos[2], z1: pos[2] + size[2] })) {
      throw expanded;
    }
    return { pos, size };
  });
  const after = inventory.project();
  const afterVehicle = after.vehicles.get(request.vehicleId)!;
  try {
    after.vehicles.replace(inventory.registry, request.vehicleId, {
      ...afterVehicle,
      fittings: afterVehicle.fittings.filter((entry) => entry.id !== fitting.id),
    });
  } catch {
    return coreMessage(inventory.registry, 'partSupportsOthers');
  }
  const occupancy = new VehicleOccupancy(inventory.registry, after.vehicles, blockSize);
  const plan = planVehicleRemovalPiles(
    {
      inventory,
      feet,
      minY: minCy * CHUNK,
      terrainSolid: (x, y, z) => {
        if (y < minCy * CHUNK || y >= (maxCy + 1) * CHUNK) {
          return false;
        }
        if (supply.readColumn(toChunk(x), toChunk(z))) {
          throw expanded;
        }
        return inventory.registry.blocks[terrain.getBlock(x, y, z)]!.solid || occupancy.isSolid(x, y, z);
      },
    },
    boxes,
    fitting.item,
  );
  if (!plan) {
    return coreMessage(inventory.registry, 'noRoom');
  }
  const output = plan.find(({ placed }) => placed.item.uid === request.itemUid)!;
  const apply = (live: Inventory): string | undefined => {
    const piled = new Map(
      [...live.piles.values()].flatMap(({ items }) => items.map((placed) => [placed.item.uid, placed])),
    );
    const moves = plan
      .filter(({ placed }) => placed.item.uid !== request.itemUid)
      .map((move) => {
        const placed = piled.get(move.placed.item.uid);
        if (!placed) {
          throw new Error('Missing admitted vehicle load');
        }
        return { ...move, placed };
      });
    live.shiftPiles(moves);
    return live.vehicleTransfer({
      ...request,
      output: { kind: 'pile', pos: output.to, at: output.at, reserved: true },
    });
  };
  const refusal = apply(inventory.project());
  if (refusal) {
    return refusal;
  }
  supply.publish(
    revision,
    (cx, cz) => terrain.ensureColumn(cx, cz),
    (live) => {
      if (apply(live)) {
        throw new Error('Admitted vehicle removal failed');
      }
    },
  );
  return undefined;
};

/** Player completion owns physical settling; the inventory transfer remains a mechanical primitive. */
export const completeVehicleRemoval = (context: RemovalContext, request: VehicleTransfer): string | undefined => {
  for (;;) {
    try {
      return attemptRemoval(context, request);
    } catch (error) {
      // Expansion rebuilds projected owners; incomplete touched terrain is not air and must abort before transfer.
      if (error !== expanded) {
        throw error;
      }
    }
  }
};
