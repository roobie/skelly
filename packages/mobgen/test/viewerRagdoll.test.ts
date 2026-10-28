import { describe, expect, it } from 'vitest';
import { RagdollWorld, ragdollContent } from '../../deadvox/src/render/ragdoll.ts';
import { generateValid } from '../src/core/generate.ts';
import { dogPose } from '../src/mob/dog.ts';
import { dogTemplate } from '../src/mob/dogTemplate.ts';
import { createGaitCache, footRestExtents } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { idlePose } from '../src/mob/idle.ts';
import { skeletonTemplate } from '../src/mob/skeletonTemplate.ts';
import { buildActor, disposeActor } from '../src/viewer/scene.ts';

describe('viewer ragdoll transforms', () => {
  it.each([dogTemplate, skeletonTemplate])(
    'draws comparison-only $name with shared contact physics and releases it',
    async (template) => {
      const found = generateValid(template, 1)!;
      const { realized, genome } = found;
      const pose =
        template.bodyPlan === 'dog'
          ? dogPose(realized)
          : idlePose(
              {
                bones: realized.body.bones,
                extents: footRestExtents(realized.body.bones, realized.voxels),
                params: genome.params as HumanoidParams,
                seed: genome.seed,
                cache: createGaitCache(),
              },
              'slack',
              0,
            );
      const actor = buildActor(realized, genome.voxelSize);
      const world = new RagdollWorld();
      try {
        actor.applyPose(pose);
        const before = actor.flesh.children[0]!.matrix.clone();
        const corpse = world.spawn({
          realized,
          model: template.name,
          pose,
          position: [0, 0, 0],
          yaw: 0,
          direction: -1,
          seed: genome.seed,
          ground: { blockSize: ragdollContent.viewer.blockSizeMetres, isSolid: (_x, y, _z) => y < 0 },
        });
        await world.ready;
        expect(corpse.parts.length).toBeGreaterThan(0);
        for (let step = 0; step < ragdollContent.stepBudget; step++) {
          world.advance(ragdollContent.timestep);
        }
        expect(corpse.settled).toBe(true);
        actor.applyTransforms(
          new Map(realized.body.bones.map((bone, index) => [bone.id, corpse.transforms.get(index)!])),
        );
        expect(actor.flesh.children[0]!.matrix.equals(before)).toBe(false);
        expect(actor.colorByBone.children[0]!.matrix.equals(actor.flesh.children[0]!.matrix)).toBe(true);
        actor.applyPose(pose);
        expect(actor.flesh.children[0]!.matrix.equals(before)).toBe(true);
        world.remove(corpse);
        expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
      } finally {
        world.dispose();
        disposeActor(actor);
      }
    },
  );
});
