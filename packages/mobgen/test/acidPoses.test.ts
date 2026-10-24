import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { jointAngles } from '../src/core/joints.ts';
import { applyPoint, dot, IDENTITY_M, mulMV, normalize, sub } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { posedVoxelSurfaceBounds, posedVoxelSurfaceBoundsForBones } from '../src/core/voxelBounds.ts';
import {
  acidAttackPose,
  acidDeathPose,
  acidHitPose,
  acidIdlePose,
  acidStrideLength,
  acidWalkPose,
  acidWindupPose,
} from '../src/mob/acidPoses.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';
import { LOOK_AT_REST, lookAtPose } from '../src/mob/lookAt.ts';
import { LOOK_AT_PROFILES } from '../src/mob/lookAtProfiles.ts';

const genome = generate(acidTemplate, 7);
const realized = realize(genome);
const tuning = acidTemplate.animation;
const idle = acidIdlePose(realized);
const walk = acidWalkPose(realized, acidStrideLength(realized) / 4, 1);
const attack = acidAttackPose(realized, walk, tuning.attackPeak);
const windup = acidWindupPose(realized, walk, 1);
const hit = acidHitPose(realized, attack, tuning.hitPeak, -1);

const limitIssues = (pose: Pose, rootIsWorld = false, rig = realized) => {
  const issues: string[] = [];
  for (const bone of rig.body.bones) {
    if (rootIsWorld && bone.parent === null) {
      continue;
    }
    const angles = jointAngles(bone, pose.rotations[bone.id] ?? IDENTITY_M);
    for (const [index, limits] of [bone.limits!.flex, bone.limits!.twist, bone.limits!.abduct].entries()) {
      if (angles[index]! < limits[0] - 1e-7 || angles[index]! > limits[1] + 1e-7) {
        issues.push(`${bone.id} axis ${index}: ${angles[index]}`);
      }
    }
  }
  return issues;
};

