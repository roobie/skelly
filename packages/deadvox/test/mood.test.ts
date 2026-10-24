import { describe, expect, it } from 'vitest';
import {
  AUTO_TONE,
  BLOOM_CLIP_BY_TONE,
  bloomClipFor,
  bloomThreshold,
  clampBloomClip,
  clampExposure,
  clampGrade,
  clampTorch,
  DEFAULT_TORCH,
  gradeParams,
  MIN_BLOOM_CLIP,
  TORCH_STEP,
  targetColorScale,
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

  it('scales linearly with strength and clamps outside 0..1', () => {
    const half = gradeParams(0.5);
    const full = gradeParams(1);
    expect(1 - half.saturation).toBeCloseTo((1 - full.saturation) / 2, 12);
    expect(half.contrast).toBeCloseTo(full.contrast / 2, 12);
    expect(half.highlightTint[0]).toBeCloseTo(full.highlightTint[0] / 2, 12);
    expect(gradeParams(3)).toEqual(full);
    expect(gradeParams(-1)).toEqual(gradeParams(0));
  });
});

describe('grade strength steps', () => {
  it('rounds consistently and clamps at its owner-defined endpoints', () => {
    const lower = clampGrade(Number.NEGATIVE_INFINITY);
    const upper = clampGrade(Number.POSITIVE_INFINITY);
    expect(clampGrade(0.300_000_000_000_000_04)).toBe(clampGrade(0.3));
    expect(clampGrade(lower - 1)).toBe(lower);
    expect(clampGrade(upper + 1)).toBe(upper);
  });
});

describe('exposure', () => {
  it('clamps at owner-defined endpoints', () => {
    const lower = clampExposure(Number.NEGATIVE_INFINITY);
    const upper = clampExposure(Number.POSITIVE_INFINITY);
    expect(clampExposure(lower - 1)).toBe(lower);
    expect(clampExposure(upper + 1)).toBe(upper);
  });
});

it.each([
  ['exposure', clampExposure],
  ['bloom override', clampBloomClip],
  ['flashlight strength', clampTorch],
] as const)('removes floating-point noise around an interior owner-rounded %s value', (_name, clamp) => {
  const lower = clamp(-Number.MAX_VALUE);
  const upper = clamp(Number.MAX_VALUE);
  const rounded = clamp((lower + upper) / 2);
  expect(rounded).toBeGreaterThan(lower);
  expect(rounded).toBeLessThan(upper);
  const noise = Number.EPSILON * Math.max(1, Math.abs(rounded)) * 4;
  for (const input of [rounded - noise, rounded + noise]) {
    expect(input).not.toBe(rounded);
    expect(clamp(input)).toBe(rounded);
  }
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
  // `auto` is the Neutral and ACES values mixed, not a table entry.
  const fixedKeys = keys.filter((key) => key !== AUTO_TONE);

  it('has a value for every fixed tone mode and none for anything else', () => {
    expect(Object.keys(BLOOM_CLIP_BY_TONE).sort()).toEqual([...fixedKeys].sort());
    expect(bloomClipFor('sepia')).toBe(1);
  });

  it('is where a grey reaches about 0.95 on screen, to within the tenth it is rounded to', () => {
    for (const tone of fixedKeys.filter((key) => key !== 'none')) {
      const derived = inputForDisplay(tone, 0.95);
      expect(Math.abs(bloomClipFor(tone) - derived)).toBeLessThanOrEqual(0.05);
      expect(displayed(tone, bloomClipFor(tone))).toBeGreaterThan(0.94);
      expect(displayed(tone, bloomClipFor(tone))).toBeLessThan(0.96);
    }
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

  it('mixes the Neutral and ACES values by the auto weight, clamped to [0, 1]', () => {
    expect(bloomClipFor(AUTO_TONE)).toBe(BLOOM_CLIP_BY_TONE.neutral);
    expect(bloomClipFor(AUTO_TONE, 0)).toBe(BLOOM_CLIP_BY_TONE.neutral);
    expect(bloomClipFor(AUTO_TONE, 1)).toBe(BLOOM_CLIP_BY_TONE.aces);
    const neutral = BLOOM_CLIP_BY_TONE.neutral!;
    const aces = BLOOM_CLIP_BY_TONE.aces!;
    expect(bloomClipFor(AUTO_TONE, 0.5)).toBeCloseTo((neutral + aces) / 2, 12);
    expect(bloomClipFor(AUTO_TONE, 0.85)).toBeCloseTo(neutral + (aces - neutral) * 0.85, 12);
    expect(bloomClipFor(AUTO_TONE, -3)).toBe(BLOOM_CLIP_BY_TONE.neutral);
    expect(bloomClipFor(AUTO_TONE, 9)).toBe(BLOOM_CLIP_BY_TONE.aces);
    // The fixed tone mappers ignore the weight.
    expect(bloomClipFor('aces', 0)).toBe(2);
  });

  it('keeps the auto clip at or above 1 at every weight, so the sky never blooms', () => {
    for (let w = 0; w <= 1; w += 0.05) {
      expect(bloomClipFor(AUTO_TONE, w)).toBeGreaterThanOrEqual(MIN_BLOOM_CLIP);
      for (const exposure of [0.2, 1, 3]) {
        expect(targetColorScale(exposure)).toBeLessThanOrEqual(
          bloomThreshold(exposure, bloomClipFor(AUTO_TONE, w)) + 1e-12,
        );
      }
    }
  });

  it('clamps an override at owner-defined endpoints', () => {
    const lower = clampBloomClip(Number.NEGATIVE_INFINITY);
    const upper = clampBloomClip(Number.POSITIVE_INFINITY);
    expect(clampBloomClip(lower - 1)).toBe(lower);
    expect(clampBloomClip(upper + 1)).toBe(upper);
  });
});

describe('flashlight strength multiplier', () => {
  it('clamps at owner-defined endpoints and defaults nonsense input', () => {
    const lower = clampTorch(-Number.MAX_VALUE);
    const upper = clampTorch(Number.MAX_VALUE);
    expect(clampTorch(lower - 1)).toBe(lower);
    expect(clampTorch(upper + 1)).toBe(upper);
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
