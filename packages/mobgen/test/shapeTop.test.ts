import { expect, it } from 'vitest';
import { rotZ } from '../src/core/math.ts';
import { type Shape, topOf } from '../src/core/sdf.ts';

const fixtures: { name: string; shape: Shape; top: number }[] = [
  {
    name: 'rotated ellipsoid',
    shape: { kind: 'ellipsoid', center: [0, 0, 0], radii: [1, 2, 1], rot: rotZ(45) },
    top: Math.sqrt(5 / 2),
  },
  {
    name: 'rotated rounded box',
    shape: { kind: 'box', center: [0, 0, 0], half: [2, 3, 1], round: 1, rot: rotZ(45) },
    top: 1 + 3 / Math.sqrt(2),
  },
  {
    name: 'projection-capped tapered capsule with its wider end lower',
    shape: { kind: 'capsule', a: [0, 1, 0], b: [0, 2, 0], ra: 2, rb: 0.5 },
    top: 2.5,
  },
];

it.each(fixtures)('standing support uses the surface rather than a conservative AABB: $name', ({ shape, top }) => {
  expect(topOf(shape)).toBeCloseTo(top, 10);
});