describe('acid animation', () => {
  it('keeps live poses within joint limits with a grounded support and no buried voxels', () => {
    for (const pose of [idle, walk, attack, windup, hit]) {
      expect(limitIssues(pose)).toEqual([]);
      expect(posedVoxelSurfaceBounds(realized, pose).lowest).toBeCloseTo(0, 8);
      const supports = posedVoxelSurfaceBoundsForBones(realized, pose, realized.supportBones);
      expect(supports.size).toBeGreaterThan(0);
      expect(Math.min(...supports.values())).toBeCloseTo(0, 8);
      expect(Object.keys(pose.rotations).every((id) => realized.body.bones.some((bone) => bone.id === id))).toBe(true);
    }
  });

  it('walks on a distance-driven alternating cycle and returns to idle at zero speed', () => {
    const stride = acidStrideLength(realized);
    const left = acidWalkPose(realized, stride / 4, 1);
    const right = acidWalkPose(realized, (stride * 3) / 4, 1);
    const supportY = (pose: Pose, side: string) =>
      Math.min(...posedVoxelSurfaceBoundsForBones(realized, pose, [`foot.${side}`, `toe.${side}`]).values());
    expect(supportY(left, 'L')).toBeGreaterThan(supportY(left, 'R'));
    expect(supportY(right, 'R')).toBeGreaterThan(supportY(right, 'L'));
    expect(acidWalkPose(realized, stride / 4, 0)).toEqual(idle);
    const repeated = acidWalkPose(realized, (stride * 5) / 4, 1);
    for (const bone of realized.body.bones) {
      const a = left.rotations[bone.id] ?? IDENTITY_M;
      const b = repeated.rotations[bone.id] ?? IDENTITY_M;
      for (let i = 0; i < a.length; i++) {
        expect(a[i]).toBeCloseTo(b[i]!, 8);
      }
    }
  });

  it('grounds the gait across pair-covered posture endpoints and action phases', () => {
    const factors = ['kneeBend', 'hunch', 'legFrac'] as const;
    for (let row = 0; row < 4; row++) {
      const params = Object.fromEntries(
        factors.map((key, column) => {
          const spec = acidTemplate.params[key];
          if (typeof spec !== 'object' || !('min' in spec)) {
            throw new Error(`expected ranged fixture factor ${key}`);
          }
          const high = [row & 1, row >> 1, (row & 1) ^ (row >> 1)][column];
          return [key, high ? spec.max : spec.min];
        }),
      );
      const rig = realize({ ...genome, params: { ...genome.params, ...params } });
      for (const phase of [0, 0.125, 0.25, 0.5, 0.625, 0.75]) {
        const base = acidWalkPose(rig, phase * acidStrideLength(rig), 1);
        const pose = acidHitPose(rig, acidWindupPose(rig, base, phase), tuning.hitPeak, 1);
        expect(limitIssues(pose, false, rig)).toEqual([]);
        const supports = posedVoxelSurfaceBoundsForBones(rig, pose, rig.supportBones);
        expect(supports.size).toBeGreaterThan(0);
        expect(Math.min(...supports.values())).toBeCloseTo(0, 8);
        expect(posedVoxelSurfaceBounds(rig, pose).lowest).toBeCloseTo(0, 8);
      }
    }
  });

  it('recoils the head for spit and releases the mouth from the moving skull', () => {
    const anchor = realized.body.anchors!.mouth!;
    expect(anchor.bone).toBe('skull');
    const before = boneTransforms(realized.body.bones, idle);
    const after = boneTransforms(realized.body.bones, acidWindupPose(realized, idle, 1));
    const mouthBefore = applyPoint(before.get(anchor.bone)!, anchor.position);
    const mouthAfter = applyPoint(after.get(anchor.bone)!, anchor.position);
    expect(mouthAfter[2]).toBeGreaterThan(mouthBefore[2]);
    expect(mouthAfter.every(Number.isFinite)).toBe(true);
    const skull = realized.body.bones.find((bone) => bone.id === anchor.bone)!;
    expect(anchor.position[2]).toBeLessThan(skull.head[2]);
  });

  it('clamps layered reactions at the joint boundary, including gaze over a wind-up', () => {
    let pose = windup;
    for (let i = 0; i < 4; i++) {
      pose = acidHitPose(realized, pose, tuning.hitPeak, 1);
    }
    expect(limitIssues(pose)).toEqual([]);
    const result = lookAtPose({
      bones: realized.body.bones,
      pose,
      target: [10, 10, 1],
      profile: LOOK_AT_PROFILES.acid!,
      state: LOOK_AT_REST,
      gazeFrameDelta: 2,
    });
    expect(limitIssues(result.pose)).toEqual([]);
  });

  it('turns skull toward the gaze target without inventing a humanoid head', () => {
    const target = [3, 1.5, -5] as const;
    const before = boneTransforms(realized.body.bones, idle);
    const result = lookAtPose({
      bones: realized.body.bones,
      pose: idle,
      target,
      profile: LOOK_AT_PROFILES.acid!,
      state: LOOK_AT_REST,
      gazeFrameDelta: 2,
    });
    const skull = realized.body.bones.find((bone) => bone.id === 'skull')!;
    const alignment = (transforms: ReturnType<typeof boneTransforms>) => {
      const transform = transforms.get('skull')!;
      return dot(normalize(sub(target, applyPoint(transform, skull.head))), mulMV(transform.r, [0, 0, -1]));
    };
    expect(alignment(result.transforms as ReturnType<typeof boneTransforms>)).toBeGreaterThan(alignment(before));
    expect(result.pose.rotations.skull).not.toEqual(idle.rotations.skull);
    expect(result.pose.rotations.head).toBeUndefined();
    expect(limitIssues(result.pose)).toEqual([]);
  });

  it('falls from the frozen pose, holds its end and grounds the entire corpse in either direction', () => {
    expect(acidDeathPose(realized, hit, 0)).toBe(hit);
    const [, standing] = applyPoint(
      boneTransforms(realized.body.bones, hit).get('skull')!,
      realized.body.bones.find((bone) => bone.id === 'skull')!.head,
    );
    for (const direction of [-1, 1] as const) {
      for (const fraction of [0.25, 0.5, 1]) {
        const pose = acidDeathPose(realized, hit, tuning.deathDuration * fraction, direction);
        expect(limitIssues(pose, true)).toEqual([]);
        expect(posedVoxelSurfaceBounds(realized, pose).lowest).toBeCloseTo(0, 8);
      }
      const final = acidDeathPose(realized, hit, tuning.deathDuration, direction);
      expect(acidDeathPose(realized, hit, tuning.deathDuration * 2, direction)).toEqual(final);
      const skull = realized.body.bones.find((bone) => bone.id === 'skull')!;
      const hips = realized.body.bones.find((bone) => bone.id === 'hips')!;
      const transforms = boneTransforms(realized.body.bones, final);
      const top = applyPoint(transforms.get('skull')!, skull.head);
      const bottom = applyPoint(transforms.get('hips')!, hips.head);
      expect(top[1]).toBeLessThan(standing);
      expect(Math.abs(top[1] - bottom[1])).toBeLessThan(Math.abs(top[2] - bottom[2]));
    }
  });
});
