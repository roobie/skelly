import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Item } from './items.ts';
import { type PlacedFitting, placeFitting } from './vehicleBlueprint.ts';
import type { VehicleInstance, VehicleInstances } from './vehicleInstances.ts';

interface VehicleFittingTransform {
  /** The fitting model's origin in world metres. */
  readonly position: Vec3;
  /** Rotation about world up, from the content vehicle frame. */
  readonly yaw: number;
  /** Content reflection remains a reflection after the vehicle turns. */
  readonly mirror: boolean;
}

export interface VehiclePartProjection {
  readonly vehicleId: number;
  readonly fittingId: string;
  readonly item: Item;
  readonly model: string | undefined;
  readonly transform: VehicleFittingTransform;
  /** Baked collision boxes in world metres; render, picking and later blockers share these. */
  readonly boxes: readonly ModelBox[];
}

const yawForFacing = (facing: VehicleInstance['facing']): number =>
  ({ n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 })[facing];

const transformPoint = ({ position, yaw, mirror }: VehicleFittingTransform, [x, y, z]: Vec3): Vec3 => {
  const localZ = mirror ? -z : z;
  return [
    position[0] + Math.cos(yaw) * x + Math.sin(yaw) * localZ,
    position[1] + y,
    position[2] - Math.sin(yaw) * x + Math.cos(yaw) * localZ,
  ];
};

const transformBox = (transform: VehicleFittingTransform, { min, max }: ModelBox): ModelBox => {
  const corners = [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
  ] as const satisfies readonly Vec3[];
  const points = corners.map((point) => transformPoint(transform, point));
  return {
    min: [
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
      Math.min(...points.map((point) => point[2])),
    ],
    max: [
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])),
      Math.max(...points.map((point) => point[2])),
    ],
  };
};

/** The one placement contract for occupied part render models, pick boxes and spatial consumers. */
const vehicleFittingTransform = (
  vehicle: VehicleInstance,
  fitting: Pick<VehicleInstance['fittings'][number], 'at' | 'mirror'>,
  blockSize: number,
): VehicleFittingTransform => {
  const yaw = yawForFacing(vehicle.facing);
  return {
    position: [
      vehicle.origin[0] * blockSize + Math.cos(yaw) * fitting.at[0] + Math.sin(yaw) * fitting.at[2],
      vehicle.origin[1] * blockSize + fitting.at[1],
      vehicle.origin[2] * blockSize - Math.sin(yaw) * fitting.at[0] + Math.cos(yaw) * fitting.at[2],
    ],
    yaw,
    mirror: fitting.mirror === true,
  };
};

/** Projects only occupied fittings: vacant service sites have neither a model nor a part pick shape. */
export const projectVehicleParts = (
  registry: Registry,
  vehicleId: number,
  vehicle: VehicleInstance,
  blockSize: number,
): readonly VehiclePartProjection[] =>
  vehicle.fittings.map((fitting) => {
    const placed: PlacedFitting = placeFitting(registry, {
      id: fitting.id,
      at: fitting.at,
      ...(fitting.mirror ? { mirror: true } : {}),
      supportedBy: fitting.supportedBy,
      part: fitting.item.type,
      ...(fitting.item.cargo ? { cargo: fitting.item.cargo } : {}),
    });
    const transform = vehicleFittingTransform(vehicle, fitting, blockSize);
    const frame: VehicleFittingTransform = {
      position: vehicle.origin.map((value) => value * blockSize) as Vec3,
      yaw: yawForFacing(vehicle.facing),
      mirror: false,
    };
    return {
      vehicleId,
      fittingId: fitting.id,
      item: fitting.item,
      model: registry.items.get(fitting.item.type)?.model,
      transform,
      boxes: placed.collision.map((box) => transformBox(frame, box)),
    };
  });

const cellsOfBox = function* ({ min, max }: ModelBox, blockSize: number): IterableIterator<Vec3> {
  for (let y = Math.floor(min[1] / blockSize); y < Math.ceil(max[1] / blockSize); y += 1) {
    for (let z = Math.floor(min[2] / blockSize); z < Math.ceil(max[2] / blockSize); z += 1) {
      for (let x = Math.floor(min[0] / blockSize); x < Math.ceil(max[0] / blockSize); x += 1) {
        yield [x, y, z];
      }
    }
  }
};

/** Physical cells derived from the same occupied fitting boxes as rendering and picking. */
export function* vehicleCells(
  registry: Registry,
  vehicles: VehicleInstances,
  blockSize: number,
): IterableIterator<Vec3> {
  for (const [vehicleId, vehicle] of vehicles.records) {
    for (const { boxes } of projectVehicleParts(registry, vehicleId, vehicle, blockSize)) {
      for (const box of boxes) {
        yield* cellsOfBox(box, blockSize);
      }
    }
  }
}

/** Derived physical cells from the same occupied fitting boxes as rendering and picking. */
export type VehicleObstructionChannel = 'sight' | 'light' | 'sound' | 'combat';

/** A warmed cell query over one channel; its key is the collection revision, never a stale part snapshot. */
export class VehicleOccupancy {
  private readonly cells = new Set<string>();
  private seenVersion = -1;

  private readonly registry: Registry;
  private readonly vehicles: VehicleInstances;
  private readonly blockSize: number;
  private readonly channel: VehicleObstructionChannel | undefined;

  constructor(
    registry: Registry,
    vehicles: VehicleInstances,
    blockSize: number,
    channel?: VehicleObstructionChannel,
  ) {
    this.registry = registry;
    this.vehicles = vehicles;
    this.blockSize = blockSize;
    this.channel = channel;
  }

  isSolid(x: number, y: number, z: number): boolean {
    this.rebuild();
    return this.cells.has(`${x},${y},${z}`);
  }

  private rebuild(): void {
    if (this.seenVersion === this.vehicles.version) {
      return;
    }
    this.cells.clear();
    for (const [vehicleId, vehicle] of this.vehicles.records) {
      for (const part of projectVehicleParts(this.registry, vehicleId, vehicle, this.blockSize)) {
        if (this.channel && !this.registry.items.get(part.item.type)?.vehicle?.obstruction[this.channel]) {
          continue;
        }
        for (const box of part.boxes) {
          for (const [x, y, z] of cellsOfBox(box, this.blockSize)) {
            this.cells.add(`${x},${y},${z}`);
          }
        }
      }
    }
    this.seenVersion = this.vehicles.version;
  }
}
