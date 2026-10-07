import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { posedVoxelSurfaceBounds } from '../src/core/voxelBounds.ts';
import { crawlerPose } from '../src/mob/crawler.ts';
import { SHAMBLER_FIGURE_SEEDS } from '../src/mob/shamblerFigure.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const crawler = TEMPLATES.find((template) => template.name === 'crawler')!;
const CRAWLER_SUPPORT_SEEDS = [...SHAMBLER_FIGURE_SEEDS, 9, 10, 11, 12, 13, 14, 15, 16];
const LOWER_LEG_BONE = /^(shin|foot)\./;
describe('crawler', () => {
  it('uses upper-thigh stumps rather than intact lower legs', () => {
    const { body } = realize(generate(crawler, 1));
    expect(body.bones.some((bone) => bone.id.startsWith('thigh.'))).toBe(true);
    expect(body.bones.some((bone) => LOWER_LEG_BONE.test(bone.id))).toBe(false);
  });

  it.each(CRAWLER_SUPPORT_SEEDS)('grounds rig support points for figure seed %i', (seed) => {
    const realized = realize(generate(crawler, seed));
    const pose = crawlerPose(realized);
    const lowest = posedVoxelSurfaceBounds(realized, pose).byBone;
    const transforms = boneTransforms(realized.body.bones, pose);
    const tailHeight = new Map(
      realized.body.bones.map((bone) => [bone.id, applyPoint(transforms.get(bone.id)!, bone.tail)[1]]),
    );
    const tolerance = 2 * realized.voxels.size;
    for (const bone of ['thigh.L', 'thigh.R']) {
      expect(Math.abs(tailHeight.get(bone)!)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(lowest.get(bone)!)).toBeLessThanOrEqual(tolerance);
    }
    for (const side of ['L', 'R']) {
      const armTail = Math.min(tailHeight.get(`forearm.${side}`)!, tailHeight.get(`hand.${side}`)!);
      const armSurface = Math.min(lowest.get(`forearm.${side}`)!, lowest.get(`hand.${side}`)!);
      expect(Math.abs(armTail)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(armSurface)).toBeLessThanOrEqual(tolerance);
    }
    const torsoLowest = Math.min(...['pelvis', 'spine', 'chest'].map((bone) => lowest.get(bone)!));
    expect(Math.abs(torsoLowest)).toBeLessThanOrEqual(tolerance);
  });
});
