// biome-ignore-all lint/suspicious/noMisplacedAssertion: the shared arm-length assertion is called only by tests.
import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type ArmRig, type ArmTarget, solveArmRig } from '../src/render/armRig.ts';

const rigOf = (upperLength: number, foreLength: number): ArmRig => ({
  side: 'right',
  shoulder: new Object3D(),
  elbow: new Object3D(),
  hand: new Object3D(),
  upperLength,
  foreLength,
  gripFromWrist: new Vector3(0.01, 0.03, 0.02),
});

const target = (grip: Vector3, handFrame?: Quaternion): ArmTarget => ({
  shoulder: new Vector3(0.3, -0.55, 0.05),
  grip,
  ...(handFrame ? { handFrame } : {}),
  bendSide: new Vector3(1, 0, 0),
  up: new Vector3(0, 1, 0),
});

/** Both segments keep their authored lengths and every rotation stays a unit quaternion. */
const expectIntactArm = (rig: ArmRig, at: ArmTarget): void => {
  const solved = solveArmRig(rig, at);
  const wrist = at.grip.clone().sub(rig.gripFromWrist.clone().applyQuaternion(solved.hand));
  expect(solved.elbow.distanceTo(solved.shoulder)).toBeCloseTo(rig.upperLength, 6);
  expect(wrist.distanceTo(solved.elbow)).toBeCloseTo(rig.foreLength, 6);
  for (const rotation of [solved.upper, solved.fore, solved.hand]) {
    expect(rotation.length()).toBeCloseTo(1, 6);
  }
};

describe('solveArmRig', () => {
  it('keeps both segment lengths for a grip closer to the shoulder than the folded arm reaches', () => {
    for (const rig of [rigOf(0.3, 0.2), rigOf(0.2, 0.3)]) {
      const near = target(new Vector3(0.3, -0.6, 0.05));
      expect(near.grip.distanceTo(near.shoulder)).toBeLessThan(Math.abs(rig.upperLength - rig.foreLength));
      expectIntactArm(rig, near);
      expectIntactArm(rig, target(near.grip, new Quaternion()));
    }
  });

  it('keeps both segment lengths and unit rotations for a grip on the shoulder', () => {
    for (const rig of [rigOf(0.3, 0.2), rigOf(0.25, 0.25)]) {
      const at = target(new Vector3(0.3, -0.55, 0.05));
      at.grip.sub(rig.gripFromWrist.clone().applyQuaternion(solveArmRig(rig, at).hand));
      // The wrist now lands on the shoulder itself.
      expectIntactArm(rig, at);
      expectIntactArm(rig, target(at.grip.clone(), new Quaternion()));
    }
  });

  it('keeps both segment lengths with the shoulder in place for an ordinary reachable grip', () => {
    const rig = rigOf(0.3, 0.2);
    const at = target(new Vector3(0.1, -0.5, -0.3));
    expectIntactArm(rig, at);
    expect(solveArmRig(rig, at).shoulder.distanceTo(at.shoulder)).toBeLessThan(1e-6);
  });
});
