// The turn a rack or a magazine job gives a held gun so the hands' work is seen: a rifle turns toward the player and
// its handle toward the off hand for a rack and muzzle-in for a magazine job; the pump cants its port into view. The drawn model and the crosshair both take it (DESIGN.md, "Firearms", BR's 14:55
// ruling); shots keep the unturned bore, since neither job admits one.

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
 * BR names the turn in the weapon's own axes (2026-10-07 15:42: "x is forward along bore" / "y is up" / "z is side"):
 * the view pitch turns about the weapon's Z, the view yaw about its Y, and the view roll about its X, the bore,
 * with the sign flipped since the view's z points back along it. For a right-hander, a rack (BR, 15:34) yaws
 * clockwise about Y seen from above, so the gun's right side turns toward the player. It rolls counter-clockwise
 * about X seen from behind, bringing the handle toward the off hand, and further the further the handle
 * (`chargingHandleDegrees`) sits from it. A left-hander gets the mirror. A magazine job keeps its own turn, muzzle in.
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
