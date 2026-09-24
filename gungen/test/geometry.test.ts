import { describe, expect, it } from 'vitest';
import { type OBB, boxFromMinMax, penetration, worldBox } from '../src/core/geometry.ts';
import { IDENTITY, rotZ } from '../src/core/math.ts';

const aabb = (min: [number, number, number], max: [number, number, number]): OBB =>
  worldBox(IDENTITY, boxFromMinMax(min, max));

describe('penetration', () => {
  const unit = aabb([0, 0, 0], [1, 1, 1]);

  it('is negative for separated boxes', () => {
    expect(penetration(unit, aabb([2, 0, 0], [3, 1, 1]))).toBeCloseTo(-1);
  });

  it('is zero for touching boxes', () => {
    expect(penetration(unit, aabb([1, 0, 0], [2, 1, 1]))).toBeCloseTo(0);
  });

  it('is the shallowest overlap for overlapping boxes', () => {
    expect(penetration(unit, aabb([0.75, 0.5, 0], [2, 2, 1]))).toBeCloseTo(0.25);
  });

  it('handles rotated boxes', () => {
    // A unit cube rotated 45° about Z reaches √2/2 from its centre along X.
    const diamond: OBB = { center: [2, 0.5, 0.5], r: rotZ(45), half: [0.5, 0.5, 0.5] };
    const reach = Math.SQRT1_2;
    expect(penetration(unit, diamond)).toBeCloseTo(reach - 1);
    const closer: OBB = { ...diamond, center: [1.5, 0.5, 0.5] };
    expect(penetration(unit, closer)).toBeCloseTo(reach - 0.5);
  });
});
