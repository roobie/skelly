import type { Vec3 } from '../core/coords.ts';
import { type CrosshairTarget, crosshairAimPoint, SHOT_TRACE_RANGE_BLOCKS } from '../core/crosshairTarget.ts';
import { FISTS_MELEE, type ZombieAim, type ZombieSystem } from '../core/zombies.ts';

export interface FirearmAimTarget {
  readonly point: Vec3;
  readonly distanceMetres?: number;
  readonly zombie?: ZombieAim;
}

/** Converge to whichever visible world surface or posed zombie region the crosshair meets first. */
export const firearmAimTarget = ({
  eye,
  direction,
  surface,
  zombies,
  blockSize,
}: {
  readonly eye: Vec3;
  readonly direction: Vec3;
  readonly surface: CrosshairTarget | undefined;
  readonly zombies: ZombieSystem;
  readonly blockSize: number;
}): FirearmAimTarget => {
  const zombie = zombies.aimAt(eye, direction, FISTS_MELEE);
  const zombieDistanceBlocks = zombie ? zombie.distanceMetres / blockSize : undefined;
  const point = crosshairAimPoint(eye, direction, surface, zombieDistanceBlocks);
  const distanceBlocks = Math.min(
    SHOT_TRACE_RANGE_BLOCKS,
    surface?.distanceBlocks ?? SHOT_TRACE_RANGE_BLOCKS,
    zombieDistanceBlocks ?? SHOT_TRACE_RANGE_BLOCKS,
  );
  return {
    point,
    ...(surface || (zombie && zombieDistanceBlocks! <= SHOT_TRACE_RANGE_BLOCKS)
      ? { distanceMetres: distanceBlocks * blockSize }
      : {}),
    ...(zombie ? { zombie } : {}),
  };
};
