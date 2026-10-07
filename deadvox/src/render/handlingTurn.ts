// The turn a rack or a magazine job gives a held rifle so the hands' work is seen. The drawn model and the crosshair
// both take it (DESIGN.md, "Firearms", BR's 14:55 ruling); shots keep the unturned bore, since neither job admits one.

import { Euler, Matrix4, Vector3 } from 'three';
import type { ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { heldAnchorOffset, modelToView } from '../core/heldPose.ts';
import type { HandSide } from '../core/inventory.ts';
import type { FirearmBoreRay } from '../game/firearmAim.ts';
import { magazineMotion, rackGrip } from './firearmModel.ts';
import type { HeldFirearmPose } from './hands.ts';

/** Presentation: how far a full turn takes a gun, muzzle in and up and rolled. */
const HANDLING_TURN_RADIANS = { pitch: 0.2, yaw: 0.45, roll: 0.5 } as const;

/** How far a magazine job or a rifle's rack turns the gun, 0 to 1, from the job alone. The pump turns its own port. */
export const handlingTurn = (model: ModelDef | undefined, frame: HeldFirearmPose | undefined): number => {
  if (!(model && frame) || model.tube) {
    return 0;
  }
  if (frame.mode === 'magazine' && frame.magazine && frame.duration !== undefined) {
    return magazineMotion(frame.elapsed, frame.duration, frame.magazine.removeShare).reach;
  }
  return frame.mode === 'hand' && model.action ? rackGrip(model.action, frame.elapsed, frame.duration).reach : 0;
};

/** The pitch, yaw and roll a turn adds to the lowered pitch of a gun held in `side`. */
export const handlingTurnRotation = (turn: number, side: HandSide): Vec3 => {
  const inward = side === 'right' ? turn : -turn;
  return [turn * HANDLING_TURN_RADIANS.pitch, inward * HANDLING_TURN_RADIANS.yaw, -inward * HANDLING_TURN_RADIANS.roll];
};

const vector = (value: Vec3): Vector3 => new Vector3(...value);
const toVec3 = (value: Vector3): Vec3 => [value.x, value.y, value.z];

/** The rotation taking the standard axes to the orthonormal frame of `forward` and `up`. */
const frameOf = (forward: Vector3, up: Vector3): Matrix4 => {
  const x = forward.clone().normalize();
  const y = up.clone().addScaledVector(x, -up.dot(x)).normalize();
  return new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
};

/**
 * `bore` turned about the grip as `HeldItems` turns the drawn gun, whose rotation holds the turn inside its lowered
 * pitch. The bore's root rotation is recovered from its direction and up against the model's own.
 */
export const turnedBore = (
  bore: FirearmBoreRay,
  {
    model,
    side,
    turn,
    loweredPitch,
    blockSize,
  }: { model: ModelDef; side: HandSide; turn: number; loweredPitch: number; blockSize: number },
): FirearmBoreRay => {
  if (turn === 0) {
    return bore;
  }
  const muzzleAxis = vector(modelToView(model, model.muzzleDirection ?? [1, 0, 0]));
  const modelUp = vector(modelToView(model, [0, 1, 0]));
  const root = frameOf(vector(bore.direction), vector(bore.up)).multiply(frameOf(muzzleAxis, modelUp).transpose());
  const [pitch, yaw, roll] = handlingTurnRotation(turn, side);
  const turned = root
    .clone()
    .multiply(new Matrix4().makeRotationX(-loweredPitch))
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(loweredPitch + pitch, yaw, roll, 'YXZ')));
  const muzzleFromGrip = vector(heldAnchorOffset(model, 'muzzle')).divideScalar(blockSize);
  const grip = vector(bore.muzzle).sub(muzzleFromGrip.clone().applyMatrix4(root));
  const muzzle = toVec3(grip.add(muzzleFromGrip.applyMatrix4(turned)));
  const blocked = bore.origin.some((value, axis) => value !== bore.muzzle[axis]);
  return {
    origin: blocked ? bore.origin : muzzle,
    muzzle,
    direction: toVec3(muzzleAxis.applyMatrix4(turned).normalize()),
    up: toVec3(modelUp.applyMatrix4(turned).normalize()),
  };
};
