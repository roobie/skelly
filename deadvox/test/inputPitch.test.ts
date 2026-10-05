import { expect, it } from 'vitest';
import { adjustLookPitch, LOOK_PITCH_LIMIT } from '../src/game/input.ts';

it('keeps recoil-driven view-pitch shifts within the mouse-look limits', () => {
  const upward = adjustLookPitch(LOOK_PITCH_LIMIT - 0.01, 0.2);
  expect(upward.pitch).toBe(LOOK_PITCH_LIMIT);
  expect(upward.applied).toBeGreaterThan(0);
  expect(upward.applied).toBeLessThan(0.2);

  const downward = adjustLookPitch(-LOOK_PITCH_LIMIT + 0.01, -0.2);
  expect(downward.pitch).toBe(-LOOK_PITCH_LIMIT);
  expect(downward.applied).toBeLessThan(0);
  expect(downward.applied).toBeGreaterThan(-0.2);
});
