import { describe, expect, it } from 'vitest';
import { opticWindowDistance } from '../src/core/opticWindow.ts';

describe('optic window', () => {
  it('derives eye distance from ocular diameter and desired vertical fill', () => {
    const diameter = 0.03;
    const fill = 0.82;
    const fov = 75;
    const distance = opticWindowDistance(diameter, fill, fov);
    expect(diameter / (2 * distance * Math.tan((fov * Math.PI) / 360))).toBeCloseTo(fill);
  });
});
