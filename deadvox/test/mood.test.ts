import { describe, expect, it } from 'vitest';
import {
  BLOOM_CLIP,
  bloomThreshold,
  clampExposure,
  clampGrade,
  DEFAULT_GRADE,
  DEFAULT_LOOK,
  DEFAULT_MOOD,
  GRAIN,
  gradeParams,
  targetColorScale,
  VIGNETTE,
} from '../src/core/mood.ts';
import { TONE_MODES } from '../src/render/look.ts';

// The shaders (grade pass, height fog, bloom) and shader warm-up can't be unit-tested here: there is
// no WebGL in the test environment. These cover the numbers they are fed.
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
    expect(DEFAULT_MOOD).toEqual({ post: true, bloom: true, film: true, grade: 1 });
  });
});

describe('the default look', () => {
  it('is the operator-chosen one', () => {
    expect(DEFAULT_LOOK).toEqual({ tone: 'aces', exposure: 3, srgb: true, patterns: true, vao: true });
    expect(TONE_MODES.map((mode) => mode.key)).toContain(DEFAULT_LOOK.tone);
  });

  it('keeps exposure in range, in tenths', () => {
    expect(clampExposure(DEFAULT_LOOK.exposure)).toBe(DEFAULT_LOOK.exposure);
    expect(clampExposure(9)).toBe(3);
    expect(clampExposure(0)).toBe(0.2);
    expect(clampExposure(1.26)).toBe(1.3);
  });
});

describe('bloom threshold', () => {
  it('is the clip value divided by exposure, so the same on-screen brightness blooms at any exposure', () => {
    expect(bloomThreshold(1)).toBe(BLOOM_CLIP);
    expect(bloomThreshold(3)).toBeCloseTo(BLOOM_CLIP / 3, 12);
    for (const exposure of [0.2, 0.7, 1.5, 3]) {
      expect(bloomThreshold(exposure) * exposure).toBeCloseTo(BLOOM_CLIP, 12);
    }
  });

  it('falls as exposure rises and stays finite at zero', () => {
    expect(bloomThreshold(3)).toBeLessThan(bloomThreshold(1));
    expect(Number.isFinite(bloomThreshold(0))).toBe(true);
  });
});

describe('target colour scale (sky and fog in the post chain)', () => {
  it('cancels the exposure OutputPass applies, so the sky shows as its own colour', () => {
    for (const exposure of [0.2, 0.7, 1, 3]) {
      expect(targetColorScale(exposure) * exposure).toBeCloseTo(1, 12);
    }
  });

  it('keeps any sky colour (<= 1) at or under the bloom threshold, at every exposure', () => {
    for (const exposure of [0.2, 0.7, 1, 3]) {
      expect(targetColorScale(exposure)).toBeLessThanOrEqual(bloomThreshold(exposure) + 1e-12);
    }
  });

  it('stays finite at zero exposure', () => {
    expect(Number.isFinite(targetColorScale(0))).toBe(true);
  });
});
