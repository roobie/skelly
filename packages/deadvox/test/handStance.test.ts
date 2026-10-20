import { expect, it } from 'vitest';
import { type HandPose, meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { renderMeleePose } from '../src/render/meleePose.ts';

const reflected = (pose: HandPose): HandPose => ({
  offset: [-pose.offset[0], pose.offset[1], pose.offset[2]],
  rotation: [pose.rotation[0], -pose.rotation[1], -pose.rotation[2]],
});

it('mirrors neutral stance roles without changing physical hand labels or aim', () => {
  const right = readyMeleePose(true, 'right');
  const left = readyMeleePose(true, 'left');
  expect(right.right).not.toEqual(right.left);
  expect(left.left).toEqual(reflected(right.right));
  expect(left.right).toEqual(reflected(right.left));
  expect(renderMeleePose(undefined, 0, true, 'left')).toEqual(left);
  const action = {
    profile: 'fists' as const,
    hand: 'left' as const,
    twoHanded: false,
    cooldown: 1,
    contactAt: 0.3,
    aimYaw: 0.4,
    aimPitch: 0.2,
    origin: [1, 2, 3] as [number, number, number],
    direction: [0, 0, -1] as [number, number, number],
    hitResolved: false,
  };
  expect(meleePoseAndContact(action, 0, true)).toEqual(left);
});
