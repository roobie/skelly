import type { Vec3 } from './coords.ts';
import type { SolidAt } from './raycast.ts';
import type { PoweredLight } from './sitePower.ts';

export type LightBody = PoweredLight['body'];

/** Boolean-only DDA avoids per-ray vectors and hit records in the grid builder's inner loop. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Scalar traversal keeps the grid builder's hot loop allocation-free.
export const reaches = (
  from: Vec3,
  to: Vec3,
  isBlocking: SolidAt,
  body?: LightBody,
  /** Demo only: walk in segment-parameter units, skipping the normalization. */
  unitSegment = false,
): boolean => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = unitSegment ? (dx === 0 && dy === 0 && dz === 0 ? 0 : 1) : Math.hypot(dx, dy, dz);
  if (length === 0) {
    return true;
  }
  const dirX = unitSegment ? dx : dx / length;
  const dirY = unitSegment ? dy : dy / length;
  const dirZ = unitSegment ? dz : dz / length;
  let x = Math.floor(from[0]);
  let y = Math.floor(from[1]);
  let z = Math.floor(from[2]);
  const toX = Math.floor(to[0]);
  const toY = Math.floor(to[1]);
  const toZ = Math.floor(to[2]);
  const stepX = Math.sign(dirX);
  const stepY = Math.sign(dirY);
  const stepZ = Math.sign(dirZ);
  const deltaX = dirX === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dirX);
  const deltaY = dirY === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dirY);
  const deltaZ = dirZ === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dirZ);
  let nextX = dirX === 0 ? Number.POSITIVE_INFINITY : (dirX > 0 ? x + 1 - from[0] : from[0] - x) / Math.abs(dirX);
  let nextY = dirY === 0 ? Number.POSITIVE_INFINITY : (dirY > 0 ? y + 1 - from[1] : from[1] - y) / Math.abs(dirY);
  let nextZ = dirZ === 0 ? Number.POSITIVE_INFINITY : (dirZ > 0 ? z + 1 - from[2] : from[2] - z) / Math.abs(dirZ);
  for (;;) {
    if (nextX < nextY && nextX < nextZ) {
      if (nextX > length) {
        return true;
      }
      x += stepX;
      nextX += deltaX;
    } else if (nextY < nextZ) {
      if (nextY > length) {
        return true;
      }
      y += stepY;
      nextY += deltaY;
    } else {
      if (nextZ > length) {
        return true;
      }
      z += stepZ;
      nextZ += deltaZ;
    }
    if (x === toX && y === toY && z === toZ) {
      continue;
    }
    if (
      body !== undefined &&
      x >= body.min[0] &&
      x < body.max[0] &&
      y >= body.min[1] &&
      y < body.max[1] &&
      z >= body.min[2] &&
      z < body.max[2]
    ) {
      continue;
    }
    if (isBlocking(x, y, z)) {
      return false;
    }
  }
};
