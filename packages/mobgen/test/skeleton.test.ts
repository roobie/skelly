import { describe, expect, it } from 'vitest';
import { generate, generateValid, realize, recommendedProfileFor } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { consumableTemplate } from '../src/core/template.ts';
import { corners, createGaitCache, footRestExtents, type GaitClock, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { skeletonTemplate } from '../src/mob/skeletonTemplate.ts';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('skeleton template', () => {
  it('every sampled skeleton passes the full rules, budgets included, at full detail', () => {
    for (const seed of SEEDS) {
      const genome = generate(skeletonTemplate, seed);
      expect(recommendedProfileFor(genome), `seed ${seed}`).toBe('full');
      const { report } = realize(genome);
      expect(report.issues, `seed ${seed}`).toEqual([]);
      expect(report.ok).toBe(true);
    }
  });

  it('refuses consumption until its game contracts are decided', () => {
    expect(() => consumableTemplate(skeletonTemplate.name)).toThrow('comparison-only');
  });

  it('the shared walk keeps the lowest foot point on the ground with its own leg layout', () => {
    const found = generateValid(skeletonTemplate, 1)!;
    const { body, voxels } = found.realized;
    const extents = footRestExtents(body.bones, voxels);
    const actor = {
      bones: body.bones,
      extents,
      params: found.genome.params as HumanoidParams,
      seed: found.genome.seed,
      cache: createGaitCache(),
    };
    const lowestOf = (footBone: string, transforms: ReturnType<typeof boneTransforms>) =>
      Math.min(...corners(extents.get(footBone)!).map((c) => applyPoint(transforms.get(footBone)!, c)[1]));
    for (let step = 0; step < 4; step++) {
      for (let i = 0; i <= 8; i++) {
        const clock: GaitClock = { stepIndex: step, progress: i / 8 };
        const transforms = boneTransforms(body.bones, walkPose(actor, clock, 0.8));
        const lowest = Math.min(lowestOf('foot.L', transforms), lowestOf('foot.R', transforms));
        expect(Math.abs(lowest)).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
      }
    }
  });
});
