import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { posedVoxelSurfaceBounds } from '../src/core/voxelBounds.ts';
import { crawlerGaitPose, crawlerHitPose, crawlerPose } from '../src/mob/crawler.ts';
import { HIT_FLINCH } from '../src/mob/reactions.ts';
import { SHAMBLER_FIGURE_SEEDS } from '../src/mob/shamblerFigure.ts';
import { TEMPLATES } from '../src/mob/templates.ts';
import { sweepGroup } from './sweeps.ts';

const crawler = TEMPLATES.find((template) => template.name === 'crawler')!;
const SHAMBLER_SEED_SET = new Set<number>(SHAMBLER_FIGURE_SEEDS);
const CRAWLER_SWEEP_SEEDS = Array.from({ length: 64 }, (_, index) => index + 1).filter(
  (seed) => !SHAMBLER_SEED_SET.has(seed),
);
const LOWER_LEG_BONE = /^(shin|foot)\./;
const pullElbowProperties = (
  realized: ReturnType<typeof realize>,
  phase: number,
  side: 'L' | 'R',
): { lateral: boolean; rearward: boolean; nearGround: boolean } => {
  const pullEnd = crawlerGaitPose(realized, phase, 1);
  const pullTransforms = boneTransforms(realized.body.bones, pullEnd);
  const upper = realized.body.bones.find((bone) => bone.id === `upperArm.${side}`)!;
  const transform = pullTransforms.get(upper.id)!;
  const shoulder = applyPoint(transform, upper.head);
  const elbow = applyPoint(transform, upper.tail);
  const voxel = realized.voxels.size;
  return {
    lateral: (elbow[0] - shoulder[0]) * (side === 'L' ? -1 : 1) > voxel,
    rearward: elbow[2] - shoulder[2] > voxel,
    nearGround: elbow[1] >= -voxel && elbow[1] <= 2 * voxel,
  };
};

const trailingSupportProperties = (seed: number): boolean[] => {
  const properties: boolean[] = [];
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
    properties.push(tail[2] > hip[2], tail[1] < hip[1]);
    const surface = lowest.get(bone.id)!;
    properties.push(surface >= -maximumSink, surface <= tolerance);
  }
  for (const side of ['L', 'R']) {
    for (const bone of [`forearm.${side}`, `hand.${side}`]) {
      const tail = applyPoint(
        transforms.get(bone)!,
        realized.body.bones.find((candidate) => candidate.id === bone)!.tail,
      );
      const surface = lowest.get(bone)!;
      properties.push(Math.abs(tail[1]) <= tolerance, surface >= -maximumSink, surface <= tolerance);
    }
  }
  const torsoLowest = Math.min(...['pelvis', 'spine', 'chest'].map((bone) => lowest.get(bone)!));
  properties.push(torsoLowest >= -maximumSink, torsoLowest <= tolerance);
  return properties;
};

