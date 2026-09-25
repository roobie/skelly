import type { Vec3 } from './coords.ts';

export interface RayHit {
  block: Vec3;
  /** Face that was hit, pointing out of the block. Zero if the ray starts inside it. */
  normal: Vec3;
  distance: number;
}

export type SolidAt = (x: number, y: number, z: number) => boolean;

/** Walks the voxel grid along a ray (Amanatides & Woo) and returns the first solid block. */
export const raycast = (origin: Vec3, dir: Vec3, maxDistance: number, isSolid: SolidAt): RayHit | undefined => {
  const pos: Vec3 = [Math.floor(origin[0]), Math.floor(origin[1]), Math.floor(origin[2])];
  const step: Vec3 = [0, 0, 0];
  const tMax: Vec3 = [Infinity, Infinity, Infinity];
  const tDelta: Vec3 = [Infinity, Infinity, Infinity];
  for (let a = 0; a < 3; a++) {
    const d = dir[a]!;
    if (d > 0) {
      step[a] = 1;
      tDelta[a] = 1 / d;
      tMax[a] = (pos[a]! + 1 - origin[a]!) / d;
    } else if (d < 0) {
      step[a] = -1;
      tDelta[a] = -1 / d;
      tMax[a] = (origin[a]! - pos[a]!) / -d;
    }
  }

  if (isSolid(...pos)) return { block: [...pos], normal: [0, 0, 0], distance: 0 };

  for (;;) {
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    const t = tMax[a];
    if (t > maxDistance) return undefined;
    pos[a] += step[a];
    tMax[a] += tDelta[a];
    if (isSolid(...pos)) {
      const normal: Vec3 = [0, 0, 0];
      normal[a] = -step[a];
      return { block: [...pos], normal, distance: t };
    }
  }
};
