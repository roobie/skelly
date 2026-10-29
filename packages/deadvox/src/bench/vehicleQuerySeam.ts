import type { Vec3 } from '../core/coords.ts';
import { type Body, type BodyShape, bodyOverlapsTerrain, type ShapeOf } from '../core/physics.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import type { VehicleRapierQueries } from './vehicleRapier.ts';

/** Metre Rapier geometry and block terrain meet only at this explicit unit boundary. */
export class VehicleQuerySeam {
  readonly vehicles: VehicleRapierQueries;
  readonly terrain: SolidAt;
  readonly blockSize: number;

  constructor(vehicles: VehicleRapierQueries, terrain: SolidAt, blockSize: number) {
    this.vehicles = vehicles;
    this.terrain = terrain;
    this.blockSize = blockSize;
  }

  point = (metres: Vec3): boolean =>
    this.terrain(...(metres.map((v) => Math.floor(v / this.blockSize)) as Vec3)) || this.vehicles.point(metres);

  ray(origin: Vec3, direction: Vec3, distance: number): number | undefined {
    const terrain = raycast(
      origin.map((v) => v / this.blockSize) as Vec3,
      direction,
      distance / this.blockSize,
      this.terrain,
    );
    const vehicle = this.vehicles.ray(origin, direction, distance);
    const nearest = Math.min(
      terrain ? terrain.distance * this.blockSize : Number.POSITIVE_INFINITY,
      vehicle ?? Number.POSITIVE_INFINITY,
    );
    return Number.isFinite(nearest) ? nearest : undefined;
  }

  shapeOf: ShapeOf = (body: Body): BodyShape => {
    const overlap = (pos: Vec3, height: number): boolean => {
      const min: Vec3 = [pos[0] - body.halfWidth, pos[1], pos[2] - (body.halfDepth ?? body.halfWidth)];
      const max: Vec3 = [pos[0] + body.halfWidth, pos[1] + height, pos[2] + (body.halfDepth ?? body.halfWidth)];
      return (
        bodyOverlapsTerrain({ ...body, pos, height }, this.terrain) ||
        this.vehicles.overlapsBox(
          min.map((v) => v * this.blockSize) as Vec3,
          max.map((v) => v * this.blockSize) as Vec3,
        )
      );
    };
    return {
      overlapsTerrain: (pos) => overlap(pos, body.height),
      overlapsTerrainBelow: overlap,
      overlapsBox: (pos, min, max) =>
        pos[0] - body.halfWidth < max[0] &&
        pos[0] + body.halfWidth > min[0] &&
        pos[1] < max[1] &&
        pos[1] + body.height > min[1] &&
        pos[2] - (body.halfDepth ?? body.halfWidth) < max[2] &&
        pos[2] + (body.halfDepth ?? body.halfWidth) > min[2],
    };
  };
}
