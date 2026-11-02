import { Group } from 'three';
import { expect, it, vi } from 'vitest';
import { makeScale } from '../src/core/scale.ts';
import { bodyPlanModel, figureVariantOf } from '../src/core/zombieModels.ts';
import { stageRagdollSweep } from '../src/debug/ragdollSweep.ts';
import { ragdollContent } from '../src/render/ragdoll.ts';
import { baseRegistry } from './baseRegistry.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

it('stages ragdoll mechanisms using actor figure variants, not anatomy keys', () => {
  const scale = makeScale(0.5);
  const system = new ZombieSystem({
    isSolid: () => false,
    isOpaque: () => false,
    blockSize: scale.blockSize,
    physics: physicsFor(scale),
    tuning: TEST_SENSE_TUNING,
    player: () => ({
      pos: [0, 0, 0],
      facing: [0, 0, -1],
      movement: 'still',
      lit: false,
      lightSeenFrom: 0,
      eyeHeightMetres: 1.5,
      stance: 'standing',
    }),
    dayPhase: () => {
      throw new Error('Staging does not query daylight');
    },
    hurtPlayer: vi.fn(),
  });
  const add = vi.spyOn(system, 'add');
  stageRagdollSweep({
    system,
    renderer: { group: new Group(), sync: vi.fn() },
    registry: baseRegistry(),
    origin: [0, 0, 0],
    blockSize: scale.blockSize,
    seed: 1,
    restored: false,
    groundAt: () => 0,
  });
  expect(add.mock.calls.length).toBeGreaterThan(0);
  expect(new Set(add.mock.calls.map(([type]) => bodyPlanModel(figureVariantOf(type))))).toEqual(
    new Set(ragdollContent.sweep.models),
  );
});
