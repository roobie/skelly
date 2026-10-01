import { describe, expect, it } from 'vitest';
import {
  BLOOM_CLIP_BY_TONE,
  bloomClipFor,
  bloomThreshold,
  clampBloomClip,
  clampExposure,
  clampGrade,
  clampTorch,
  DEFAULT_GRADE,
  DEFAULT_LOOK,
  DEFAULT_MOOD,
  DEFAULT_TORCH,
  GRAIN,
  gradeParams,
  MIN_BLOOM_CLIP,
  TORCH_STEP,
  targetColorScale,
  VIGNETTE,
} from '../src/core/mood.ts';
import { TONE_MODES } from '../src/render/look.ts';
import { displayed, inputForDisplay } from './toneCurves.ts';

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
    expect(DEFAULT_MOOD).toEqual({ post: true, bloom: true, film: true, grade: 1, bloomClip: null });
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
    expect(bloomThreshold(1, 2)).toBe(2);
    expect(bloomThreshold(3, 2)).toBeCloseTo(2 / 3, 12);
    for (const exposure of [0.2, 0.7, 1.5, 3]) {
      expect(bloomThreshold(exposure, 2.5) * exposure).toBeCloseTo(2.5, 12);
    }
  });

  it('falls as exposure rises, rises with the clip and stays finite at zero', () => {
    expect(bloomThreshold(3, 2)).toBeLessThan(bloomThreshold(1, 2));
    expect(bloomThreshold(3, 2)).toBeLessThan(bloomThreshold(3, 5));
    expect(Number.isFinite(bloomThreshold(0, 2))).toBe(true);
  });
});

describe('bloom clip per tone mapper', () => {
  const keys = TONE_MODES.map((mode) => mode.key);

  it('has a value for every tone mode and none for anything else', () => {
    expect(Object.keys(BLOOM_CLIP_BY_TONE).sort()).toEqual([...keys].sort());
    expect(bloomClipFor('sepia')).toBe(1);
  });

  it('is where a grey reaches about 0.95 on screen, to within the tenth it is rounded to', () => {
    for (const tone of keys.filter((key) => key !== 'none')) {
      const derived = inputForDisplay(tone, 0.95);
      expect(Math.abs(bloomClipFor(tone) - derived)).toBeLessThanOrEqual(0.05);
      expect(displayed(tone, bloomClipFor(tone))).toBeGreaterThan(0.94);
      expect(displayed(tone, bloomClipFor(tone))).toBeLessThan(0.96);
    }
  });

  it('re-derives the documented values', () => {
    expect(inputForDisplay('aces', 0.95)).toBeCloseTo(2.039, 2);
    expect(inputForDisplay('agx', 0.95)).toBeCloseTo(5.024, 2);
    expect(inputForDisplay('neutral', 0.95)).toBeCloseTo(1.084, 2);
  });

  it('is the old threshold of 1 for no tone mapping, which clips there', () => {
    expect(bloomClipFor('none')).toBe(1);
    expect(displayed('none', 1)).toBeCloseTo(1, 12);
    expect(displayed('none', 3)).toBeCloseTo(1, 12);
  });

  it('puts a normally lit surface below the threshold: post-exposure 1 shows under 0.9 with ACES', () => {
    // The over-eager bloom this replaces: a threshold of 1 after exposure started at a grey ACES shows as 0.89.
    expect(displayed('aces', 1)).toBeLessThan(0.9);
    expect(bloomClipFor('aces')).toBeGreaterThan(1);
  });

  it('never goes below 1, which keeps the sky, at most 1 after exposure, from blooming', () => {
    for (const key of keys) {
      expect(bloomClipFor(key)).toBeGreaterThanOrEqual(MIN_BLOOM_CLIP);
    }
  });

  it('clamps an override to 1..8 in tenths', () => {
    expect([0, 0.96, 1.04, 2.26, 7.99, 99].map(clampBloomClip)).toEqual([1, 1, 1, 2.3, 8, 8]);
  });
});

describe('flashlight strength multiplier', () => {
  it('rounds to a hundredth and clamps to 0.1..16, with nonsense reading as the default', () => {
    expect(DEFAULT_TORCH).toBe(1);
    expect([0, 1.5625, 99].map(clampTorch)).toEqual([0.1, 1.56, 16]);
    expect(clampTorch(Number.NaN)).toBe(DEFAULT_TORCH);
  });

  it('comes back to where it started after equal steps up and down', () => {
    let strength = DEFAULT_TORCH;
    for (let i = 0; i < 6; i++) {
      strength = clampTorch(strength * TORCH_STEP);
    }
    for (let i = 0; i < 6; i++) {
      strength = clampTorch(strength / TORCH_STEP);
    }
    expect(strength).toBe(DEFAULT_TORCH);
  });
});

describe('target colour scale (sky and fog in the post chain)', () => {
  it('cancels the exposure OutputPass applies, so the sky shows as its own colour', () => {
    for (const exposure of [0.2, 0.7, 1, 3]) {
      expect(targetColorScale(exposure) * exposure).toBeCloseTo(1, 12);
    }
  });

  it('keeps any sky colour (<= 1) at or under the bloom threshold, at every exposure and tone mapper', () => {
    for (const exposure of [0.2, 0.7, 1, 3]) {
      for (const { key } of TONE_MODES) {
        expect(targetColorScale(exposure)).toBeLessThanOrEqual(bloomThreshold(exposure, bloomClipFor(key)) + 1e-12);
      }
      expect(targetColorScale(exposure)).toBeLessThanOrEqual(bloomThreshold(exposure, MIN_BLOOM_CLIP) + 1e-12);
    }
  });

  it('stays finite at zero exposure', () => {
    expect(Number.isFinite(targetColorScale(0))).toBe(true);
  });
});
