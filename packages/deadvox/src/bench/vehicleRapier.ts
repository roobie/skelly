import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { VehicleInstances } from '../core/vehicleInstances.ts';
import { projectVehicleParts } from '../core/vehicleProjection.ts';

export interface PartSnapshot {
  version: number;
  parts: readonly { key: string; boxes: readonly ModelBox[] }[];
}

const vector = ([x, y, z]: Vec3) => ({ x, y, z });
const rotation = { x: 0, y: 0, z: 0, w: 1 };

export const vehicleSnapshot = (registry: Registry, vehicles: VehicleInstances, blockSize: number): PartSnapshot => ({
  version: vehicles.version,
  parts: [...vehicles.records].flatMap(([id, vehicle]) =>
    projectVehicleParts(registry, id, vehicle, blockSize).map((part) => ({
      key: `${id}/${part.fittingId}`,
      boxes: part.boxes,
    })),
  ),
});

/** Bench-only owner; no presentation-world state or cell vehicle layer enters its queries. */
export class VehicleRapierQueries {
  private readonly world;
  private readonly parts = new Map<string, { signature: string; handles: number[] }>();
  private version = -1;
  private readonly rapier: typeof RAPIER;

  constructor(rapier: typeof RAPIER = RAPIER) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
  }

  sync(snapshot: PartSnapshot): void {
    if (snapshot.version === this.version) {
      return;
    }
    const remaining = new Set(this.parts.keys());
    for (const part of snapshot.parts) {
      remaining.delete(part.key);
      const signature = JSON.stringify(part.boxes);
      if (this.parts.get(part.key)?.signature === signature) {
        continue;
      }
      this.remove(part.key);
      const handles = part.boxes.map(({ min, max }) => {
        const half = max.map((value, axis) => (value - min[axis]!) / 2) as Vec3;
        const center = max.map((value, axis) => (value + min[axis]!) / 2) as Vec3;
        const desc = this.rapier.ColliderDesc.cuboid(...half).setTranslation(...center);
        return this.world.createCollider(desc).handle;
      });
      this.parts.set(part.key, { signature, handles });
    }
    for (const key of remaining) {
      this.remove(key);
    }
    // Static-only step refreshes the broad phase after insertion/removal, without advancing gameplay.
    this.world.step();
    this.version = snapshot.version;
  }

  private remove(key: string): void {
    for (const handle of this.parts.get(key)?.handles ?? []) {
      this.world.removeCollider(this.world.getCollider(handle), false);
    }
    this.parts.delete(key);
  }

  overlapsBox(min: Vec3, max: Vec3): boolean {
    const half = max.map((value, axis) => (value - min[axis]!) / 2) as Vec3;
    const center = max.map((value, axis) => (value + min[axis]!) / 2) as Vec3;
    return this.world.intersectionWithShape(vector(center), rotation, new this.rapier.Cuboid(...half)) !== null;
  }

  point(point: Vec3): boolean {
    let hit = false;
    this.world.intersectionsWithPoint(vector(point), () => {
      hit = true;
      return false;
    });
    return hit;
  }

  ray(origin: Vec3, direction: Vec3, distance: number): number | undefined {
    return this.world.castRay(new this.rapier.Ray(vector(origin), vector(direction)), distance, true)?.timeOfImpact;
  }

  snapshotBytes(): number {
    return this.world.takeSnapshot().byteLength;
  }

  free(): void {
    this.world.free();
  }
}
