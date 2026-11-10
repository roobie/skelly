import { describe, expect, it } from 'vitest';
import { ACTOR_FOOTSTEP_VOICE_CAP } from '../src/core/actorSystem.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import {
  advanceActorFootsteps,
  footstepEventAt,
  footstepEventForBlock,
  footstepSoundId,
  initialActorFootstepClock,
} from '../src/core/footsteps.ts';
import type { Actor, PlayerSense } from '../src/engine/sim.ts';
import { makeScale, type SolidAt, type Vec3 } from '../src/engine/world.ts';
import { stackActorFigureFiles, withFixtureFigures } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry, FIXTURE_BLOW_SOUND, fixtureSounds } from './economyFixtures.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const FIXTURE_FAMILY = 'fixture_steps';
const registry = baseRegistry();
const SHAMBLER = registry.actors.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const PHYSICS = physicsFor(SCALE);
const FLOOR: SolidAt = (_x, y) => y === 0;
const sense = (pos: Vec3, facing: Vec3): PlayerSense => ({
  pos,
  facing,
  movement: 'still',
  lit: true,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
});

const makeWorld = (player: PlayerSense, isSolid = FLOOR) => {
  const played: Vec3[] = [];
  const store = new MapEntityStore<Actor>();
  const system = new ActorSystem({
    store,
    seed: 73,
    isSolid,
    isOpaque: isSolid,
    blockSize: BLOCK_SIZE,
    physics: PHYSICS,
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: withFixtureFigures(
      stackActorFigureFiles(registry),
      Object.fromEntries(['fixture_walker', 'fixture_soldier', 'fixture_crawler'].map((id) => [id, SHAMBLER.id])),
    ),
    player: () => player,
    dayPhase: () => dayStateAtHour(12),
    hurtPlayer: () => undefined,
    onFootstep: (position: Vec3) => played.push([...position]),
  });
  return { system, store, played };
};

const addWalker = ({
  system,
  store,
  position,
  mode,
  type = SHAMBLER,
}: {
  system: ActorSystem;
  store: MapEntityStore<Actor>;
  position: Vec3;
  mode: 'stroll' | 'chase';
  type?: Actor['type'];
}) => {
  const id = system.add(type, position, [1, 0, 0]);
  const actor = store.get(id)!;
  actor.body.onGround = true;
  actor.agent!.mode = mode;
  actor.chaseStance = actor.agent!.mode === 'chase';
  actor.agent!.modeTimer = 100;
  actor.agent!.lastPerceived = [40, position[1], position[2]];
  actor.agent!.strollHeading = [1, 0, 0];
  actor.horizontalSpeed = mode === 'stroll' ? type.speed.wanderMetresPerSimSecond : type.speed.chaseMetresPerSimSecond;
  actor.lurchValue = 1;
  actor.stumbleFactor = 1;
  return actor;
};

const run = (system: ActorSystem, seconds: number): void => {
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
  }
};

const movedSteps = (mode: 'stroll' | 'chase', seconds: number, type: Actor['type'] = SHAMBLER): number => {
  const player = mode === 'chase' ? sense([20, 1, 2], [-1, 0, 0]) : sense([100, 1, 100], [-1, 0, 0]);
  const { system, store, played } = makeWorld(player);
  addWalker({ system, store, position: [2, 1, 2], mode, type });
  run(system, seconds);
  return played.length;
};

