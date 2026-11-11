import { bodyPlanModel, figureVariantOf } from '@skelly/engine/pose';
import { makeScale } from '@skelly/engine/world';
import { Group } from 'three';
import { expect, it, vi } from 'vitest';
import { stageRagdollSweep } from '../src/debug/ragdollSweep.ts';
import { ragdollSweep } from '../src/product/ragdoll.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

it('stages ragdoll mechanisms using actor figure variants, not anatomy keys', () => {
  const scale = makeScale(0.5);
  const registry = baseRegistry();
  const system = new ActorSystem({
    isSolid: () => false,
    isOpaque: () => false,
    blockSize: scale.blockSize,
    physics: physicsFor(scale),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
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
    renderer: { group: new Group(), sync: vi.fn(), selectShadowCasters: () => undefined },
    registry,
    origin: [0, 0, 0],
    blockSize: scale.blockSize,
    seed: 1,
    restored: false,
    groundAt: () => 0,
  });
  expect(add.mock.calls.length).toBeGreaterThan(0);
  expect(new Set(add.mock.calls.map(([type]) => bodyPlanModel(figureVariantOf(type))))).toEqual(
    new Set(ragdollSweep.models),
  );
});
