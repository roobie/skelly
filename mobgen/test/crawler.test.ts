import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { cellIndex, worldPosition } from '../src/core/voxelize.ts';
import { crawlerPose } from '../src/mob/crawler.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const crawler = TEMPLATES.find((template) => template.name === 'crawler')!;
const LOWER_LEG_BONE = /^(shin|foot)\./;
const lowestSurfaceByBone = (realized: ReturnType<typeof realize>, pose: Pose): Map<string, number> => {
  const { voxels, body } = realized;
  const transforms = boneTransforms(body.bones, pose);
  const half = voxels.size / 2;
  const lowest = new Map<string, number>();

  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]!;
        if (owner === 0) {
          continue;
        }
        const boneId = body.bones[owner - 1]!.id;
        const transform = transforms.get(boneId)!;
        const center = applyPoint(transform, worldPosition(voxels, i, j, k));
        const verticalHalfExtent =
          half * (Math.abs(transform.r[3]) + Math.abs(transform.r[4]) + Math.abs(transform.r[5]));
        lowest.set(boneId, Math.min(lowest.get(boneId) ?? Number.POSITIVE_INFINITY, center[1] - verticalHalfExtent));
      }
    }
  }
  return lowest;
};

describe('crawler', () => {
  it('uses upper-thigh stumps rather than intact lower legs', () => {
    const { body } = realize(generate(crawler, 1));
    expect(body.bones.some((bone) => bone.id.startsWith('thigh.'))).toBe(true);
    expect(body.bones.some((bone) => LOWER_LEG_BONE.test(bone.id))).toBe(false);
  });

  it('grounds the thigh stump ends, forward arm ends, and torso from named rig geometry', () => {
    const realized = realize(generate(crawler, 1));
    const pose = crawlerPose(realized);
    const lowest = lowestSurfaceByBone(realized, pose);
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
    expect(torsoLowest).toBeLessThanOrEqual(tolerance);
  });
});
