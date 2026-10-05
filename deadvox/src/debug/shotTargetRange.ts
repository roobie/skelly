import type { Vec3 } from '../core/coords.ts';

export interface ShotTargetBox {
  readonly pos: Readonly<Vec3>;
  readonly size: Readonly<Vec3>;
  readonly shotTarget: boolean;
}

/** Distance from the player's center to the nearest authored shot-target center, in metres. */
export const rangeToNearestShotTargetMetres = (
  playerFeet: Vec3,
  playerHeightBlocks: number,
  blockSize: number,
  entities: Iterable<ShotTargetBox>,
): number | undefined => {
  const [playerX, playerFeetY, playerZ] = playerFeet;
  const playerY = playerFeetY + playerHeightBlocks / 2;
  let nearest = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (!entity.shotTarget) {
      continue;
    }
    const [targetX, targetY, targetZ] = entity.pos;
    const [targetWidth, targetHeight, targetDepth] = entity.size;
    const dx = targetX + targetWidth / 2 - playerX;
    const dy = targetY + targetHeight / 2 - playerY;
    const dz = targetZ + targetDepth / 2 - playerZ;
    nearest = Math.min(nearest, Math.hypot(dx, dy, dz) * blockSize);
  }
  return Number.isFinite(nearest) ? nearest : undefined;
};
