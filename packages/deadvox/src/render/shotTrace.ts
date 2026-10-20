import type { Vec3 } from '../core/coords.ts';
import { type RayHit, raycast, type SolidAt } from '../core/raycast.ts';

export interface ShotTrace {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly endpoint: Vec3;
  readonly hit?: RayHit;
}

/** Resolve the shared shot directions once; impact marks and debug lines consume these same segments. */
export const traceShot = (
  origin: Vec3,
  directions: readonly Vec3[],
  maxDistance: number,
  isSolid: SolidAt,
): ShotTrace[] =>
  directions.map((direction) => {
    const hit = raycast(origin, direction, maxDistance, isSolid);
    const distance = hit?.distance ?? maxDistance;
    return {
      origin: [...origin],
      direction,
      endpoint: [
        origin[0] + direction[0] * distance,
        origin[1] + direction[1] * distance,
        origin[2] + direction[2] * distance,
      ],
      ...(hit ? { hit } : {}),
    };
  });
