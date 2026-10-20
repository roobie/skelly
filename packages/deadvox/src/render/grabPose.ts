import type { HandPose, MeleePoseFrame } from '../core/meleePose.ts';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const reachingHand = (side: 'right' | 'left', amount: number): HandPose => {
  const sign = side === 'right' ? 1 : -1;
  return {
    offset: [-sign * 0.1 * amount, -0.19 * amount, -0.34 * amount],
    rotation: [-0.75 * amount, -sign * 0.12 * amount, sign * 0.08 * amount],
  };
};

/** A short reach-and-return layered over the current view pose; handling owns its progress. */
export const grabPose = (pose: MeleePoseFrame, progress: number): MeleePoseFrame => {
  const t = clamp01(progress);
  const reach = smooth(t / 0.38);
  const returnAmount = 1 - smooth((t - 0.55) / 0.45);
  const amount = Math.min(reach, returnAmount);
  return {
    ...pose,
    right: addPose(pose.right, reachingHand('right', amount)),
    left: addPose(pose.left, reachingHand('left', amount)),
  };
};

const addPose = (base: HandPose, extra: HandPose): HandPose => ({
  offset: base.offset.map((value, index) => value + extra.offset[index]!) as HandPose['offset'],
  rotation: base.rotation.map((value, index) => value + extra.rotation[index]!) as HandPose['rotation'],
});
