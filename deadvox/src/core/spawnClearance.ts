import { AMALGAM_FIGURE_SEED, amalgamCollisionEnvelope, amalgamFigureForType } from './amalgamFigure.ts';
import type { Vec3 } from './coords.ts';
import type { ZombieDef } from './schema.ts';

export interface SpawnBodyDimensions {
  readonly halfWidth: number;
  readonly halfDepth?: number;
  readonly height: number;
}

/** Collision dimensions in voxel blocks, matching the bodies used by ZombieSystem. */
export const zombieBodyDimensions = (type: ZombieDef, blockSize: number): SpawnBodyDimensions =>
  type.model === 'amalgam'
    ? amalgamCollisionEnvelope(amalgamFigureForType(type, AMALGAM_FIGURE_SEED), blockSize)
    : { halfWidth: 0.28 / blockSize, height: 1.7 / blockSize };

export const spawnOverlappingSolidBlock = (
  position: Vec3,
  dimensions: SpawnBodyDimensions,
  isSolid: (x: number, y: number, z: number) => boolean,
): Vec3 | undefined => {
  const [x, feet, z] = position;
  const halfDepth = dimensions.halfDepth ?? dimensions.halfWidth;
  for (let by = Math.floor(feet); by < Math.ceil(feet + dimensions.height); by += 1) {
    for (let bz = Math.floor(z - halfDepth); bz < Math.ceil(z + halfDepth); bz += 1) {
      for (let bx = Math.floor(x - dimensions.halfWidth); bx < Math.ceil(x + dimensions.halfWidth); bx += 1) {
        if (
          isSolid(bx, by, bz) &&
          bx + 1 > x - dimensions.halfWidth &&
          bx < x + dimensions.halfWidth &&
          by + 1 > feet &&
          by < feet + dimensions.height &&
          bz + 1 > z - halfDepth &&
          bz < z + halfDepth
        ) {
          return [bx, by, bz];
        }
      }
    }
  }
  return undefined;
};
