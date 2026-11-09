import { describe, expect, it } from 'vitest';
import { actorFigure } from '../src/core/actorFigureFiles.ts';
import {
  applyPoint,
  dot,
  type Mat3,
  mulMM,
  mulMV,
  normalize,
  type Transform,
  transpose,
} from '../src/core/boneMath.ts';
import { bodySkeleton } from '../src/core/bones.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { LOOK_AT_REST, lookAtPose } from '../src/render/lookAt.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

// A shipped humanoid's built skeleton, which has the neck and head bones gaze turns.
const registry = baseRegistry();
const shambler = registry.actors.get('shambler')!;
const bones = bodySkeleton(actorFigure(stackActorFigureFiles(registry), shambler, shambler.figureSeeds![0]!).body);
const restPose: Pose = { root: [0, 0, 0], rotations: {} };
const baseTransforms = boneTransforms(bones, restPose);
const forward = (rotation: Mat3): readonly [number, number, number] => mulMV(rotation, [0, 0, -1]);
const angleTo = (a: readonly number[], b: readonly number[]): number =>
  Math.acos(
    Math.max(-1, Math.min(1, dot(normalize(a as [number, number, number]), normalize(b as [number, number, number])))),
  );
const profile = {
  neck: { yawDeg: 30, pitchDeg: 25 },
  head: { yawDeg: 35, pitchDeg: 30 },
  turnRateDegPerRealSecond: 180,
} as const;

describe('look-at pose', () => {
  it('turns the neck and head toward the target eye point', () => {
    const target = [2, 1, -6] as const;
    const result = lookAtPose({
      bones,
      pose: restPose,
      target,
      profile,
      state: LOOK_AT_REST,
      gazeFrameDelta: 2,
      baseTransforms,
    });
    const headBone = bones.find((bone) => bone.id === 'head')!;
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
      turnRateDegPerRealSecond: 360,
    } as const;
    const target = [8, 4, -1] as const;
    const result = lookAtPose({
      bones,
      pose: restPose,
      target,
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

    const headBone = bones.find((bone) => bone.id === 'head')!;
    const headCenter = [
      (headBone.head[0] + headBone.tail[0]) / 2,
      (headBone.head[1] + headBone.tail[1]) / 2,
      (headBone.head[2] + headBone.tail[2]) / 2,
    ] as const;
    const angleToTarget = (transforms: ReadonlyMap<string, Transform>): number => {
      const headTransform = transforms.get('head')!;
      const center = applyPoint(headTransform, headCenter);
      return angleTo(forward(headTransform.r), [target[0] - center[0], target[1] - center[1], target[2] - center[2]]);
    };
    expect(angleToTarget(result.transforms)).toBeLessThan(angleToTarget(baseTransforms));

    const totalCorrection = mulMM(result.transforms.get('head')!.r, transpose(baseTransforms.get('head')!.r));
    const [totalYaw] = correctionAngles(totalCorrection);
    expect(totalYaw * target[0]).toBeLessThan(0);

    const limitGap = Math.min(
      Math.abs(narrow.neck.yawDeg - Math.abs(neckYaw)),
      Math.abs(narrow.neck.pitchDeg - Math.abs(neckPitch)),
      Math.abs(narrow.head.yawDeg - Math.abs(headYaw)),
      Math.abs(narrow.head.pitchDeg - Math.abs(headPitch)),
    );
    expect(limitGap).toBeLessThanOrEqual(0.1);
  });

  it('eases gaze back to the base pose within the turn-rate bound when tracking ends', () => {
    const tracking = lookAtPose({
      bones,
      pose: restPose,
      target: [10, 1, 0],
      profile,
      state: LOOK_AT_REST,
      gazeFrameDelta: 1,
      baseTransforms,
    });
    const gazeAngle = (state: readonly number[]): number => 2 * Math.acos(Math.min(1, Math.abs(state[3]!)));
    const before = gazeAngle(tracking.state);
    const returning = lookAtPose({
      bones,
      pose: restPose,
      target: undefined,
      profile,
      state: tracking.state,
      gazeFrameDelta: 0.1,
      baseTransforms,
    });
    const after = gazeAngle(returning.state);

    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThanOrEqual(((profile.turnRateDegPerRealSecond * Math.PI) / 180) * 0.1 + 1e-6);
  });

  it.each([0.1, 0.25])('bounds gaze turn speed independently of frame duration at dt %f', (gazeFrameDelta) => {
    const result = lookAtPose({
      bones,
      pose: restPose,
      target: [10, 1, 0],
      profile,
      state: LOOK_AT_REST,
      gazeFrameDelta,
      baseTransforms,
    });
    const dotWithRest = Math.abs(result.state[3]);
    const turnedRadians = 2 * Math.acos(Math.min(1, dotWithRest));
    expect(turnedRadians).toBeLessThanOrEqual(
      ((profile.turnRateDegPerRealSecond * Math.PI) / 180) * gazeFrameDelta + 1e-6,
    );
  });
});
