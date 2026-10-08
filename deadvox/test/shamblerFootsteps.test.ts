import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import {
  advanceShamblerFootsteps,
  initialShamblerFootstepClock,
  shamblerFootstepEventAt,
  shamblerFootstepEventForBlock,
} from '../src/core/footsteps.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import type { PlayerSense, Zombie } from '../src/core/zombies.ts';
import { ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
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
});

const makeWorld = (player: PlayerSense, isSolid = FLOOR) => {
  const played: Vec3[] = [];
  const store = new MapEntityStore<Zombie>();
  const system = new ZombieSystem({
    store,
    seed: 73,
    isSolid,
    isOpaque: isSolid,
    blockSize: BLOCK_SIZE,
    physics: PHYSICS,
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    player: () => player,
    dayPhase: () => dayStateAtHour(12),
    hurtPlayer: () => undefined,
    onFootstep: (position: Vec3) => played.push([...position]),
  });
  return { system, store, played };
};

const addWalker = (system: ZombieSystem, store: MapEntityStore<Zombie>, position: Vec3, mode: 'stroll' | 'chase') => {
  const id = system.add(SHAMBLER, position, [1, 0, 0]);
  const zombie = store.get(id)!;
  zombie.body.onGround = true;
  zombie.mode = mode;
  zombie.modeTimer = 100;
  zombie.lastPerceived = [40, position[1], position[2]];
  zombie.strollHeading = [1, 0, 0];
  zombie.horizontalSpeed =
    mode === 'stroll' ? SHAMBLER.speed.wanderMetresPerSimSecond : SHAMBLER.speed.chaseMetresPerSimSecond;
  zombie.lurchValue = 1;
  zombie.stumbleFactor = 1;
  return zombie;
};

const run = (system: ZombieSystem, seconds: number): void => {
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
  }
};

const movedSteps = (mode: 'stroll' | 'chase', seconds: number): number => {
  const player = mode === 'chase' ? sense([20, 1, 2], [-1, 0, 0]) : sense([100, 1, 100], [-1, 0, 0]);
  const { system, store, played } = makeWorld(player);
  addWalker(system, store, [2, 1, 2], mode);
  run(system, seconds);
  return played.length;
};

describe('shambler footsteps', () => {
  it('uses real grounded travel distance, stays silent while still, and steps more often while chasing', () => {
    const { system, store, played } = makeWorld(sense([100, 1, 100], [-1, 0, 0]));
    const zombie = system.add(SHAMBLER, [2, 1, 2], [1, 0, 0]);
    store.get(zombie)!.body.onGround = true;
    run(system, 2);
    expect(played).toHaveLength(0);

    const walker = store.get(zombie)!;
    walker.mode = 'stroll';
    walker.modeTimer = 100;
    walker.strollHeading = [1, 0, 0];
    walker.horizontalSpeed = SHAMBLER.speed.wanderMetresPerSimSecond;
    run(system, 2);
    const strollSteps = played.length;
    expect(strollSteps).toBeGreaterThan(0);
    const stopped = store.get(zombie)!;
    stopped.mode = 'idle';
    stopped.horizontalSpeed = 0;
    stopped.body.vel[0] = 0;
    stopped.body.vel[2] = 0;
    run(system, 4);
    expect(played.length).toBe(strollSteps);

    const oneDistance = advanceShamblerFootsteps(
      initialShamblerFootstepClock(SHAMBLER.stepLength),
      1.2,
      SHAMBLER.stepLength,
    );
    const twiceDistance = advanceShamblerFootsteps(
      initialShamblerFootstepClock(SHAMBLER.stepLength),
      2.4,
      SHAMBLER.stepLength,
    );
    expect(twiceDistance.steps).toBe(oneDistance.steps * 2);
  });

  it('uses a faster distance cadence in a chase than a stroll on the same ground', () => {
    expect(movedSteps('chase', 3)).toBeGreaterThan(movedSteps('stroll', 3));
  });

  it('maps the block underfoot to the matching shambler surface event', () => {
    expect(shamblerFootstepEventForBlock('grass')).toBe('shambler_step_grass');
    expect(shamblerFootstepEventForBlock('dirt')).toBe('shambler_step_mud');
    expect(shamblerFootstepEventForBlock('sand')).toBe('shambler_step_sand');
    expect(shamblerFootstepEventForBlock('stone')).toBe('shambler_step_stone');
    expect(shamblerFootstepEventForBlock('planks')).toBe('shambler_step_wood');
    expect(shamblerFootstepEventForBlock('carpet')).toBe('shambler_step_leaves');
    let sampledCell: Vec3 | undefined;
    expect(
      shamblerFootstepEventAt([2.4, 1.3, 3.8], (x, y, z) => {
        sampledCell = [x, y, z];
        return 'planks';
      }),
    ).toBe('shambler_step_wood');
    expect(sampledCell).toEqual([2, 0, 3]);
  });

  it('lets only the nearest three moving shamblers emit footsteps', () => {
    const { system, store, played } = makeWorld(sense([0, 1, 2], [1, 0, 0]));
    for (let i = 0; i < 4; i++) {
      addWalker(system, store, [2 + i * 8, 1, 2], 'stroll');
    }
    run(system, 2);
    const walkerZones = new Set(played.map((position) => Math.floor((position[0] - 2) / 8)));
    expect(walkerZones).toEqual(new Set([0, 1, 2]));
  });
});
