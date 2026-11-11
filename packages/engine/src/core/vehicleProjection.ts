import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Item } from './items.ts';
import type { SkyBlocker } from './skylight.ts';
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

/** Facing north puts the vehicle frame's forward, +z, on world +x. */
const yawForFacing = (facing: VehicleInstance['facing']): number =>
  ({ n: Math.PI / 2, e: Math.PI, s: -Math.PI / 2, w: 0 })[facing];

/** A facing's yaw is a whole quarter turn, so its basis is exact and box edges stay on block boundaries. */
const turned = (yaw: number, [x, , z]: Vec3): [number, number] => {
  const [cos, sin] = [Math.round(Math.cos(yaw)), Math.round(Math.sin(yaw))];
  return [cos * x + sin * z, cos * z - sin * x];
};

const transformPoint = ({ position, yaw, mirror }: VehicleFittingTransform, [x, y, z]: Vec3): Vec3 => {
  const [worldX, worldZ] = turned(yaw, [mirror ? -x : x, y, z]);
  return [position[0] + worldX, position[1] + y, position[2] + worldZ];
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
  const [x, z] = turned(yaw, fitting.at);
  return {
    position: [
      vehicle.origin[0] * blockSize + x,
      vehicle.origin[1] * blockSize + fitting.at[1],
      vehicle.origin[2] * blockSize + z,
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

export const vehiclePartAt = (
  registry: Registry,
  vehicles: VehicleInstances,
  blockSize: number,
  cell: Readonly<Vec3>,
): VehiclePartProjection | undefined => {
  for (const [vehicleId, vehicle] of vehicles.records) {
    for (const part of projectVehicleParts(registry, vehicleId, vehicle, blockSize)) {
      if (
        part.boxes.some(({ min, max }) =>
          cell.every(
            (value, axis) => value >= Math.floor(min[axis]! / blockSize) && value < Math.ceil(max[axis]! / blockSize),
          ),
        )
      ) {
        return part;
      }
    }
  }
  return undefined;
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
  /** Each occupied cell's owners, and the largest share of the channel its parts stop there. */
  private readonly cells = new Map<string, { owners: Set<number>; strength: number }>();
  private seenVersion = -1;
  private runs: { version: number; boxes: readonly SkyBlocker[] } = { version: -1, boxes: [] };

  private readonly registry: Registry;
  private readonly vehicles: VehicleInstances;
  private readonly blockSize: number;
  private readonly channel: VehicleObstructionChannel | undefined;

  constructor(registry: Registry, vehicles: VehicleInstances, blockSize: number, channel?: VehicleObstructionChannel) {
    this.registry = registry;
    this.vehicles = vehicles;
    this.blockSize = blockSize;
    this.channel = channel;
  }

  /** The vehicle collection's revision, which every answer here follows. */
  get version(): number {
    return this.vehicles.version;
  }

  isSolid(x: number, y: number, z: number): boolean {
    this.rebuild();
    return this.cells.has(`${x},${y},${z}`);
  }

  /**
   * The occupied cells as vertical runs of one strength, one box per unbroken run in a column, in blocks; a run's
   * shade is the share of the channel its cells stop.
   */
  boxes(): readonly SkyBlocker[] {
    this.rebuild();
    if (this.runs.version !== this.seenVersion) {
      const columns = new Map<string, { y: number; strength: number }[]>();
      for (const [key, { strength }] of this.cells) {
        const [x, y, z] = key.split(',').map(Number) as Vec3;
        const column = `${x},${z}`;
        const heights = columns.get(column);
        if (heights) {
          heights.push({ y, strength });
        } else {
          columns.set(column, [{ y, strength }]);
        }
      }
      const boxes: SkyBlocker[] = [];
      for (const [column, heights] of columns) {
        const [x, z] = column.split(',').map(Number) as [number, number];
        heights.sort((a, b) => a.y - b.y);
        let start = 0;
        for (let at = 1; at <= heights.length; at++) {
          const [previous, next] = [heights[at - 1]!, heights[at]];
          if (next?.y !== previous.y + 1 || next.strength !== previous.strength) {
            boxes.push({
              min: [x, heights[start]!.y, z],
              max: [x + 1, previous.y + 1, z + 1],
              shade: previous.strength,
            });
            start = at;
          }
        }
      }
      this.runs = { version: this.seenVersion, boxes };
    }
    return this.runs.boxes;
  }

  /** Solid because of some vehicle other than this one, so a car's own body can be ignored without ignoring its neighbours. */
  isSolidExcept(vehicleId: number, x: number, y: number, z: number): boolean {
    this.rebuild();
    const owners = this.cells.get(`${x},${y},${z}`)?.owners;
    return owners !== undefined && [...owners].some((owner) => owner !== vehicleId);
  }

  /** Solid because of this vehicle, whatever else shares the cell. */
  isSolidFor(vehicleId: number, x: number, y: number, z: number): boolean {
    this.rebuild();
    return this.cells.get(`${x},${y},${z}`)?.owners.has(vehicleId) ?? false;
  }

  private rebuild(): void {
    if (this.seenVersion === this.vehicles.version) {
      return;
    }
    this.cells.clear();
    for (const [vehicleId, vehicle] of this.vehicles.records) {
      for (const part of projectVehicleParts(this.registry, vehicleId, vehicle, this.blockSize)) {
        const strength = this.shareOf(part);
        if (strength > 0) {
          this.claimCells(vehicleId, part.boxes, strength);
        }
      }
    }
    this.seenVersion = this.vehicles.version;
  }

  /** How much of the channel a part stops: all of it with no channel, its content share or flag otherwise. */
  shareOf(part: VehiclePartProjection): number {
    return this.channel ? Number(this.registry.items.get(part.item.type)?.vehicle?.obstruction[this.channel] ?? 0) : 1;
  }

  private claimCells(vehicleId: number, boxes: readonly ModelBox[], strength: number): void {
    for (const box of boxes) {
      for (const [x, y, z] of cellsOfBox(box, this.blockSize)) {
        const key = `${x},${y},${z}`;
        const cell = this.cells.get(key);
        if (cell) {
          cell.owners.add(vehicleId);
          cell.strength = Math.max(cell.strength, strength);
        } else {
          this.cells.set(key, { owners: new Set([vehicleId]), strength });
        }
      }
    }
  }
}
