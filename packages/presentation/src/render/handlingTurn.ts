/** Align the model and crosshair with visible hand motion; shots retain the unturned bore. */

import type { ModelDef } from '@skelly/engine/content';
import type { HandSide } from '@skelly/engine/inventory';
import type { Vec3 } from '@skelly/engine/world';
import { MathUtils } from 'three';
import { magazineMotion, pressCheckAt, rackCant, rackGrip } from './firearmModel.ts';
import type { HeldFirearmPose } from './hands.ts';

/** Presentation: how far a full turn takes a rifle, up and turned and rolled. */
const HANDLING_TURN_RADIANS = { pitch: 0.2, yaw: 0.45, roll: 0.5 } as const;
/** Presentation: how much further a rack rolls the rifle for each radian its handle sits away from the off hand. */
const RACK_ROLL_PER_HANDLE_RADIAN = 0.25;

const revolverTurn = (side: HandSide, frame: HeldFirearmPose): Vec3 => {
  const progress = Math.min(1, Math.max(0, frame.elapsed / (frame.duration ?? 1)));
  const reach = Math.sin(progress * Math.PI);
  const { step } = frame.revolver!;
  const sideSign = side === 'right' ? 1 : -1;
  if (step === 'eject' || step === 'pick') {
    return [(reach * Math.PI) / 3, 0, sideSign * reach * 0.25];
  }
  if (step === 'load') {
    return [-reach * 0.2, sideSign * reach * 0.2, sideSign * reach * 0.35];
  }
  return step === 'open' || step === 'close' ? [0, 0, sideSign * reach * 0.35] : [0, 0, 0];
};

/**
 * The pitch, yaw and roll a rack or a magazine job adds to the lowered pitch of a gun held in `side`, as an Euler
 * rotation in view axes (x right, y up, z toward the player). `grip` is the held root's camera-local position, which
 * the pump's cant reads.
 *
 * View-space pitch, yaw and roll use the weapon's Z, Y and X axes respectively, with the view's z reversed
 * from the bore. A rack turns the rifle's far side toward the player and rolls its handle toward the off hand,
 * with a larger roll for a handle farther from that hand. The motion mirrors for a left-hander. A magazine job
 * turns the muzzle inward. A press check plays its clip's turn. Shot trajectories keep the unturned bore because this motion is presentation only.
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
  if (model.gun?.revolver && frame.revolver) {
    return revolverTurn(side, frame);
  }
  if (model.gun?.internalMagazine) {
    return [0, 0, rackCant(model, side, frame, grip)];
  }
  // +1 when the off hand is on the left.
  const toward = side === 'right' ? 1 : -1;
  if (frame.mode === 'press-check' && model.gun?.pressCheck) {
    const { pitch, yaw, roll } = pressCheckAt(model.gun.pressCheck, frame).turnDegrees;
    return [MathUtils.degToRad(pitch), toward * MathUtils.degToRad(yaw), toward * MathUtils.degToRad(roll)];
  }
  const { pitch, yaw, roll } = HANDLING_TURN_RADIANS;
  if (frame.mode === 'magazine' && frame.magazine && frame.duration !== undefined) {
    const turn = magazineMotion(frame.elapsed, frame.duration, frame.magazine.removeShare).reach;
    return [turn * pitch, toward * turn * yaw, -toward * turn * roll];
  }
  if (frame.mode === 'hand' && model.gun?.action) {
    const turn = rackGrip(model.gun.action, frame.elapsed, frame.duration).reach;
    const handleAway = (toward * (model.gun.chargingHandleDegrees ?? 0) * Math.PI) / 180;
    const handleRoll = Math.max(0, roll + RACK_ROLL_PER_HANDLE_RADIAN * handleAway);
    return [turn * pitch, -toward * turn * yaw, toward * turn * handleRoll];
  }
  return [0, 0, 0];
};

/**
 * How far handling moves a gun held in `side` off its hold, in view axes and metres: a press check lifts it by its
 * clip, across toward the off hand for either hand. Like the turn, shots never see it.
 */
export const handlingShift = (
  model: ModelDef | undefined,
  side: HandSide,
  frame: HeldFirearmPose | undefined,
): Vec3 => {
  if (!(frame?.mode === 'press-check' && model?.gun?.pressCheck)) {
    return [0, 0, 0];
  }
  const { up, back, across } = pressCheckAt(model.gun.pressCheck, frame).liftMetres;
  return [(side === 'right' ? -1 : 1) * across, up, back];
};

/**
 * How far handling turns the eyes off the aim, in radians (yaw left, pitch up): a press check looks toward the port by
 * its clip, whose yaw counts toward the off hand so a left-hander mirrors it. Only the view turns; the aim and the held
 * gun stay where they are.
 */
export const handlingLook = (
  model: ModelDef | undefined,
  side: HandSide,
  frame: HeldFirearmPose | undefined,
): { readonly yaw: number; readonly pitch: number } => {
  if (!(frame?.mode === 'press-check' && model?.gun?.pressCheck)) {
    return { yaw: 0, pitch: 0 };
  }
  const { pitch, yaw } = pressCheckAt(model.gun.pressCheck, frame).lookDegrees;
  return { yaw: (side === 'right' ? 1 : -1) * MathUtils.degToRad(yaw), pitch: MathUtils.degToRad(pitch) };
};
