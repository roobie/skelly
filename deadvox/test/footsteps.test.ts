import { describe, expect, it } from 'vitest';
import {
  advanceFootsteps,
  footstepEventForBlock,
  HARD_LANDING_METRES,
  initialFootstepClock,
  isHardLanding,
  STEP_DISTANCE_METRES,
} from '../src/core/footsteps.ts';

describe('player footsteps', () => {
  it('maps every base walking surface to its closest curated sound', () => {
    for (const [block, event] of [
      ['grass', 'footstep_grass'],
      ['dirt', 'footstep_mud'],
      ['sand', 'footstep_sand'],
      ['asphalt', 'footstep_stone'],
      ['stone', 'footstep_stone'],
      ['concrete', 'footstep_stone'],
      ['brick', 'footstep_stone'],
      ['plaster', 'footstep_stone'],
      ['tiles', 'footstep_stone'],
      ['roof', 'footstep_stone'],
      ['window_frame', 'footstep_stone'],
      ['planks', 'footstep_wood'],
      ['fabric', 'footstep_leaves'],
      ['carpet', 'footstep_leaves'],
    ] as const) {
      expect(footstepEventForBlock(block)).toBe(event);
    }
    expect(footstepEventForBlock('modded_unknown')).toBe('footstep_stone');
  });

  it('uses the configured walking, jogging, and sprinting distances between footfalls', () => {
    for (const gait of ['walking', 'jogging', 'sprinting'] as const) {
      const distance = STEP_DISTANCE_METRES[gait];
      const half = advanceFootsteps(initialFootstepClock(), gait, distance / 2);
      expect(half.steps).toBe(0);
      const full = advanceFootsteps(half.clock, gait, distance / 2);
      expect(full.steps).toBe(1);
      expect(full.clock.distanceUntilStep).toBeCloseTo(distance);
      expect(full.clock.stridePhase).toBeCloseTo((initialFootstepClock().stridePhase + 0.5) % 1);
      expect(full.clock.stepIndex).toBe(initialFootstepClock().stepIndex + 1);
    }
  });

  it('does not carry cadence across a gait change or while still', () => {
    const walking = advanceFootsteps(initialFootstepClock(), 'walking', 0.5);
    const jogging = advanceFootsteps(walking.clock, 'jogging', 0.5);
    expect(jogging.steps).toBe(0);
    expect(jogging.clock.distanceUntilStep).toBeCloseTo(STEP_DISTANCE_METRES.jogging - 0.5);
    const stopped = advanceFootsteps(jogging.clock, 'still', 5);
    expect(stopped.clock).toEqual({ ...initialFootstepClock(), stepIndex: jogging.clock.stepIndex });
    expect(stopped.steps).toBe(0);
  });

  it('plays a hard landing at and above a 2.5 m drop, not below it', () => {
    expect(HARD_LANDING_METRES).toBe(2.5);
    expect(isHardLanding(2.49)).toBe(false);
    expect(isHardLanding(2.5)).toBe(true);
    expect(isHardLanding(3.2)).toBe(true);
  });
});
