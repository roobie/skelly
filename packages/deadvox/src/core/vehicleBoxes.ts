import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type Body, type BodyShape, bodyOverlapsTerrain } from './physics.ts';
import { type RayHit, raycast, type SolidAt } from './raycast.ts';
import type { VehicleInstances } from './vehicleInstances.ts';
import { projectVehicleParts, type VehicleObstructionChannel } from './vehicleProjection.ts';

const overlaps = (a: ModelBox, b: ModelBox): boolean => a.min.every((v, i) => v < b.max[i]! && a.max[i]! > b.min[i]!);
const bodyBox = (body: Body, pos: Vec3, height = body.height): ModelBox => ({
  min: [pos[0] - body.halfWidth, pos[1], pos[2] - (body.halfDepth ?? body.halfWidth)],
  max: [pos[0] + body.halfWidth, pos[1] + height, pos[2] + (body.halfDepth ?? body.halfWidth)],
});

const boxRayHit = (box: ModelBox, origin: Vec3, direction: Vec3, distance: number): RayHit | undefined => {
  let enter = 0;
  let exit = distance;
  let normal: Vec3 = [0, 0, 0];
  for (const axis of [0, 1, 2] as const) {
    const d = direction[axis];
    if (d === 0) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) {
        return undefined;
      }
      continue;
    }
    const a = (box.min[axis] - origin[axis]) / d;
    const b = (box.max[axis] - origin[axis]) / d;
    if (Math.min(a, b) > enter) {
      enter = Math.min(a, b);
      normal = [0, 0, 0];
      normal[axis] = -Math.sign(d);
    }
    exit = Math.min(exit, Math.max(a, b));
  }
  if (exit < enter) {
    return undefined;
  }
  const point = origin.map((v, i) => v + direction[i]! * enter) as Vec3;
  return { distance: enter, normal, block: point.map(Math.floor) as Vec3 };
};

/** Experimental parked queries in block units. Buckets nominate boxes, never decide a collision. */
export class VehicleBoxes {
  private version = -1;
  private readonly buckets = new Map<string, ModelBox[]>();
  private readonly bucketSize = 8;

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

  private keys(box: ModelBox): string[] {
    const keys: string[] = [];
    for (let y = Math.floor(box.min[1] / this.bucketSize); y <= Math.floor(box.max[1] / this.bucketSize); y++) {
      for (let z = Math.floor(box.min[2] / this.bucketSize); z <= Math.floor(box.max[2] / this.bucketSize); z++) {
        for (let x = Math.floor(box.min[0] / this.bucketSize); x <= Math.floor(box.max[0] / this.bucketSize); x++) {
          keys.push(`${x},${y},${z}`);
        }
      }
    }
    return keys;
  }

  private blocks(itemType: string): boolean {
    return !this.channel || this.registry.items.get(itemType)?.vehicle?.obstruction[this.channel] === true;
  }

  private rebuild(): void {
    if (this.version === this.vehicles.version) {
      return;
    }
    this.buckets.clear();
    for (const [id, vehicle] of this.vehicles.records) {
      for (const part of projectVehicleParts(this.registry, id, vehicle, this.blockSize)) {
        if (!this.blocks(part.item.type)) {
          continue;
        }
        for (const source of part.boxes) {
          const box = {
            min: source.min.map((v) => v / this.blockSize) as Vec3,
            max: source.max.map((v) => v / this.blockSize) as Vec3,
          };
          for (const key of this.keys(box)) {
            const bucket = this.buckets.get(key) ?? [];
            bucket.push(box);
            this.buckets.set(key, bucket);
          }
        }
      }
    }
    this.version = this.vehicles.version;
  }

  private candidates(box: ModelBox): Set<ModelBox> {
    this.rebuild();
    const result = new Set<ModelBox>();
    for (const key of this.keys(box)) {
      for (const candidate of this.buckets.get(key) ?? []) {
        result.add(candidate);
      }
    }
    return result;
  }

  overlaps(box: ModelBox): boolean {
    for (const candidate of this.candidates(box)) {
      if (overlaps(box, candidate)) {
        return true;
      }
    }
    return false;
  }

  contains(point: Vec3): boolean {
    for (const box of this.candidates({ min: point, max: point })) {
      if (point.every((v, i) => v >= box.min[i]! && v < box.max[i]!)) {
        return true;
      }
    }
    return false;
  }

  ray(origin: Vec3, direction: Vec3, distance: number, terrain: SolidAt): RayHit | undefined {
    let nearest = raycast(origin, direction, distance, terrain);
    const end = origin.map((v, i) => v + direction[i]! * distance) as Vec3;
    const bounds = {
      min: origin.map((v, i) => Math.min(v, end[i]!)) as Vec3,
      max: origin.map((v, i) => Math.max(v, end[i]!)) as Vec3,
    };
    for (const box of this.candidates(bounds)) {
      const hit = boxRayHit(box, origin, direction, nearest?.distance ?? distance);
      if (hit && (!nearest || hit.distance < nearest.distance)) {
        nearest = hit;
      }
    }
    return nearest;
  }

  /** Reuses the existing shape contact search; an existing actor shape remains exact against part boxes. */
  shape(body: Body, terrain: SolidAt, base?: BodyShape): BodyShape {
    const test = (pos: Vec3, height: number): boolean => {
      const box = bodyBox(body, pos, height);
      const terrainHit = base
        ? base.overlapsTerrainBelow(pos, height)
        : bodyOverlapsTerrain({ ...body, pos, height }, terrain);
      if (terrainHit) {
        return true;
      }
      for (const candidate of this.candidates(box)) {
        if (overlaps(box, candidate) && (!base || base.overlapsBox(pos, [...candidate.min], [...candidate.max]))) {
          return true;
        }
      }
      return false;
    };
    return {
      overlapsTerrain: (pos) => test(pos, body.height),
      overlapsTerrainBelow: test,
      overlapsBox: (pos, min, max) =>
        base ? base.overlapsBox(pos, min, max) : overlaps(bodyBox(body, pos), { min, max }),
    };
  }
}

export const vehicleBoxSpikeEnabled = (debug: boolean, search: string): boolean =>
  debug && new URLSearchParams(search).get('vehicle-boxes') === '1';

export const vehicleBoxSpikeQueries = ({
  enabled,
  registry,
  vehicles,
  blockSize,
  terrain,
  coarse,
}: {
  enabled: boolean | undefined;
  registry: Registry;
  vehicles: VehicleInstances;
  blockSize: number;
  terrain: SolidAt;
  coarse: SolidAt;
}) => {
  if (!enabled) {
    return {
      vehicleBoxes: undefined,
      movementSolid: coarse,
      physicalRay: (origin: Vec3, direction: Vec3, distance: number) => raycast(origin, direction, distance, coarse),
      throwSampleSolid: undefined,
    };
  }
  const vehicleBoxes = new VehicleBoxes(registry, vehicles, blockSize);
  return {
    vehicleBoxes,
    movementSolid: terrain,
    physicalRay: (origin: Vec3, direction: Vec3, distance: number) =>
      vehicleBoxes.ray(origin, direction, distance, terrain),
    throwSampleSolid: (pointMetres: Vec3) => {
      const point = pointMetres.map((v) => v / blockSize) as Vec3;
      return terrain(...(point.map(Math.floor) as Vec3)) || vehicleBoxes.contains(point);
    },
  };
};
