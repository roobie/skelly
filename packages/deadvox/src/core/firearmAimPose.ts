import type { Vec3 } from './coords.ts';
import type { FirearmAimOffHand } from './firearmAimOffHand.ts';
import type { HandSide } from './inventory.ts';
import type { MeleePoseFrame } from './meleePose.ts';
import type { HeldPosesDef } from './schema.ts';

/** Resolves the content-authored off-hand pose shared by every firearm presentation view. */
export const firearmAimHandPose = ({
  side,
  aimOffHand,
  readyPose,
  holds,
  easedReady,
}: {
  side: HandSide;
  aimOffHand: FirearmAimOffHand | undefined;
  readyPose: MeleePoseFrame | undefined;
  holds: HeldPosesDef;
  easedReady: number;
}): MeleePoseFrame[HandSide] | undefined => {
  if (aimOffHand?.mode !== 'active' || aimOffHand.side !== side) {
    return;
  }
  const active = holds.aimActiveOffHand;
  const offset: Vec3 = [side === 'right' ? active.offset[0] : -active.offset[0], active.offset[1], active.offset[2]];
  const rotation: Vec3 = [
    active.rotation[0],
    side === 'right' ? active.rotation[1] : -active.rotation[1],
    side === 'right' ? active.rotation[2] : -active.rotation[2],
  ];
  const target = readyPose?.[side];
  if (target && easedReady === 1) {
    return target;
  }
  return target
    ? {
        offset: offset.map((value, index) => value + (target.offset[index]! - value) * easedReady) as Vec3,
        rotation: rotation.map((value, index) => value + (target.rotation[index]! - value) * easedReady) as Vec3,
      }
    : { offset, rotation };
};
