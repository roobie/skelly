import { type AimFrame, aimBasis, NEUTRAL_AIM } from '../core/aim.ts';
import type { ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { type CrosshairTarget, crosshairAimPoint } from '../core/crosshairTarget.ts';
import { type HeldFirearmTransformInput, type HeldSeatFrame, heldFirearmTransform } from '../core/heldPose.ts';
import type { HandSide } from '../core/inventory.ts';
import type { HeldPosesDef } from '../core/schema.ts';
import type { MeleeWeapon, ZombieAim, ZombieSystem } from '../core/zombies.ts';

export interface FirearmBoreRayInput {
  readonly holds: HeldPosesDef;
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
  readonly stockSeat?: Vec3 | undefined;
  readonly seatFrame?: HeldSeatFrame | undefined;
  readonly adsEyes?: HeldFirearmTransformInput['adsEyes'];
  readonly aimingDownSights?: boolean;
  readonly loweredPitchRadians: number;
  readonly leanRollRadians?: number | undefined;
}

export interface FirearmBoreRay {
  readonly origin: Vec3;
  readonly muzzle: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
}

export const firearmBoreRay = ({
  holds,
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
  stockSeat,
  seatFrame,
  adsEyes,
  aimingDownSights = false,
  loweredPitchRadians,
  leanRollRadians,
}: FirearmBoreRayInput): FirearmBoreRay => {
  const pose = heldFirearmTransform({
    holds,
    model,
    side,
    leadingSide,
    twoHanded,
    progress,
    aimingDownSights,
    aimFrame,
    lookPitchRadians: pitch,
    leanRollRadians,
    stockSeat,
    seatFrame,
    adsEyes,
    ...(handlingTurn === undefined ? {} : { handlingTurn }),
    loweredPitchRadians,
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
  return { origin: muzzle, muzzle, direction, up: muzzleUp };
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
  rangeBlocks,
  weapon,
}: {
  readonly eye: Vec3;
  readonly direction: Vec3;
  readonly surface: CrosshairTarget | undefined;
  readonly zombies: ZombieSystem;
  readonly blockSize: number;
  readonly rangeBlocks: number;
  /** Only its reach decides the aim's `inReach`; the bore ray itself is not a melee swing. */
  readonly weapon: MeleeWeapon;
}): FirearmBoreTarget => {
  const rayDirection = normalizeDirection(direction);
  const zombie = zombies.aimAt(eye, rayDirection, weapon);
  const zombieDistanceBlocks = zombie ? zombie.distanceMetres / blockSize : undefined;
  const point = crosshairAimPoint(eye, rayDirection, rangeBlocks, [surface?.distanceBlocks, zombieDistanceBlocks]);
  const distanceBlocks = Math.min(
    rangeBlocks,
    surface?.distanceBlocks ?? rangeBlocks,
    zombieDistanceBlocks ?? rangeBlocks,
  );
  return {
    point,
    ...(surface || (zombie && zombieDistanceBlocks! <= rangeBlocks)
      ? { distanceMetres: distanceBlocks * blockSize }
      : {}),
    ...(zombie ? { zombie } : {}),
  };
};
