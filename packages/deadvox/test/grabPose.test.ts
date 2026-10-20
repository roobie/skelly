import { describe, expect, it } from 'vitest';
import type { MeleePoseFrame } from '../src/core/meleePose.ts';
import { grabPose } from '../src/render/grabPose.ts';

describe('ground-item grab pose', () => {
  it('reaches forward and down, then returns to the underlying hand pose', () => {
    const neutral: MeleePoseFrame = {
      right: { offset: [0, 0, 0], rotation: [0, 0, 0] },
      left: { offset: [0, 0, 0], rotation: [0, 0, 0] },
    };
    const start = grabPose(neutral, 0);
    const reach = grabPose(neutral, 0.5);
    const finish = grabPose(neutral, 1);

    expect(start).toEqual(neutral);
    expect(finish).toEqual(neutral);
    for (const hand of [reach.right, reach.left]) {
      expect(hand.offset[1]).toBeLessThan(0);
      expect(hand.offset[2]).toBeLessThan(0);
    }
  });
});
