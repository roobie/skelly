import {
  type MeleeActionPose,
  type MeleeHand,
  type MeleePoseFrame,
  meleePoseAndContact,
  readyMeleePose,
} from '../core/meleePose.ts';

/** Build a held-item render pose, keeping an occupied support hand in its natural hold pose. */
export const renderMeleePose = (
  action: (MeleeActionPose & { hands: Readonly<Record<MeleeHand, number | null>> }) | undefined,
  elapsed: number,
  ready: boolean,
): MeleePoseFrame => {
  const pose = action ? meleePoseAndContact(action, elapsed, false) : readyMeleePose(ready);
  if (action && !action.twoHanded) {
    const offHand = action.hand === 'right' ? 'left' : 'right';
    if (action.hands[offHand] !== null) {
      pose[offHand] = { offset: [0, 0, 0], rotation: [0, 0, 0] };
    }
  }
  return pose;
};
