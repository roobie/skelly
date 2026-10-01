import { describe, expect, it } from 'vitest';
import { clampGrade, DEFAULT_GRADE, DEFAULT_MOOD, GRAIN, gradeParams, VIGNETTE } from '../src/core/mood.ts';

// The shaders (grade pass, height fog) can't be unit-tested here: there is no WebGL in the test
// environment. These cover the numbers they are fed.
describe('colour grade parameters', () => {
  it('is the identity at strength 0', () => {
    const none = gradeParams(0);
    expect([none.saturation, none.contrast]).toEqual([1, 0]);
    // Compared by magnitude: a negative tint scaled by 0 is -0, which toEqual tells apart from 0.
    expect([...none.shadowTint, ...none.highlightTint].map(Math.abs)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('desaturates by about a fifth at full strength, cool in the shadows and warm in the highlights', () => {
    const full = gradeParams(1);
    expect(full.saturation).toBeGreaterThanOrEqual(0.75);
    expect(full.saturation).toBeLessThanOrEqual(0.85);
    expect(full.shadowTint[2]).toBeGreaterThan(full.shadowTint[0]); // blue over red
    expect(full.highlightTint[0]).toBeGreaterThan(full.highlightTint[2]); // red over blue
    expect(full.contrast).toBeGreaterThan(0);
    expect(full.contrast).toBeLessThan(0.5);
  });

  it('scales linearly with strength and clamps outside 0..1', () => {
    const half = gradeParams(0.5);
    const full = gradeParams(1);
    expect(1 - half.saturation).toBeCloseTo((1 - full.saturation) / 2, 12);
    expect(half.contrast).toBeCloseTo(full.contrast / 2, 12);
    expect(half.highlightTint[0]).toBeCloseTo(full.highlightTint[0] / 2, 12);
    expect(gradeParams(3)).toEqual(full);
    expect(gradeParams(-1)).toEqual(gradeParams(0));
  });

  it('keeps film amplitudes subtle', () => {
    expect(VIGNETTE).toBeLessThanOrEqual(0.4);
    expect(GRAIN).toBeLessThanOrEqual(0.05);
  });
});

describe('grade strength steps', () => {
  it('rounds to a tenth and clamps to 0..1', () => {
    expect(clampGrade(0.300_000_000_000_000_04)).toBe(0.3);
    expect(clampGrade(1.04)).toBe(1);
    expect(clampGrade(-0.3)).toBe(0);
    let strength = DEFAULT_GRADE;
    for (let i = 0; i < 7; i++) {
      strength = clampGrade(strength - 0.1);
    }
    expect(strength).toBe(0.3);
  });

  it('defaults to everything on at full strength', () => {
    expect(DEFAULT_MOOD).toEqual({ post: true, bloom: true, film: true, grade: 1, heightFog: true });
  });
});
