import { expect, it } from 'vitest';
import { obbPolyhedron, worldBox } from '../src/core/geometry.ts';
import { IDENTITY, type Vec3 } from '../src/core/math.ts';
import { rotationSweepClear, translationSweepClear } from '../src/core/motionSweep.ts';

const small = (center: Vec3) => obbPolyhedron(worldBox(IDENTITY, { center, half: [0.1, 0.1, 0.1] }));

it('rejects a middle-angle strike even when both end poses clear', () => {
  expect(rotationSweepClear(small([0, 4, 0]), small([0, Math.sqrt(8), Math.sqrt(8)]), [0, 90])).toBe(false);
});
it('certifies a clear curved path whose enclosing rectangle crosses an obstacle', () => {
  expect(rotationSweepClear(small([0, 4, 0]), small([0, 1, 1]), [0, 90])).toBe(true);
});
it('preserves internal extrema when an angle datum wraps through multiple turns', () => {
  expect(rotationSweepClear(small([0, 0, 4]), small([0, 0, 4]), [675, 765])).toBe(false);
});
it('rejects translation through an obstacle despite clear end poses', () => {
  expect(translationSweepClear(small([0, 0, 0]), small([2, 0, 0]), [4, 0, 0])).toBe(false);
});
