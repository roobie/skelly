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

/** Where the solved hand frame puts the wrist. */
const wristOf = (rig: ArmRig, at: ArmTarget, hand: Quaternion): Vector3 =>
  at.grip.clone().sub(rig.gripFromWrist.clone().applyQuaternion(hand));

/** Both segments meet the pinned shoulder and wrist, and every rotation stays a unit quaternion. */
const expectIntactArm = (rig: ArmRig, at: ArmTarget): void => {
  const solved = solveArmRig(rig, at);
  const wrist = wristOf(rig, at, solved.hand);
  expect(solved.shoulder.distanceTo(at.shoulder)).toBeLessThan(1e-9);
  expect(solved.elbow.distanceTo(solved.shoulder)).toBeCloseTo(rig.upperLength * solved.upperScale, 6);
  expect(wrist.distanceTo(solved.elbow)).toBeCloseTo(rig.foreLength * solved.foreScale, 6);
  for (const rotation of [solved.upper, solved.fore, solved.hand]) {
    expect(rotation.length()).toBeCloseTo(1, 6);
  }
};

describe('solveArmRig', () => {
  it('redistributes segment length without moving the shoulder for a grip inside folded reach', () => {
    for (const rig of [rigOf(0.3, 0.2), rigOf(0.2, 0.3)]) {
      const near = target(new Vector3(0.3, -0.6, 0.05));
      expect(near.grip.distanceTo(near.shoulder)).toBeLessThan(Math.abs(rig.upperLength - rig.foreLength));
      expectIntactArm(rig, near);
      expectIntactArm(rig, target(near.grip, new Quaternion()));
    }
  });

  it('keeps joints connected and rotations finite for a wrist on the shoulder', () => {
    const { shoulder } = target(new Vector3());
    const frame = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3);
    for (const rig of [rigOf(0.3, 0.2), rigOf(0.25, 0.25)]) {
      // A fixed hand frame puts the grip one rotated wrist-to-grip offset past the shoulder.
      const fixed = target(shoulder.clone().add(rig.gripFromWrist.clone().applyQuaternion(frame)), frame);
      expect(wristOf(rig, fixed, solveArmRig(rig, fixed).hand).distanceTo(shoulder)).toBeLessThan(1e-9);
      expectIntactArm(rig, fixed);
      // A free hand frame: no offset, so the grip itself is the wrist.
      const bare: ArmRig = { ...rig, gripFromWrist: new Vector3() };
      const onShoulder = target(shoulder.clone());
      expect(wristOf(bare, onShoulder, solveArmRig(bare, onShoulder).hand).distanceTo(shoulder)).toBeLessThan(1e-9);
      expectIntactArm(bare, onShoulder);
    }
  });

  it('stretches an unreachable arm along its segments without moving its shoulder', () => {
    const rig = rigOf(0.3, 0.2);
    const at = target(new Vector3(0.1, -0.5, -1.3), new Quaternion());
    expectIntactArm(rig, at);
    const solved = solveArmRig(rig, at);
    expect(solved.upperScale).toBeGreaterThan(1);
    expect(solved.upperScale).toBeCloseTo(solved.foreScale, 6);
  });

  it('keeps both segment lengths with the shoulder in place for an ordinary reachable grip', () => {
    const rig = rigOf(0.3, 0.2);
    const at = target(new Vector3(0.1, -0.5, -0.3));
    expectIntactArm(rig, at);
    const solved = solveArmRig(rig, at);
    expect(solved.upperScale).toBe(1);
    expect(solved.foreScale).toBe(1);
  });
});