describe('crawler', () => {
  it('validates ground support from the generated voxel contacts', () => {
    const realized = realize(generate(crawler, 1));
    const [nx, ny] = realized.voxels.dims;
    let lowestRow = Number.POSITIVE_INFINITY;
    for (let index = 0; index < realized.voxels.owner.length; index++) {
      if (realized.voxels.owner[index] !== 0) {
        lowestRow = Math.min(lowestRow, Math.floor(index / nx) % ny);
      }
    }
    const contacts = new Set<string>();
    for (let index = 0; index < realized.voxels.owner.length; index++) {
      const owner = realized.voxels.owner[index]!;
      if (owner !== 0 && Math.floor(index / nx) % ny === lowestRow) {
        contacts.add(realized.body.bones[owner - 1]!.id);
      }
    }
    expect(realized.supportBones).toEqual(contacts);
    expect(realized.report.issues.filter((issue) => issue.rule === 'grounded')).toEqual([]);
  });

  it('uses upper-thigh stumps rather than intact lower legs', () => {
    const { body } = realize(generate(crawler, 1));
    expect(body.bones.some((bone) => bone.id.startsWith('thigh.'))).toBe(true);
    expect(body.bones.some((bone) => LOWER_LEG_BONE.test(bone.id))).toBe(false);
  });

  it('alternates the arm drag and keeps gait and flinch surfaces grounded', () => {
    const seeds = SHAMBLER_FIGURE_SEEDS;
    expect(seeds.length).toBeGreaterThan(0);
    const representativeSeeds = [...new Set([seeds[0]!, seeds.at(-1)!])];
    for (const seed of representativeSeeds) {
      const realized = realize(generate(crawler, seed));
      const rest = crawlerPose(realized);
      const leftReach = crawlerGaitPose(realized, 0.5, 1);
      const rightReach = crawlerGaitPose(realized, Math.PI + 0.5, 1);
      expect(leftReach.rotations['upperArm.L']).not.toEqual(rest.rotations['upperArm.L']);
      expect(leftReach.rotations['upperArm.R']).toEqual(rest.rotations['upperArm.R']);
      expect(rightReach.rotations['upperArm.R']).not.toEqual(rest.rotations['upperArm.R']);
      expect(rightReach.rotations['upperArm.L']).toEqual(rest.rotations['upperArm.L']);
      expect(crawlerGaitPose(realized, 0.5, 0)).toEqual(rest);

      for (const side of ['L', 'R'] as const) {
        const phase = (side === 'L' ? 0 : Math.PI) + Math.PI * 0.82;
        const properties = pullElbowProperties(realized, phase, side);
        expect(properties.lateral).toBe(true);
        expect(properties.rearward).toBe(true);
        expect(properties.nearGround).toBe(true);
      }

      const tolerance = 2 * realized.voxels.size;
      for (const [phase, speed] of [
        [0, 0.5],
        [0.5, 1],
        [1.4, 1],
        [2.8, 0.5],
        [Math.PI, 1],
        [Math.PI + 0.5, 0.5],
        [4.8, 1],
        [6, 0.5],
      ] as const) {
        const gait = crawlerGaitPose(realized, phase, speed);
        const gaitSurfaces = posedVoxelSurfaceBounds(realized, gait);
        expect(gaitSurfaces.lowest).toBeGreaterThanOrEqual(-realized.voxels.size / 2);
        expect(gaitSurfaces.lowest).toBeLessThanOrEqual(tolerance);
        const torsoBottom = Math.min(...['pelvis', 'spine', 'chest'].map((bone) => gaitSurfaces.byBone.get(bone)!));
        const armBottom = Math.min(
          ...['forearm.L', 'hand.L', 'forearm.R', 'hand.R'].map((bone) => gaitSurfaces.byBone.get(bone)!),
        );
        expect(torsoBottom).toBeLessThanOrEqual(tolerance);
        expect(torsoBottom).toBeGreaterThanOrEqual(-tolerance);
        expect(armBottom).toBeLessThanOrEqual(tolerance);
        expect(armBottom).toBeGreaterThanOrEqual(-tolerance);
        const flinch = crawlerHitPose(realized, gait, 0.08, 0.5);
        expect(flinch.rotations.head).not.toEqual(gait.rotations.head);
        const flinchSurfaces = posedVoxelSurfaceBounds(realized, flinch);
        expect(flinchSurfaces.lowest).toBeGreaterThanOrEqual(-realized.voxels.size / 2);
        expect(flinchSurfaces.lowest).toBeLessThanOrEqual(tolerance);
        const flinchTorsoBottom = Math.min(
          ...['pelvis', 'spine', 'chest'].map((bone) => flinchSurfaces.byBone.get(bone)!),
        );
        const flinchArmBottom = Math.min(
          ...['forearm.L', 'hand.L', 'forearm.R', 'hand.R'].map((bone) => flinchSurfaces.byBone.get(bone)!),
        );
        expect(flinchTorsoBottom).toBeLessThanOrEqual(tolerance);
        expect(flinchTorsoBottom).toBeGreaterThanOrEqual(-tolerance);
        expect(flinchArmBottom).toBeLessThanOrEqual(tolerance);
        expect(flinchArmBottom).toBeGreaterThanOrEqual(-tolerance);
        expect(crawlerHitPose(realized, gait, HIT_FLINCH.duration)).toEqual(gait);
      }
    }
  });

  it.each(SHAMBLER_FIGURE_SEEDS)('grounds trailing rig supports for figure seed %i', (seed) => {
    const properties = trailingSupportProperties(seed);
    expect(properties.length).toBeGreaterThan(0);
    expect(properties.every(Boolean)).toBe(true);
  });

  sweepGroup('additional crawler support seeds', () => {
    it.each(CRAWLER_SWEEP_SEEDS)('grounds trailing rig supports for figure seed %i', (seed) => {
      const properties = trailingSupportProperties(seed);
      expect(properties.length).toBeGreaterThan(0);
      expect(properties.every(Boolean)).toBe(true);
    });
  });
});
