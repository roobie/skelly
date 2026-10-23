import { expect, it } from 'vitest';
import { compassBearing, yawFromBearing } from '../src/core/coords.ts';

it('converts between counterclockwise camera yaw and clockwise map bearing, wrapping north', () => {
  for (const [yaw, bearing] of [
    [0, 0],
    [-Math.PI / 2, 90],
    [Math.PI, 180],
    [Math.PI / 2, 270],
    [Math.PI * 2, 0],
    [-Math.PI * 2, 0],
    [Math.PI / 180, 359],
    [-Math.PI / 180, 1],
  ] as const) {
    expect(compassBearing(yaw)).toBeCloseTo(bearing, 8);
  }
  expect(yawFromBearing(90)).toBeCloseTo(-Math.PI / 2, 8);
});
