import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import playerFamilies from '../../mods/skelly.sound-families/sound-families.json' with { type: 'json' };
import {
  advanceFootsteps,
  footstepEventAt,
  footstepEventForBlock,
  footstepSoundId,
  initialFootstepClock,
  isHardLanding,
  stepDistanceMetres,
} from '../../engine/src/core/footsteps.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

const tuning = BASE_SENSE_TUNING.footsteps;
const STEP_DISTANCE_METRES = {
  walking: stepDistanceMetres(tuning, 'walking'),
  jogging: stepDistanceMetres(tuning, 'jogging'),
  sprinting: stepDistanceMetres(tuning, 'sprinting'),
};

const soundsSources = [
  { source: 'sound-families.json', data: playerFamilies },
  {
    source: 'natural-sounds.json',
    data: JSON.parse(readFileSync('../mods/skelly.natural-world/natural-sounds.json', 'utf8')) as unknown,
  },
];
const FIXTURE_BLOCK = {
  id: 'fixture_moss',
  name: 'Moss',
  color: '#3f6b2f',
  solid: true,
  footsteps: { player: 'footstep_grass' },
};
const FIXTURE_PLANK = {
  id: 'fixture_plank',
  name: 'Plank',
  color: '#8a6a3f',
  solid: true,
  footsteps: { player: 'footstep_wood' },
};
const fixtureRegistry = () =>
  buildRegistry([
    ...soundsSources,
    { source: 'fixture-blocks.json', data: { blocks: [FIXTURE_BLOCK, FIXTURE_PLANK] } },
  ]);

describe('player footsteps', () => {
  it('resolves a new block id from its authored footstep selection without a code edit', () => {
    const { registry, issues } = fixtureRegistry();
    expect(issues).toEqual([]);
    const runtimeId = registry.blockIds.get(FIXTURE_BLOCK.id)!;
    expect(
      footstepEventAt([0.4, 1.2, 0.6], { halfWidth: 0.3 }, () => runtimeId, {
        blocks: registry.blocks,
        footstepSounds: registry.footstepSounds,
        family: 'player',
      }),
    ).toBe('footstep_grass');
  });

  it('takes the supporting block event when the centre cell is over air', () => {
    const { registry } = fixtureRegistry();
    const plank = registry.blockIds.get(FIXTURE_PLANK.id)!;
    // The actor stands on a plank ledge with its centre over the air cell beside it.
    const blockIdAt = (x: number) => (x === 1 ? plank : 0);
    expect(
      footstepEventAt([0.9, 1, 0.5], { halfWidth: 0.6, halfDepth: 0.6 }, blockIdAt, {
        blocks: registry.blocks,
        footstepSounds: registry.footstepSounds,
        family: 'player',
      }),
    ).toBe('footstep_wood');
  });

  it('rejects a footstep event the pack does not define, naming the authored path', () => {
    const { issues } = buildRegistry([{ source: 'fixture-blocks.json', data: { blocks: [FIXTURE_BLOCK] } }]);
    expect(issues).toContainEqual({
      source: 'fixture-blocks.json',
      path: 'blocks[0].footsteps.player',
      message: 'no sound event "footstep_grass"',
    });
  });

  it('refuses a section row naming an absent family, block or sound, or claiming the block-owned family', () => {
    const row = (family: string, block: string, sound: string) => ({
      id: footstepSoundId(family, block),
      family,
      block,
      sound,
    });
    const { issues } = buildRegistry([
      {
        source: 'fixture-rows.json',
        data: {
          blocks: [FIXTURE_BLOCK],
          footstepSounds: [
            row('fixture_absent_family', FIXTURE_BLOCK.id, 'player_absent_sound'),
            row('player', 'fixture_absent_block', 'player_absent_sound'),
          ],
        },
      },
    ]);
    const messages = issues
      .filter(({ path }) => path.startsWith('footstepSounds'))
      .map(({ path, message }) => `${path}: ${message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'footstepSounds[0].family: no sound family "fixture_absent_family"',
        'footstepSounds[0].sound: no sound event "player_absent_sound"',
        'footstepSounds[1].family: "player" footsteps belong on the block',
        'footstepSounds[1].block: no block "fixture_absent_block"',
      ]),
    );
  });

  it('keeps air and an out-of-registry chunk id out of the authored selection contract', () => {
    const { registry } = buildRegistry([]);
    const air = registry.blocks[registry.blockIds.get('air')!]!;
    expect(footstepEventForBlock(registry, air, 'player')).toBeUndefined();
    expect(() =>
      footstepEventAt([0, 1, 0], { halfWidth: 0.3 }, () => 999, {
        blocks: registry.blocks,
        footstepSounds: registry.footstepSounds,
        family: 'player',
      }),
    ).toThrow();
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
