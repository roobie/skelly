/** Align the model and crosshair with visible hand motion; shots retain the unturned bore. */

import type { ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide } from '../core/inventory.ts';
import { magazineMotion, rackCant, rackGrip } from './firearmModel.ts';
import type { HeldFirearmPose } from './hands.ts';

/** Presentation: how far a full turn takes a rifle, up and turned and rolled. */
const HANDLING_TURN_RADIANS = { pitch: 0.2, yaw: 0.45, roll: 0.5 } as const;
/** Presentation: how much further a rack rolls the rifle for each radian its handle sits away from the off hand. */
const RACK_ROLL_PER_HANDLE_RADIAN = 0.25;

/**
 * The pitch, yaw and roll a rack or a magazine job adds to the lowered pitch of a gun held in `side`, as an Euler
 * rotation in view axes (x right, y up, z toward the player). `grip` is the held root's camera-local position, which
 * the pump's cant reads.
 *
 * View-space pitch, yaw and roll use the weapon's Z, Y and X axes respectively, with the view's z reversed
 * from the bore. A rack turns the rifle's far side toward the player and rolls its handle toward the off hand,
 * with a larger roll for a handle farther from that hand. The motion mirrors for a left-hander. A magazine job
 * turns the muzzle inward. Shot trajectories keep the unturned bore because this motion is presentation only.
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
  if (model.tube) {
    return [0, 0, rackCant(model, side, frame, grip)];
  }
  // +1 when the off hand is on the left.
  const toward = side === 'right' ? 1 : -1;
  const { pitch, yaw, roll } = HANDLING_TURN_RADIANS;
  if (frame.mode === 'magazine' && frame.magazine && frame.duration !== undefined) {
    const turn = magazineMotion(frame.elapsed, frame.duration, frame.magazine.removeShare).reach;
    return [turn * pitch, toward * turn * yaw, -toward * turn * roll];
  }
  if (frame.mode === 'hand' && model.action) {
    const turn = rackGrip(model.action, frame.elapsed, frame.duration).reach;
    const handleAway = (toward * (model.chargingHandleDegrees ?? 0) * Math.PI) / 180;
    const handleRoll = Math.max(0, roll + RACK_ROLL_PER_HANDLE_RADIAN * handleAway);
    return [turn * pitch, -toward * turn * yaw, toward * turn * handleRoll];
  }
  return [0, 0, 0];
};
