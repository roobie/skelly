import { describe, expect, it } from 'vitest';
import {
  allowanceBand,
  angleDegrees,
  calibrateMmPerPixel,
  centreSpacingMm,
  compareScales,
  featureSpans,
} from '../src/gun/trace.ts';

const origin = [0, 0] as const;
const diagonal = [3, 4] as const;

describe('trace arithmetic', () => {
  it('calibrates a Euclidean datum independently of translation and endpoint order', () => {
    const lengthMm = 20;
    const scale = calibrateMmPerPixel(origin, diagonal, lengthMm);
    expect(scale).toBeCloseTo(lengthMm / 5);
    expect(calibrateMmPerPixel([13, -6], [10, -10], lengthMm)).toBeCloseTo(scale);
    expect(centreSpacingMm(origin, diagonal, scale)).toBeCloseTo(lengthMm);
    expect(centreSpacingMm(diagonal, origin, scale)).toBeCloseTo(lengthMm);
    expect(centreSpacingMm(origin, origin, scale)).toBe(0);
  });

  it('measures axis-aligned envelopes rather than path length, without depending on vertex order', () => {
    const points = [
      [8, 7],
      [2, 3],
      [5, 10],
    ] as const;
    const spans = featureSpans(points, 2);
    expect(spans).toEqual({ widthMm: 12, heightMm: 14 });
    expect(featureSpans([...points].reverse(), 2)).toEqual(spans);
    expect(
      featureSpans(
        [
          [18, 0],
          [12, -4],
          [15, 3],
        ],
        4,
      ),
    ).toEqual({ widthMm: 24, heightMm: 28 });
    expect(featureSpans([origin], 2)).toEqual({ widthMm: 0, heightMm: 0 });
  });

  it('compares candidate scales with signed percentage deltas relative to the baseline', () => {
    expect(compareScales(4, 5)).toEqual({ ratio: 1.25, deltaPercent: 25 });
    expect(compareScales(5, 4)).toEqual({ ratio: 0.8, deltaPercent: -20 });
    expect(compareScales(4, 4)).toEqual({ ratio: 1, deltaPercent: 0 });
  });

  it('centres a relative allowance on the supplied value without calling it a confidence interval', () => {
    for (const value of [-20, 0, 20]) {
      const band = allowanceBand(value, 10);
      expect((band.min + band.max) / 2).toBeCloseTo(value);
      expect(band.max - band.min).toBeCloseTo(Math.abs(value) * 0.2);
    }
    expect(allowanceBand(20, 0)).toEqual({ min: 20, max: 20 });
  });

  it('uses signed coordinate-frame angles with perpendicular and diagonal identities', () => {
    expect(angleDegrees(origin, [2, 0])).toBe(0);
    expect(angleDegrees(origin, [0, 2])).toBe(90);
    expect(angleDegrees(origin, [0, -2])).toBe(-90);
    expect(angleDegrees([3, 8], [7, 12])).toBe(45);
    expect(Math.abs(angleDegrees(origin, diagonal) - angleDegrees(diagonal, origin))).toBeCloseTo(180);
  });

  it('rejects undefined geometry and invalid measurement inputs instead of producing NaN', () => {
    expect(() => calibrateMmPerPixel(origin, origin, 20)).toThrow(RangeError);
    expect(() => calibrateMmPerPixel(origin, diagonal, 0)).toThrow(RangeError);
    expect(() => angleDegrees(origin, origin)).toThrow(RangeError);
    expect(() => featureSpans([], 1)).toThrow(RangeError);
    expect(() => featureSpans([[Number.NaN, 0]], 1)).toThrow(RangeError);
    expect(() => centreSpacingMm(origin, diagonal, -1)).toThrow(RangeError);
    expect(() => compareScales(0, 1)).toThrow(RangeError);
    expect(() => compareScales(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => allowanceBand(20, -1)).toThrow(RangeError);
    expect(() => allowanceBand(Number.POSITIVE_INFINITY, 1)).toThrow(RangeError);
  });
});
