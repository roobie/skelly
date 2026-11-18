import { type Body, clearBodyPoint, type SolidAt, type Vec3 } from '@skelly/engine/world';
import type { PerspectiveCamera } from 'three';

/** How far a perspective camera's near plane reaches from it: the distance to its corners. */
export const nearPlaneReach = ({ near, fov, aspect }: Pick<PerspectiveCamera, 'near' | 'fov' | 'aspect'>): number => {
  const halfHeight = Math.tan((fov * Math.PI) / 360);
  return near * Math.hypot(1, halfHeight, halfHeight * aspect);
};

/**
 * Where the player's own camera may sit, in blocks: its posed position, swept clear from the body's anchor with a margin
 * of its near plane's reach plus a pad. See `packages/deadvox/docs/body-point-clearance.md`, "Where it lives".
 */
export const clearOwnCamera = ({
  body,
  posed,
  camera,
  padMetres,
  blockSize,
  isSolid,
}: {
  body: Pick<Body, 'pos' | 'height'>;
  posed: Readonly<Vec3>;
  camera: Pick<PerspectiveCamera, 'near' | 'fov' | 'aspect'>;
  padMetres: number;
  blockSize: number;
  isSolid: SolidAt;
}): Vec3 =>
  clearBodyPoint({ body, point: posed, marginBlocks: (nearPlaneReach(camera) + padMetres) / blockSize, isSolid });
