import type { Vec3 } from './coords.ts';
import type { ActorDef } from './schema.ts';

export interface SpawnBodyDimensions {
  readonly halfWidth: number;
  readonly halfDepth?: number;
  readonly height: number;
}

/**
 * Collision dimensions in voxel blocks, matching the bodies used by ActorSystem. A fused mass's come from its content
 * `spawnEnvelope`, so content admission needs no figure file.
 */
export const actorBodyDimensions = (type: ActorDef, blockSize: number): SpawnBodyDimensions => {
  if (type.model !== 'fused-mass') {
    return { halfWidth: 0.28 / blockSize, height: 1.7 / blockSize };
  }
  const envelope = type.spawnEnvelope;
  if (!envelope) {
    throw new Error(`Fused-mass actor type ${type.id} has no spawnEnvelope`);
  }
  return {
    halfWidth: envelope.halfWidthMetres / blockSize,
    halfDepth: envelope.halfDepthMetres / blockSize,
    height: envelope.heightMetres / blockSize,
  };
};

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
