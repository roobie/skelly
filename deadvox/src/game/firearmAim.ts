import { type AimFrame, aimBasis, NEUTRAL_AIM } from '../core/aim.ts';
import type { ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { type CrosshairTarget, crosshairAimPoint, SHOT_TRACE_RANGE_BLOCKS } from '../core/crosshairTarget.ts';
import { heldFirearmTransform } from '../core/heldPose.ts';
import type { HandSide } from '../core/inventory.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import { FISTS_MELEE, type ZombieAim, type ZombieSystem } from '../core/zombies.ts';

export interface FirearmBoreRayInput {
  readonly model: ModelDef;
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly blockSize: number;
  readonly side: HandSide;
  readonly leadingSide: HandSide;
  readonly progress?: number;
  readonly twoHanded: boolean;
  readonly aimFrame: AimFrame;
  readonly handlingTurn?: Vec3;
  readonly aimingDownSights?: boolean;
  readonly loweredPitchRadians: number;
  readonly adsApertureFill?: number | undefined;
  readonly verticalFovDegrees?: number;
  readonly isSolid?: SolidAt;
}

export interface FirearmBoreRay {
  readonly origin: Vec3;
  readonly muzzle: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
}

export const firearmBoreRay = ({
  model,
  eye,
  yaw,
  pitch,
  blockSize,
  side,
  leadingSide,
  progress = 1,
  twoHanded,
  aimFrame,
  handlingTurn,
  aimingDownSights = false,
  loweredPitchRadians,
  adsApertureFill,
  verticalFovDegrees,
  isSolid = () => false,
}: FirearmBoreRayInput): FirearmBoreRay => {
  const pose = heldFirearmTransform({
    model,
    side,
    leadingSide,
    twoHanded,
    progress,
    aimingDownSights,
    aimFrame,
    ...(handlingTurn === undefined ? {} : { handlingTurn }),
    loweredPitchRadians,
    adsApertureFill,
    ...(verticalFovDegrees === undefined ? {} : { verticalFovDegrees }),
  });
  const { right, up, forward } = aimBasis(yaw, pitch, NEUTRAL_AIM);
  const worldVector = (vector: Vec3): Vec3 => [
    right[0] * vector[0] + up[0] * vector[1] - forward[0] * vector[2],
    right[1] * vector[0] + up[1] * vector[1] - forward[1] * vector[2],
    right[2] * vector[0] + up[2] * vector[1] - forward[2] * vector[2],
  ];
  const eyeMetres = eye.map((value) => value * blockSize) as Vec3;
  const rootMetres = eyeMetres.map((value, axis) => value + worldVector(pose.rootOffset)[axis]!) as Vec3;
  const muzzleMetres = rootMetres.map((value, axis) => value + worldVector(pose.muzzleOffset)[axis]!) as Vec3;
  const muzzle = muzzleMetres.map((value) => value / blockSize) as Vec3;
  const direction = normalizeDirection(worldVector(pose.muzzleDirection));
  const muzzleUp = normalizeDirection(worldVector(pose.muzzleUp));
  const eyeToMuzzle = muzzle.map((value, axis) => value - eye[axis]!) as Vec3;
  const muzzleDistance = Math.hypot(...eyeToMuzzle);
  const muzzleBlocked =
    muzzleDistance > 0 &&
    raycast(eye, eyeToMuzzle.map((value) => value / muzzleDistance) as Vec3, muzzleDistance, isSolid) !== undefined;
  return { origin: muzzleBlocked ? eye : muzzle, muzzle, direction, up: muzzleUp };
};

export interface FirearmBoreTarget {
  readonly point: Vec3;
  readonly distanceMetres?: number;
  readonly zombie?: ZombieAim;
}

const normalizeDirection = (direction: Vec3): Vec3 => {
  const length = Math.hypot(...direction);
  if (!(length > 0 && Number.isFinite(length))) {
    throw new Error('Invalid firearm bore direction');
  }
  return direction.map((value) => value / length) as Vec3;
};

/** Reports the nearest visible world surface or posed zombie region along a firearm ray. */
export const firearmBoreTarget = ({
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
}): FirearmBoreTarget => {
  const rayDirection = normalizeDirection(direction);
  const zombie = zombies.aimAt(eye, rayDirection, FISTS_MELEE);
  const zombieDistanceBlocks = zombie ? zombie.distanceMetres / blockSize : undefined;
  const point = crosshairAimPoint(eye, rayDirection, surface, zombieDistanceBlocks);
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
