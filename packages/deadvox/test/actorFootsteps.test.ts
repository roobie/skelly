import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerSense } from '../src/core/actorSense.ts';
import type { Actor } from '../src/core/actorState.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import {
  advanceActorFootsteps,
  footstepEventAt,
  footstepEventForBlock,
  initialActorFootstepClock,
} from '../src/core/footsteps.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const BASE = 'src/content/base';
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
  actor.mode = mode;
  actor.modeTimer = 100;
  actor.lastPerceived = [40, position[1], position[2]];
  actor.strollHeading = [1, 0, 0];
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
    walker.mode = 'stroll';
    walker.modeTimer = 100;
    walker.strollHeading = [1, 0, 0];
    walker.horizontalSpeed = SHAMBLER.speed.wanderMetresPerSimSecond;
    run(system, 2);
    const strollSteps = played.length;
    expect(strollSteps).toBeGreaterThan(0);
    const stopped = store.get(actor)!;
    stopped.mode = 'idle';
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

  it('uses a faster distance cadence in a chase than a stroll on the same ground', () => {
    expect(movedSteps('chase', 3)).toBeGreaterThan(movedSteps('stroll', 3));
  });

  it('emits shambler footsteps for a kind selected by its content, not its id', () => {
    const fixture = { ...SHAMBLER, id: 'fixture_soldier', footstepSound: 'shambler' as const };
    expect(movedSteps('stroll', 3, fixture)).toBeGreaterThan(0);
  });

  it('keeps a type with no authored footstep family silent while it travels', () => {
    const silent = { ...SHAMBLER, id: 'fixture_crawler', footstepSound: undefined };
    expect(movedSteps('stroll', 3, silent)).toBe(0);
  });

  it('selects an independently declared footstep family for a new block id and keeps air silent', () => {
    const fixtureBlock = {
      id: 'fixture_moss',
      name: 'Moss',
      color: '#3f6b2f',
      solid: true,
      footsteps: { player: 'footstep_grass', [FIXTURE_FAMILY]: 'shambler_step_grass' },
    };
    const fixture = buildRegistry([
      {
        source: 'sounds.json',
        data: JSON.parse(readFileSync(join(BASE, 'sounds.json'), 'utf8')) as unknown,
      },
      { source: 'fixture-blocks.json', data: { soundFamilies: [{ id: 'fixture_steps' }], blocks: [fixtureBlock] } },
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
        { blocks: fixture.registry.blocks, family: 'fixture_steps' },
      ),
    ).toBe('shambler_step_grass');
    expect(sampledCell).toEqual([2, 0, 3]);
    // Centre over air, footprint on the mossy block: the supporting cell's contract still sounds.
    expect(
      footstepEventAt([0.9, 1, 0.5], { halfWidth: 0.6, halfDepth: 0.6 }, (x) => (x === 1 ? runtimeId : 0), {
        blocks: fixture.registry.blocks,
        family: 'fixture_steps',
      }),
    ).toBe('shambler_step_grass');
    const air = fixture.registry.blocks[fixture.registry.blockIds.get('air')!]!;
    expect(footstepEventForBlock(air, 'fixture_steps')).toBeUndefined();
  });

  it('lets only the nearest three moving shamblers emit footsteps', () => {
    const { system, store, played } = makeWorld(sense([0, 1, 2], [1, 0, 0]));
    for (let i = 0; i < 4; i++) {
      addWalker({ system, store, position: [2 + i * 8, 1, 2], mode: 'stroll' });
    }
    run(system, 2);
    const walkerZones = new Set(played.map((position) => Math.floor((position[0] - 2) / 8)));
    expect(walkerZones).toEqual(new Set([0, 1, 2]));
  });
});
