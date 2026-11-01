import { type InstancedMesh, Matrix4 } from 'three';
import { expect, it } from 'vitest';
import { syncClock } from '../src/bench/renderClock.ts';
import { makeScale } from '../src/core/scale.ts';
import { BACKGROUND_ZOMBIE_RATE, BACKGROUND_ZOMBIE_SLICE_COUNT, type PlayerSense } from '../src/core/zombies.ts';
import { ZombieMeshes } from '../src/render/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { createPlayerBody, physicsFor } from './playerFixture.ts';
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
    movement: 'sprinting',
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
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
    seed: 1,
    isLoaded: () => true,
    activeZombieRadiusMetres: 10,
  });
  // Far enough that the system classifies both as background; the nearer one is drawn first.
  const shambler = registry.zombies.get('shambler')!;
  const watchedId = system.add(shambler, [24, 1, 0], [-1, 0, 0]);
  const otherId = system.add(shambler, [24, 1, 6], [-1, 0, 0]);
  const watchedSlice = watchedId % BACKGROUND_ZOMBIE_SLICE_COUNT;
  const otherSlice = otherId % BACKGROUND_ZOMBIE_SLICE_COUNT;
  expect(otherSlice).not.toBe(watchedSlice);

  system.tickActive(0.05, 0);
  const watched = system.store.get(watchedId)!;
  expect(watched.tier).toBe('background');

  const interval = 1 / BACKGROUND_ZOMBIE_RATE;
  const watchedAt = 10;
  system.tickBackground(interval, watchedAt, watchedSlice, BACKGROUND_ZOMBIE_SLICE_COUNT);
  system.tickBackground(interval, watchedAt + interval / 2, watchedSlice, BACKGROUND_ZOMBIE_SLICE_COUNT);
  // The watched actor's slice has now run twice; draw between its second update and its next, while the other
  // actor's slice is the more recent background step.
  const secondAt = watchedAt + interval / 2;
  const otherAt = secondAt + interval / 8;
  system.tickBackground(interval, otherAt, otherSlice, BACKGROUND_ZOMBIE_SLICE_COUNT);

  const [previousX] = watched.renderPrevious.pos;
  const [currentX] = watched.body.pos;
  expect(Math.abs(currentX - previousX)).toBeGreaterThan(0);

  const elapsedFraction = 0.25;
  const now = secondAt + interval * elapsedFraction;
  const clock = syncClock(now, now, otherAt);
  const meshes = new ZombieMeshes(SCALE.blockSize);
  meshes.sync(system.store, 0, clock.alpha, false, clock.backgroundAlpha, clock.simSeconds);

  const matrix = new Matrix4();
  (meshes.group.children[0] as InstancedMesh).getMatrixAt(0, matrix);
  const drawnX = matrix.elements[12]! / SCALE.blockSize;
  const fraction = (drawnX - previousX) / (currentX - previousX);
  expect(fraction).toBeCloseTo(elapsedFraction, 2);
});
