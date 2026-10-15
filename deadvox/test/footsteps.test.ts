import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import {
  advanceFootsteps,
  footstepEventAt,
  footstepEventForBlock,
  HARD_LANDING_METRES,
  initialFootstepClock,
  isHardLanding,
  STEP_DISTANCE_METRES,
} from '../src/core/footsteps.ts';

const soundsSource = {
  source: 'sounds.json',
  data: JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')) as unknown,
};
const FIXTURE_BLOCK = {
  id: 'fixture_moss',
  name: 'Moss',
  color: '#3f6b2f',
  solid: true,
  footsteps: { player: 'footstep_grass', shambler: 'shambler_step_grass' },
};
const fixtureRegistry = () =>
  buildRegistry([soundsSource, { source: 'fixture-blocks.json', data: { blocks: [FIXTURE_BLOCK] } }]);

describe('player footsteps', () => {
  it('resolves a new block id from its authored footstep selection without a code edit', () => {
    const { registry, issues } = fixtureRegistry();
    expect(issues).toEqual([]);
    const runtimeId = registry.blockIds.get(FIXTURE_BLOCK.id)!;
    expect(footstepEventAt([0.4, 1.2, 0.6], () => runtimeId, registry.blocks)).toBe('footstep_grass');
  });

  it('rejects a footstep event the pack does not define, naming the authored path', () => {
    const { issues } = buildRegistry([{ source: 'fixture-blocks.json', data: { blocks: [FIXTURE_BLOCK] } }]);
    expect(issues).toContainEqual({
      source: 'fixture-blocks.json',
      path: 'blocks[0].footsteps.player',
      message: 'no sound event "footstep_grass"',
    });
    expect(issues).toContainEqual({
      source: 'fixture-blocks.json',
      path: 'blocks[0].footsteps.shambler',
      message: 'no sound event "shambler_step_grass"',
    });
  });

  it('keeps air and an out-of-registry chunk id out of the authored selection contract', () => {
    const { registry } = buildRegistry([]);
    const air = registry.blocks[registry.blockIds.get('air')!]!;
    expect(footstepEventForBlock(air)).toBeUndefined();
    expect(() => footstepEventAt([0, 1, 0], () => 999, registry.blocks)).toThrow();
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
