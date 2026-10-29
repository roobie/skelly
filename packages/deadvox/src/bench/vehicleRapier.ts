import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { VehicleInstances } from '../core/vehicleInstances.ts';
import { projectVehicleParts, transformPoint } from '../core/vehicleProjection.ts';
import { type ConvexPieces, type PartMesh, placeMesh } from './vehicleShapes.ts';

/** Fitted boxes (as exported), compound convex hulls per part, or one static triangle mesh per part. */
export type ColliderTier = 'boxes' | 'hulls' | 'mesh';

export interface PartShape {
  /** Names the model and its placement, so an unchanged part is not rebuilt. */
  signature: string;
  /** World-metre points of each convex piece. */
  pieces?: readonly Float32Array[];
  /** World-metre drawn triangles. */
  mesh?: PartMesh;
}

export interface PartSnapshot {
  version: number;
  parts: readonly { key: string; boxes: readonly ModelBox[]; shape?: PartShape }[];
}

/**
 * A model's shapes in its own frame, built once per model as an export would bake them. A tier needs only its own:
 * `convex` for hulls, `mesh` for the triangle mesh.
 */
export interface ModelShapes {
  readonly mesh?: PartMesh;
  readonly convex?: ConvexPieces;
}

const vector = ([x, y, z]: Vec3) => ({ x, y, z });
const rotation = { x: 0, y: 0, z: 0, w: 1 };

/** Where a tier's baked shapes come from; boxes need none. */
export interface ShapeSource {
  tier: ColliderTier;
  of: (model: string) => ModelShapes | undefined;
}

type ProjectedPart = ReturnType<typeof projectVehicleParts>[number];

/** Places only what the tier consumes, so its build and detach cost carries no other tier's geometry. */
const placedShape = ({ tier }: ShapeSource, part: ProjectedPart, shapes: ModelShapes): PartShape => {
  const place = (point: Vec3) => transformPoint(part.transform, point);
  const placePieces = (pieces: readonly Float32Array[]) =>
    pieces.map((points) => placeMesh({ positions: points, indices: new Uint32Array() }, place, false).positions);
  const signature = `${part.model}@${JSON.stringify(part.transform)}`;
  if (tier === 'hulls' && shapes.convex) {
    return { signature, pieces: placePieces(shapes.convex.pieces) };
  }
  return { signature, ...(shapes.mesh ? { mesh: placeMesh(shapes.mesh, place, part.transform.mirror) } : {}) };
};

export const vehicleSnapshot = (
  registry: Registry,
  vehicles: VehicleInstances,
  blockSize: number,
  source?: ShapeSource,
): PartSnapshot => ({
  version: vehicles.version,
  parts: [...vehicles.records].flatMap(([id, vehicle]) =>
    projectVehicleParts(registry, id, vehicle, blockSize).map((part) => {
      const shapes =
        source && source.tier !== 'boxes' && part.model !== undefined && !isCargoSpace(registry, part)
          ? source.of(part.model)
          : undefined;
      return {
        key: `${id}/${part.fittingId}`,
        boxes: part.boxes,
        ...(source && shapes ? { shape: placedShape(source, part, shapes) } : {}),
      };
    }),
  ),
});

const isCargoSpace = (registry: Registry, part: ProjectedPart): boolean =>
  Boolean(registry.items.get(part.item.type)?.vehicle?.cargoSpace);

export interface ColliderCounts {
  colliders: number;
  /** Hull points handed to Rapier, or mesh vertices. */
  vertices: number;
  triangles: number;
}

/** Bench-only owner; no presentation-world state or cell vehicle layer enters its queries. */
export class VehicleRapierQueries {
  private readonly world;
  private readonly parts = new Map<string, { signature: string; handles: number[]; counts: ColliderCounts }>();
  private version = -1;
  private readonly rapier: typeof RAPIER;
  private readonly tier: ColliderTier;

  constructor(rapier: typeof RAPIER = RAPIER, tier: ColliderTier = 'boxes') {
    this.rapier = rapier;
    this.tier = tier;
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
  }

  sync(snapshot: PartSnapshot): void {
    if (snapshot.version === this.version) {
      return;
    }
    const remaining = new Set(this.parts.keys());
    for (const part of snapshot.parts) {
      remaining.delete(part.key);
      const shape = this.tier === 'boxes' ? undefined : part.shape;
      const signature = shape?.signature ?? JSON.stringify(part.boxes);
      if (this.parts.get(part.key)?.signature === signature) {
        continue;
      }
      this.remove(part.key);
      const { descs, counts } = this.describe(part, shape);
      const handles = descs.map((desc) => this.world.createCollider(desc).handle);
      this.parts.set(part.key, { signature, handles, counts });
    }
    for (const key of remaining) {
      this.remove(key);
    }
    // Static-only step refreshes the broad phase after insertion/removal, without advancing gameplay.
    this.world.step();
    this.version = snapshot.version;
  }

  private describe(
    part: PartSnapshot['parts'][number],
    shape: PartShape | undefined,
  ): { descs: RAPIER.ColliderDesc[]; counts: ColliderCounts } {
    const counts: ColliderCounts = { colliders: 0, vertices: 0, triangles: 0 };
    const descs: RAPIER.ColliderDesc[] = [];
    if (shape?.pieces && this.tier === 'hulls') {
      for (const points of shape.pieces) {
        const desc = this.rapier.ColliderDesc.convexHull(points);
        if (!desc) {
          throw new Error(`Part ${part.key} has a convex piece that is flat or degenerate`);
        }
        descs.push(desc);
        counts.vertices += points.length / 3;
      }
    } else if (shape?.mesh && this.tier === 'mesh') {
      descs.push(this.rapier.ColliderDesc.trimesh(shape.mesh.positions, shape.mesh.indices));
      counts.vertices += shape.mesh.positions.length / 3;
      counts.triangles += shape.mesh.indices.length / 3;
    } else {
      for (const { min, max } of part.boxes) {
        const half = max.map((value, axis) => (value - min[axis]!) / 2) as Vec3;
        const center = max.map((value, axis) => (value + min[axis]!) / 2) as Vec3;
        descs.push(this.rapier.ColliderDesc.cuboid(...half).setTranslation(...center));
      }
      counts.vertices += part.boxes.length * 8;
      counts.triangles += part.boxes.length * 12;
    }
    counts.colliders = descs.length;
    return { descs, counts };
  }

  private remove(key: string): void {
    for (const handle of this.parts.get(key)?.handles ?? []) {
      this.world.removeCollider(this.world.getCollider(handle), false);
    }
    this.parts.delete(key);
  }

  counts(): ColliderCounts {
    const total: ColliderCounts = { colliders: 0, vertices: 0, triangles: 0 };
    for (const { counts } of this.parts.values()) {
      total.colliders += counts.colliders;
      total.vertices += counts.vertices;
      total.triangles += counts.triangles;
    }
    return total;
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

  rayHit(origin: Vec3, direction: Vec3, distance: number): { distance: number; normal: Vec3 } | undefined {
    const hit = this.world.castRayAndGetNormal(new this.rapier.Ray(vector(origin), vector(direction)), distance, true);
    return hit ? { distance: hit.timeOfImpact, normal: [hit.normal.x, hit.normal.y, hit.normal.z] } : undefined;
  }

  snapshotBytes(): number {
    return this.world.takeSnapshot().byteLength;
  }

  free(): void {
    this.world.free();
  }
}
