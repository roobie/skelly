// The turn a rack or a magazine job gives a held gun so the hands' work is seen: a rifle turns muzzle-in, the pump
// cants its port into view. The drawn model and the crosshair both take it (DESIGN.md, "Firearms", BR's 14:55
// ruling); shots keep the unturned bore, since neither job admits one.

import { Euler, Matrix4, Vector3 } from 'three';
import { aimBasis, NEUTRAL_AIM } from '../core/aim.ts';
import type { ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { heldAnchorOffset, modelToView } from '../core/heldPose.ts';
import type { HandSide } from '../core/inventory.ts';
import type { FirearmBoreRay } from '../game/firearmAim.ts';
import { magazineMotion, rackCant, rackGrip } from './firearmModel.ts';
import type { HeldFirearmPose } from './hands.ts';

/** Presentation: how far a full turn takes a rifle, muzzle in and up and rolled. */
const HANDLING_TURN_RADIANS = { pitch: 0.2, yaw: 0.45, roll: 0.5 } as const;

/** How far a magazine job or a rifle's rack turns the gun, 0 to 1, from the job alone. */
const rifleTurn = (model: ModelDef, frame: HeldFirearmPose): number => {
  if (model.tube) {
    return 0;
  }
  if (frame.mode === 'magazine' && frame.magazine && frame.duration !== undefined) {
    return magazineMotion(frame.elapsed, frame.duration, frame.magazine.removeShare).reach;
  }
  return frame.mode === 'hand' && model.action ? rackGrip(model.action, frame.elapsed, frame.duration).reach : 0;
};

/**
 * The pitch, yaw and roll a rack or a magazine job adds to the lowered pitch of a gun held in `side`. `grip` is the
 * held root's camera-local position, which the pump's cant reads.
 */
export const handlingRotation = (
  model: ModelDef | undefined,
  side: HandSide,
  frame: HeldFirearmPose | undefined,
  grip: { readonly x: number; readonly y: number },
): Vec3 => {
  if (!(model && frame)) {
    return [0, 0, 0];
  }
  const turn = rifleTurn(model, frame);
  const inward = side === 'right' ? turn : -turn;
  return [
    turn * HANDLING_TURN_RADIANS.pitch,
    inward * HANDLING_TURN_RADIANS.yaw,
    rackCant(model, side, frame, grip) - inward * HANDLING_TURN_RADIANS.roll,
  ];
};

const vector = (value: Vec3): Vector3 => new Vector3(...value);
const toVec3 = (value: Vector3): Vec3 => [value.x, value.y, value.z];

/** The rotation taking the standard axes to the orthonormal frame of `forward` and `up`. */
const frameOf = (forward: Vector3, up: Vector3): Matrix4 => {
  const x = forward.clone().normalize();
  const y = up.clone().addScaledVector(x, -up.dot(x)).normalize();
  return new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
};

export interface TurnedBoreInput {
  readonly model: ModelDef;
  readonly side: HandSide;
  readonly frame: HeldFirearmPose | undefined;
  readonly loweredPitch: number;
  readonly blockSize: number;
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * `bore` turned about the grip as `HeldItems` turns the drawn gun, whose rotation holds the turn inside its lowered
 * pitch. The bore's root rotation is recovered from its direction and up against the model's own, and the grip from
 * its muzzle.
 */
export const turnedBore = (
  bore: FirearmBoreRay,
  { model, side, frame, loweredPitch, blockSize, eye, yaw, pitch }: TurnedBoreInput,
): FirearmBoreRay => {
  const muzzleAxis = vector(modelToView(model, model.muzzleDirection ?? [1, 0, 0]));
  const modelUp = vector(modelToView(model, [0, 1, 0]));
  const root = frameOf(vector(bore.direction), vector(bore.up)).multiply(frameOf(muzzleAxis, modelUp).transpose());
  const muzzleFromGrip = vector(heldAnchorOffset(model, 'muzzle')).divideScalar(blockSize);
  const grip = vector(bore.muzzle).sub(muzzleFromGrip.clone().applyMatrix4(root));
  const view = aimBasis(yaw, pitch, NEUTRAL_AIM);
  const fromEye = grip.clone().sub(vector(eye)).multiplyScalar(blockSize);
  const [turnPitch, turnYaw, turnRoll] = handlingRotation(model, side, frame, {
    x: fromEye.dot(vector(view.right)),
    y: fromEye.dot(vector(view.up)),
  });
  if (turnPitch === 0 && turnYaw === 0 && turnRoll === 0) {
    return bore;
  }
  const turned = root
    .clone()
    .multiply(new Matrix4().makeRotationX(-loweredPitch))
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(loweredPitch + turnPitch, turnYaw, turnRoll, 'YXZ')));
  const muzzle = toVec3(grip.add(muzzleFromGrip.applyMatrix4(turned)));
  const blocked = bore.origin.some((value, axis) => value !== bore.muzzle[axis]);
  return {
    origin: blocked ? bore.origin : muzzle,
    muzzle,
    direction: toVec3(muzzleAxis.applyMatrix4(turned).normalize()),
    up: toVec3(modelUp.applyMatrix4(turned).normalize()),
  };
};
