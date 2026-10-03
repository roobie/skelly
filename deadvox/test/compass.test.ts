import { expect, it } from 'vitest';
import { compassBearing } from '../src/render/compass.ts';

it('converts counterclockwise camera yaw to clockwise map bearing, wrapping both sides of north', () => {
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
});
