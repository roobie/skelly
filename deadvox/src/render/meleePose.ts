import { DEFAULT_HANDED_CHARACTER } from '../core/character.ts';
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
  leading: MeleeHand = DEFAULT_HANDED_CHARACTER.handedness,
): MeleePoseFrame => {
  const pose = action ? meleePoseAndContact(action, elapsed, false) : readyMeleePose(ready, leading);
  if (action && !action.twoHanded) {
    const otherHand = action.hand === 'right' ? 'left' : 'right';
    if (action.hands[otherHand] !== null) {
      pose[otherHand] = { offset: [0, 0, 0], rotation: [0, 0, 0] };
    }
  }
  return pose;
};
