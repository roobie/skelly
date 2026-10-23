import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Item } from './items.ts';
import { type PlacedFitting, placeFitting } from './vehicleBlueprint.ts';
import type { VehicleInstance } from './vehicleInstances.ts';

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
