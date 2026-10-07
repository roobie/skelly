import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint, dot, type Mat3, mulMM, mulMV, normalize, transpose } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { LOOK_AT_REST, lookAtPose } from '../src/mob/lookAt.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const template = TEMPLATES.find((candidate) => candidate.name === 'shambler')!;
const realized = realize(generate(template, 7));
const restPose: Pose = { root: [0, 0, 0], rotations: {} };
const baseTransforms = boneTransforms(realized.body.bones, restPose);
const forward = (rotation: Mat3): readonly [number, number, number] => mulMV(rotation, [0, 0, -1]);
const angleTo = (a: readonly number[], b: readonly number[]): number =>
  Math.acos(
    Math.max(-1, Math.min(1, dot(normalize(a as [number, number, number]), normalize(b as [number, number, number])))),
  );
const profile = {
  neck: { yawDeg: 30, pitchDeg: 25 },
  head: { yawDeg: 35, pitchDeg: 30 },
  turnRateDegPerSecond: 180,
} as const;

describe('look-at pose', () => {
  it('turns the neck and head toward the target eye point', () => {
    const target = [2, 1, -6] as const;
    const result = lookAtPose({
      bones: realized.body.bones,
      pose: restPose,
      target,
      profile,
      state: LOOK_AT_REST,
      gazeFrameDelta: 2,
      baseTransforms,
    });
    const headBone = realized.body.bones.find((bone) => bone.id === 'head')!;
    const headCenter = applyPoint(result.transforms.get('head')!, [
      (headBone.head[0] + headBone.tail[0]) / 2,
      (headBone.head[1] + headBone.tail[1]) / 2,
      (headBone.head[2] + headBone.tail[2]) / 2,
    ]);
    const direction = [target[0] - headCenter[0], target[1] - headCenter[1], target[2] - headCenter[2]] as const;
    expect(angleTo(forward(result.transforms.get('head')!.r), direction)).toBeLessThan(0.01);
    expect(result.pose.rotations.neck).toBeDefined();
  });

  it('keeps each joint within its authored gaze limits', () => {
    const narrow = {
      neck: { yawDeg: 7, pitchDeg: 6 },
      head: { yawDeg: 9, pitchDeg: 8 },
      turnRateDegPerSecond: 360,
    } as const;
    const result = lookAtPose({
      bones: realized.body.bones,
      pose: restPose,
      target: [8, 4, -1],
      profile: narrow,
      state: LOOK_AT_REST,
      gazeFrameDelta: 1,
      baseTransforms,
    });
    const neckDelta = mulMM(result.transforms.get('neck')!.r, transpose(baseTransforms.get('neck')!.r));
    const headBaseAfterNeck = mulMM(neckDelta, baseTransforms.get('head')!.r);
    const headDelta = mulMM(result.transforms.get('head')!.r, transpose(headBaseAfterNeck));
    const correctionAngles = (rotation: Mat3): readonly [number, number] => {
      const [x, y, z] = forward(rotation);
      return [Math.atan2(-x, -z) * (180 / Math.PI), Math.atan2(y, Math.hypot(x, z)) * (180 / Math.PI)];
    };
    const [neckYaw, neckPitch] = correctionAngles(neckDelta);
    const [headYaw, headPitch] = correctionAngles(headDelta);
    expect(Math.abs(neckYaw)).toBeLessThanOrEqual(narrow.neck.yawDeg + 0.1);
    expect(Math.abs(neckPitch)).toBeLessThanOrEqual(narrow.neck.pitchDeg + 0.1);
    expect(Math.abs(headYaw)).toBeLessThanOrEqual(narrow.head.yawDeg + 0.1);
    expect(Math.abs(headPitch)).toBeLessThanOrEqual(narrow.head.pitchDeg + 0.1);
  });

  it('bounds gaze turn speed independently of frame duration', () => {
    const result = lookAtPose({
      bones: realized.body.bones,
      pose: restPose,
      target: [10, 1, 0],
      profile,
      state: LOOK_AT_REST,
      gazeFrameDelta: 0.1,
      baseTransforms,
    });
    const dotWithRest = Math.abs(result.state[3]);
    const turnedRadians = 2 * Math.acos(Math.min(1, dotWithRest));
    expect(turnedRadians).toBeLessThanOrEqual(((profile.turnRateDegPerSecond * Math.PI) / 180) * 0.1 + 1e-6);
  });
});
