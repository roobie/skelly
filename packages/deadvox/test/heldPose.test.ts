import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { blendHeldFirearmTransforms, type HeldFirearmTransform } from '../src/core/heldPose.ts';

const transform = (rootRotation: readonly [Vec3, Vec3, Vec3]): HeldFirearmTransform => ({
  rootOffset: [0.2, -0.1, 0.4],
  muzzleOffset: [0.05, 0, 0.5],
  muzzleDirection: rootRotation[2],
  muzzleUp: rootRotation[1],
  rootRotation,
});

const basisDeviations = (rotation: readonly [Vec3, Vec3, Vec3]) => {
  const pairs = [
    [rotation[0], rotation[1]],
    [rotation[0], rotation[2]],
    [rotation[1], rotation[2]],
  ] as const;
  const crossed: Vec3 = [
    rotation[0][1] * rotation[1][2] - rotation[0][2] * rotation[1][1],
    rotation[0][2] * rotation[1][0] - rotation[0][0] * rotation[1][2],
    rotation[0][0] * rotation[1][1] - rotation[0][1] * rotation[1][0],
  ];
  return {
    unitError: Math.max(...rotation.map((column) => Math.abs(Math.hypot(...column) - 1))),
    rightAngleError: Math.max(...pairs.map(([a, b]) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))),
    handedError: Math.abs(crossed[0] * rotation[2][0] + crossed[1] * rotation[2][1] + crossed[2] * rotation[2][2] - 1),
  };
};

describe('blendHeldFirearmTransforms', () => {
  // Identity and a half turn about the back axis are both valid right-handed bases whose lerped
  // first column cancels to zero; the blend must stay defined and orthonormal between them.
  const identity = transform([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  const halfTurn = transform([
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
  ]);

  it('returns each endpoint exactly at the blend bounds, half-turn pair included', () => {
    expect(blendHeldFirearmTransforms(identity, halfTurn, 0)).toBe(identity);
    expect(blendHeldFirearmTransforms(identity, halfTurn, 1)).toBe(halfTurn);
  });

  it('keeps an orthonormal right-handed interior at the half turn, where column lerping cancels', () => {
    const carried = blendHeldFirearmTransforms(identity, halfTurn, 0.5);
    const deviations = basisDeviations(carried.rootRotation);
    expect(deviations.unitError).toBeCloseTo(0, 9);
    expect(deviations.rightAngleError).toBeCloseTo(0, 9);
    expect(deviations.handedError).toBeCloseTo(0, 9);
    expect(carried.rootRotation).not.toEqual(identity.rootRotation);
    expect(carried.rootRotation).not.toEqual(halfTurn.rootRotation);
  });

  it('keeps an orthonormal interior for a quarter turn as well', () => {
    const quarter = transform([
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ]);
    expect(blendHeldFirearmTransforms(identity, quarter, 0)).toBe(identity);
    expect(blendHeldFirearmTransforms(identity, quarter, 1)).toBe(quarter);
    for (const share of [0.25, 0.5]) {
      const deviations = basisDeviations(blendHeldFirearmTransforms(identity, quarter, share).rootRotation);
      expect(deviations.unitError).toBeCloseTo(0, 9);
      expect(deviations.rightAngleError).toBeCloseTo(0, 9);
      expect(deviations.handedError).toBeCloseTo(0, 9);
    }
  });
});
