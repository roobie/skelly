import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import {
  advanceFootsteps,
  footstepEventAt,
  footstepEventForBlock,
  initialFootstepClock,
  isHardLanding,
  stepDistanceMetres,
} from '../src/core/footsteps.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

const tuning = BASE_SENSE_TUNING.footsteps;
const STEP_DISTANCE_METRES = {
  walking: stepDistanceMetres(tuning, 'walking'),
  jogging: stepDistanceMetres(tuning, 'jogging'),
  sprinting: stepDistanceMetres(tuning, 'sprinting'),
};

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
const FIXTURE_PLANK = {
  id: 'fixture_plank',
  name: 'Plank',
  color: '#8a6a3f',
  solid: true,
  footsteps: { player: 'footstep_wood', shambler: 'shambler_step_wood' },
};
const fixtureRegistry = () =>
  buildRegistry([soundsSource, { source: 'fixture-blocks.json', data: { blocks: [FIXTURE_BLOCK, FIXTURE_PLANK] } }]);

describe('player footsteps', () => {
  it('resolves a new block id from its authored footstep selection without a code edit', () => {
    const { registry, issues } = fixtureRegistry();
    expect(issues).toEqual([]);
    const runtimeId = registry.blockIds.get(FIXTURE_BLOCK.id)!;
    expect(footstepEventAt([0.4, 1.2, 0.6], { halfWidth: 0.3 }, () => runtimeId, registry.blocks)).toBe(
      'footstep_grass',
    );
  });

  it('takes the supporting block event when the centre cell is over air', () => {
    const { registry } = fixtureRegistry();
    const plank = registry.blockIds.get(FIXTURE_PLANK.id)!;
    // The actor stands on a plank ledge with its centre over the air cell beside it.
    const blockIdAt = (x: number) => (x === 1 ? plank : 0);
    expect(footstepEventAt([0.9, 1, 0.5], { halfWidth: 0.6, halfDepth: 0.6 }, blockIdAt, registry.blocks)).toBe(
      'footstep_wood',
    );
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
    expect(() => footstepEventAt([0, 1, 0], { halfWidth: 0.3 }, () => 999, registry.blocks)).toThrow();
  });

  it('uses the configured walking, jogging, and sprinting distances between footfalls', () => {
    for (const gait of ['walking', 'jogging', 'sprinting'] as const) {
      const distance = STEP_DISTANCE_METRES[gait];
      const half = advanceFootsteps(initialFootstepClock(), gait, distance / 2, tuning);
      expect(half.steps).toBe(0);
      const full = advanceFootsteps(half.clock, gait, distance / 2, tuning);
      expect(full.steps).toBe(1);
      expect(full.clock.distanceUntilStep).toBeCloseTo(distance);
      expect(full.clock.stridePhase).toBeCloseTo((initialFootstepClock().stridePhase + 0.5) % 1);
      expect(full.clock.stepIndex).toBe(initialFootstepClock().stepIndex + 1);
    }
  });

  it('preserves stride phase across gait changes and airborne ticks', () => {
    const walking = advanceFootsteps(initialFootstepClock(), 'walking', 0.5, tuning);
    const joggingTravel = 0.1;
    const jogging = advanceFootsteps(walking.clock, 'jogging', joggingTravel, tuning);
    expect(jogging.steps).toBe(0);
    expect(jogging.clock.stridePhase).toBeCloseTo(
      walking.clock.stridePhase + joggingTravel / (2 * STEP_DISTANCE_METRES.jogging),
    );
    const phaseToNextFootfall = (0.25 - jogging.clock.stridePhase + 1) % 0.5;
    expect(jogging.clock.distanceUntilStep).toBeCloseTo(
      (phaseToNextFootfall === 0 ? 0.5 : phaseToNextFootfall) * 2 * STEP_DISTANCE_METRES.jogging,
    );

    const airborne = advanceFootsteps(jogging.clock, 'still', 0, tuning);
    expect(airborne.steps).toBe(0);
    expect(airborne.clock).toMatchObject({
      gait: 'still',
      distanceUntilStep: 0,
      stridePhase: jogging.clock.stridePhase,
      stepIndex: jogging.clock.stepIndex,
    });
    const landed = advanceFootsteps(airborne.clock, 'walking', joggingTravel, tuning);
    expect(landed.clock.stridePhase).toBeCloseTo(
      airborne.clock.stridePhase + joggingTravel / (2 * STEP_DISTANCE_METRES.walking),
    );
  });

  it('plays a hard landing at and above the authored drop, not below it', () => {
    const { hardLandingMetres } = tuning;
    expect(isHardLanding(hardLandingMetres - 0.01, tuning)).toBe(false);
    expect(isHardLanding(hardLandingMetres, tuning)).toBe(true);
    expect(isHardLanding(hardLandingMetres + 0.7, tuning)).toBe(true);
  });
});
