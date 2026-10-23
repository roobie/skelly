import { BlockEntities } from '../src/core/blockEntities.ts';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type CrosshairTarget, crosshairTarget } from '../src/core/crosshairTarget.ts';
import { makeScale } from '../src/core/scale.ts';
import { ZombieSystem } from '../src/core/zombies.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { PLAYER, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

/** Reaches past the far wall, so the fixture never depends on the shipped shot range. */
export const FIXTURE_RANGE_BLOCKS = 120;

export const farWallTarget = (origin: Vec3, direction: Vec3, blockSize: number): CrosshairTarget => {
  const wallZ = Math.floor(origin[2] + direction[2] * 60);
  const registry = {
    blocks: [{ id: 'air' }, { id: 'fixture_wall' }],
    furniture: new Map(),
  } as unknown as Registry;
  const target = crosshairTarget(
    {
      world: { getBlock: (_x: number, _y: number, z: number) => (z === wallZ ? 1 : 0) },
      registry,
      entities: new BlockEntities(registry),
      isSolid: (_x, _y, z) => z === wallZ,
      blockSize,
    },
    origin,
    direction,
    FIXTURE_RANGE_BLOCKS,
  );
  if (!target) {
    throw new Error('The camera ray did not intersect the fixture wall');
  }
  return target;
};

export const zombieAimFixture = (registry: Registry, origin: Vec3, direction: Vec3, blockSize: number) => {
  const scale = makeScale(blockSize);
  const system = new ZombieSystem({
    isSolid: () => false,
    isOpaque: () => false,
    blockSize,
    physics: physicsFor(scale),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    player: () => ({
      pos: origin,
      facing: direction,
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
    }),
    dayPhase: () => dayStateAtHour(12),
    hurtPlayer: () => undefined,
  });
  const targetPosition: Vec3 = [
    origin[0] + direction[0] * 8,
    origin[1] + direction[1] * 8 - 2,
    origin[2] + direction[2] * 8,
  ];
  system.add(registry.zombies.get('shambler')!, targetPosition, [-direction[0], 0, -direction[2]]);
  const target = system.aimAt(origin, direction, FISTS_MELEE);
  if (!target) {
    throw new Error('The camera ray did not intersect the fixture shambler');
  }
  return { system, target };
};
