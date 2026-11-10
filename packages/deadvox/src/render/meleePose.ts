import type { HeldPosesDef } from '@skelly/engine/content';
import {
  type MeleeActionPose,
  type MeleeHand,
  type MeleePoseFrame,
  meleePoseAndContact,
  readyMeleePose,
} from '@skelly/engine/pose';
import { DEFAULT_HANDED_CHARACTER } from '@skelly/engine/sim';

/** Build a held-item render pose, keeping an occupied support hand in its natural hold pose. */
export const renderMeleePose = (
  action: (MeleeActionPose & { hands: Readonly<Record<MeleeHand, number | null>> }) | undefined,
  elapsed: number,
  ready: boolean,
  { leading = DEFAULT_HANDED_CHARACTER.handedness, holds }: { leading?: MeleeHand; holds?: HeldPosesDef } = {},
): MeleePoseFrame => {
  const pose = action ? meleePoseAndContact(action, elapsed, false) : readyMeleePose(ready, holds, leading);
  if (action && !action.twoHanded) {
    const otherHand = action.hand === 'right' ? 'left' : 'right';
    if (action.hands[otherHand] !== null) {
      pose[otherHand] = { offset: [0, 0, 0], rotation: [0, 0, 0] };
    }
  }
  return pose;
};
