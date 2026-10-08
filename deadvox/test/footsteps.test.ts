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

  it('preserves stride phase across gait changes and airborne ticks', () => {
    const walking = advanceFootsteps(initialFootstepClock(), 'walking', 0.5);
    const joggingTravel = 0.1;
    const jogging = advanceFootsteps(walking.clock, 'jogging', joggingTravel);
    expect(jogging.steps).toBe(0);
    expect(jogging.clock.stridePhase).toBeCloseTo(
      walking.clock.stridePhase + joggingTravel / (2 * STEP_DISTANCE_METRES.jogging),
    );
    const phaseToNextFootfall = (0.25 - jogging.clock.stridePhase + 1) % 0.5;
    expect(jogging.clock.distanceUntilStep).toBeCloseTo(
      (phaseToNextFootfall === 0 ? 0.5 : phaseToNextFootfall) * 2 * STEP_DISTANCE_METRES.jogging,
    );

    const airborne = advanceFootsteps(jogging.clock, 'still', 0);
    expect(airborne.steps).toBe(0);
    expect(airborne.clock).toMatchObject({
      gait: 'still',
      distanceUntilStep: 0,
      stridePhase: jogging.clock.stridePhase,
      stepIndex: jogging.clock.stepIndex,
    });
    const landed = advanceFootsteps(airborne.clock, 'walking', joggingTravel);
    expect(landed.clock.stridePhase).toBeCloseTo(
      airborne.clock.stridePhase + joggingTravel / (2 * STEP_DISTANCE_METRES.walking),
    );
  });

  it('plays a hard landing at and above a 2.5 m drop, not below it', () => {
    expect(HARD_LANDING_METRES).toBe(2.5);
    expect(isHardLanding(2.49)).toBe(false);
    expect(isHardLanding(2.5)).toBe(true);
    expect(isHardLanding(3.2)).toBe(true);
  });
});
