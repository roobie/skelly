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
  const playerX = playerFeet[0];
  const playerY = playerFeet[1] + playerHeightBlocks / 2;
  const playerZ = playerFeet[2];
  let nearest = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (!entity.shotTarget) {
      continue;
    }
    const dx = entity.pos[0] + entity.size[0] / 2 - playerX;
    const dy = entity.pos[1] + entity.size[1] / 2 - playerY;
    const dz = entity.pos[2] + entity.size[2] / 2 - playerZ;
    nearest = Math.min(nearest, Math.hypot(dx, dy, dz) * blockSize);
  }
  return Number.isFinite(nearest) ? nearest : undefined;
};