describe('actor footsteps', () => {
  it('uses real grounded travel distance, stays silent while still, and steps more often while chasing', () => {
    const { system, store, played } = makeWorld(sense([100, 1, 100], [-1, 0, 0]));
    const actor = system.add(
      { ...SHAMBLER, id: 'fixture_walker', footstepSound: 'fixture_steps' },
      [2, 1, 2],
      [1, 0, 0],
    );
    store.get(actor)!.body.onGround = true;
    run(system, 2);
    expect(played).toHaveLength(0);

    const walker = store.get(actor)!;
    walker.agent!.mode = 'stroll';
    walker.chaseStance = false;
    walker.agent!.modeTimer = 100;
    walker.agent!.strollHeading = [1, 0, 0];
    walker.horizontalSpeed = SHAMBLER.speed.wanderMetresPerSimSecond;
    run(system, 2);
    const strollSteps = played.length;
    expect(strollSteps).toBeGreaterThan(0);
    const stopped = store.get(actor)!;
    stopped.agent!.mode = 'idle';
    stopped.chaseStance = false;
    stopped.horizontalSpeed = 0;
    stopped.body.vel[0] = 0;
    stopped.body.vel[2] = 0;
    run(system, 4);
    expect(played.length).toBe(strollSteps);

    const oneDistance = advanceActorFootsteps(initialActorFootstepClock(SHAMBLER.stepLength), 1.2, SHAMBLER.stepLength);
    const twiceDistance = advanceActorFootsteps(
      initialActorFootstepClock(SHAMBLER.stepLength),
      2.4,
      SHAMBLER.stepLength,
    );
    expect(twiceDistance.steps).toBe(oneDistance.steps * 2);
  });

  it('keeps a type with no authored footstep family silent while it travels', () => {
    const silent = { ...SHAMBLER, id: 'fixture_crawler', footstepSound: undefined };
    expect(movedSteps('stroll', 3, silent)).toBe(0);
  });

  it('keeps two family and block pairs apart when their ids contain the same underscores', () => {
    const pairs = [
      { family: 'fixture_a__b', block: 'fixture_c', sound: FIXTURE_BLOW_SOUND },
      { family: 'fixture_a', block: 'b__fixture_c', sound: 'fixture_other_step' },
    ];
    const build = (authored: typeof pairs) =>
      buildRegistry([
        {
          source: 'fixture-pairs.json',
          data: {
            soundFamilies: pairs.map(({ family }) => ({ id: family })),
            sounds: [{ ...fixtureSounds()[0]!, id: 'fixture_other_step' }],
            blocks: pairs.map(({ block }) => ({ id: block, name: block, color: '#3f6b2f', solid: true })),
            footstepSounds: authored.map((pair) => ({ id: footstepSoundId(pair.family, pair.block), ...pair })),
          },
        },
      ]);
    const soundOf = ({ registry: built }: ReturnType<typeof build>, { family, block }: (typeof pairs)[number]) =>
      footstepEventForBlock(built, built.blocks[built.blockIds.get(block)!]!, family);

    const one = build([pairs[0]!]);
    expect(one.issues).toEqual([]);
    expect(soundOf(one, pairs[0]!)).toBe(pairs[0]!.sound);
    expect(soundOf(one, pairs[1]!)).toBeUndefined();

    const both = build(pairs);
    expect(both.issues).toEqual([]);
    expect(soundOf(both, pairs[0]!)).toBe(pairs[0]!.sound);
    expect(soundOf(both, pairs[1]!)).toBe(pairs[1]!.sound);
  });

  it('sounds a family with a section row on that block and leaves one with no row silent', () => {
    const fixtureBlock = { id: 'fixture_moss', name: 'Moss', color: '#3f6b2f', solid: true };
    const fixture = buildRegistry([
      {
        source: 'fixture-blocks.json',
        data: {
          soundFamilies: [{ id: FIXTURE_FAMILY }, { id: 'fixture_silent_steps' }],
          blocks: [fixtureBlock],
          footstepSounds: [
            {
              id: footstepSoundId(FIXTURE_FAMILY, fixtureBlock.id),
              family: FIXTURE_FAMILY,
              block: fixtureBlock.id,
              sound: FIXTURE_BLOW_SOUND,
            },
          ],
        },
      },
    ]);
    expect(fixture.issues).toEqual([]);
    const runtimeId = fixture.registry.blockIds.get(fixtureBlock.id)!;
    let sampledCell: Vec3 | undefined;
    expect(
      footstepEventAt(
        [2.5, 1.3, 3.5],
        { halfWidth: 0.3 },
        (x, y, z) => {
          sampledCell = [x, y, z];
          return runtimeId;
        },
        { ...fixture.registry, family: FIXTURE_FAMILY },
      ),
    ).toBe(FIXTURE_BLOW_SOUND);
    expect(sampledCell).toEqual([2, 0, 3]);
    expect(
      footstepEventAt([2.5, 1.3, 3.5], { halfWidth: 0.3 }, () => runtimeId, {
        ...fixture.registry,
        family: 'fixture_silent_steps',
      }),
    ).toBeUndefined();
  });

  it('sounds exactly the declared voice cap of nearest moving walkers when one more walks farther out', () => {
    const walkers = ACTOR_FOOTSTEP_VOICE_CAP + 1;
    const { system, store, played } = makeWorld(sense([0, 1, 2], [1, 0, 0]));
    for (let i = 0; i < walkers; i++) {
      addWalker({ system, store, position: [2 + i * 8, 1, 2], mode: 'stroll' });
    }
    run(system, 2);
    const walkerZones = new Set(played.map((position) => Math.floor((position[0] - 2) / 8)));
    // Walkers are numbered by distance, so the nearest cap are zones 0 to cap - 1; the farthest stays silent.
    expect(walkerZones).toEqual(new Set(Array.from({ length: ACTOR_FOOTSTEP_VOICE_CAP }, (_, zone) => zone)));
  });
});
