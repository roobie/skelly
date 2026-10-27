import { type InstancedMesh, Matrix4 } from 'three';
import { expect, it } from 'vitest';
import { syncClock } from '../src/bench/renderClock.ts';
import { makeScale } from '../src/core/scale.ts';
import { BACKGROUND_ZOMBIE_RATE, type PlayerSense } from '../src/core/zombies.ts';
import { ZombieMeshes } from '../src/render/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { createPlayerBody, PLAYER, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const SCALE = makeScale(0.5);
const FLOOR = (_x: number, y: number): boolean => y === 0;

it('draws a background actor partway between its own slice updates when synced on the bench clock', () => {
  const playerBody = createPlayerBody(SCALE, 0, 1, 0);
  const player = (): PlayerSense => ({
    pos: playerBody.pos,
    body: playerBody,
    facing: [1, 0, 0],
    movement: 'still',
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: 1.3,
    stance: 'standing',
  });
  const system = new ZombieSystem({
    player,
    isSolid: FLOOR,
    isOpaque: FLOOR,
    dayPhase: () => dayStateAtHour(12),
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
    seed: 1,
    isLoaded: () => true,
  });
  const id = system.add(registry.zombies.get('shambler')!, [0, 1, 0]);
  const zombie = system.store.get(id)!;
  zombie.tier = 'background';
  const updatedAt = 10;
  zombie.renderPrevious = { ...zombie.renderPrevious, pos: [0, 1, 0], time: updatedAt };
  zombie.body.pos = [8, 1, 0];

  // The actor's slice ran a quarter of its update interval ago; other slices ran since, so the most recent
  // background step is later than the actor's own.
  const now = updatedAt + 0.25 / BACKGROUND_ZOMBIE_RATE;
  const clock = syncClock(now, now - 0.01, now - 0.001);
  const meshes = new ZombieMeshes(SCALE.blockSize);
  meshes.sync(system.store, 0, clock.alpha, false, clock.backgroundAlpha, clock.simulationTime);

  const matrix = new Matrix4();
  (meshes.group.children[0] as InstancedMesh).getMatrixAt(0, matrix);
  const x = matrix.elements[12]! / SCALE.blockSize;
  expect(x / 8).toBeCloseTo(0.25, 2);
});
