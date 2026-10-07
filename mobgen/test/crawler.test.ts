import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { posedVoxelSurfaceBounds } from '../src/core/voxelBounds.ts';
import { crawlerPose } from '../src/mob/crawler.ts';
import { SHAMBLER_FIGURE_SEEDS } from '../src/mob/shamblerFigure.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const crawler = TEMPLATES.find((template) => template.name === 'crawler')!;
const SHAMBLER_SEED_SET = new Set<number>(SHAMBLER_FIGURE_SEEDS);
const CRAWLER_SUPPORT_SEEDS = [
  ...SHAMBLER_FIGURE_SEEDS,
  ...Array.from({ length: 64 }, (_, index) => index + 1).filter((seed) => !SHAMBLER_SEED_SET.has(seed)),
];
const LOWER_LEG_BONE = /^(shin|foot)\./;
describe('crawler', () => {
  it('uses upper-thigh stumps rather than intact lower legs', () => {
    const { body } = realize(generate(crawler, 1));
    expect(body.bones.some((bone) => bone.id.startsWith('thigh.'))).toBe(true);
    expect(body.bones.some((bone) => LOWER_LEG_BONE.test(bone.id))).toBe(false);
  });

  it.each(CRAWLER_SUPPORT_SEEDS)('grounds trailing rig supports for figure seed %i', (seed) => {
    const realized = realize(generate(crawler, seed));
    const pose = crawlerPose(realized);
    const lowest = posedVoxelSurfaceBounds(realized, pose).byBone;
    const transforms = boneTransforms(realized.body.bones, pose);
    const tolerance = 2 * realized.voxels.size;
    const maximumSink = realized.voxels.size;
    for (const side of ['L', 'R']) {
      const bone = realized.body.bones.find((candidate) => candidate.id === `thigh.${side}`)!;
      const transform = transforms.get(bone.id)!;
      const hip = applyPoint(transform, bone.head);
      const tail = applyPoint(transform, bone.tail);
      expect(tail[2]).toBeGreaterThan(hip[2]);
      expect(tail[1]).toBeLessThan(hip[1]);
      const surface = lowest.get(bone.id)!;
      expect(surface).toBeGreaterThanOrEqual(-maximumSink);
      expect(surface).toBeLessThanOrEqual(tolerance);
    }
    for (const side of ['L', 'R']) {
      for (const bone of [`forearm.${side}`, `hand.${side}`]) {
        const tail = applyPoint(
          transforms.get(bone)!,
          realized.body.bones.find((candidate) => candidate.id === bone)!.tail,
        );
        expect(Math.abs(tail[1])).toBeLessThanOrEqual(tolerance);
        const surface = lowest.get(bone)!;
        expect(surface).toBeGreaterThanOrEqual(-maximumSink);
        expect(surface).toBeLessThanOrEqual(tolerance);
      }
    }
    const torsoLowest = Math.min(...['pelvis', 'spine', 'chest'].map((bone) => lowest.get(bone)!));
    expect(torsoLowest).toBeGreaterThanOrEqual(-maximumSink);
    expect(torsoLowest).toBeLessThanOrEqual(tolerance);
  });
});
