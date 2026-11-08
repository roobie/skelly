import { describe, expect, it } from 'vitest';
import { massProperties, voxelBounds } from '../src/core/massProperties.ts';

const SIZE = 0.1;
const DENSITY = 1000;

describe('voxel mass properties', () => {
  it('gives one cube its solid-cube mass and inertia about its centre', () => {
    const { mass, center, inertia } = massProperties([[1, 2, 3]], SIZE, DENSITY);
    const cubeMass = DENSITY * SIZE ** 3;
    expect(mass).toBeCloseTo(cubeMass, 12);
    expect(center).toEqual([1, 2, 3]);
    const own = (cubeMass * SIZE * SIZE) / 6;
    expect(inertia).toEqual([
      [own, 0, 0],
      [0, own, 0],
      [0, 0, own],
    ]);
  });

  it('adds the parallel-axis term for cubes off the centre of mass', () => {
    const { center, inertia } = massProperties(
      [
        [0, 0, 0],
        [SIZE, 0, 0],
      ],
      SIZE,
      DENSITY,
    );
    const cubeMass = DENSITY * SIZE ** 3;
    const own = (cubeMass * SIZE * SIZE) / 6;
    const offset = cubeMass * 2 * (SIZE / 2) ** 2;
    expect(center[0]).toBeCloseTo(SIZE / 2, 12);
    expect(inertia[0][0]).toBeCloseTo(2 * own, 12);
    expect(inertia[1][1]).toBeCloseTo(2 * own + offset, 12);
    expect(inertia[2][2]).toBeCloseTo(2 * own + offset, 12);
  });

  it('refuses an empty selection and a non-positive density', () => {
    expect(() => massProperties([], SIZE, DENSITY)).toThrow(RangeError);
    expect(() => massProperties([[0, 0, 0]], SIZE, 0)).toThrow(RangeError);
  });
});

describe('voxel bounds', () => {
  it('encloses whole cubes and reports corners relative to the reference', () => {
    const bounds = voxelBounds(
      [
        [0, 0, 0],
        [SIZE, 0, 0],
      ],
      SIZE,
      [SIZE / 2, 0, 0],
    );
    expect(bounds.center[0]).toBeCloseTo(SIZE / 2, 12);
    expect(bounds.halfExtents[0]).toBeCloseTo(SIZE, 12);
    expect(bounds.halfExtents[1]).toBeCloseTo(SIZE / 2, 12);
    const expected = [-SIZE, SIZE].flatMap((x) =>
      [-SIZE / 2, SIZE / 2].flatMap((y) => [-SIZE / 2, SIZE / 2].map((z) => [x, y, z])),
    );
    expect(bounds.corners).toHaveLength(expected.length);
    for (const corner of expected) {
      const found = bounds.corners.some((actual) =>
        actual.every((value, axis) => Math.abs(value - corner[axis]!) < 1e-12),
      );
      expect(found, `corner ${corner.join(', ')}`).toBe(true);
    }
  });
});
