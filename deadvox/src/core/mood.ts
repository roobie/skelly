// The mood pass's numbers: colour grade, film and bloom. Pure; render/mood.ts feeds them to
// the shaders. The grade is one strength in [0, 1]: 0 leaves the picture alone, 1 is the
// designed look (DESIGN.md, "Rendering": muted and grey, colour kept for what means something).

import type { Rgb } from './sky.ts';

export const DEFAULT_GRADE = 1;

/** Which parts of the mood pass are on. `post` is the master: off, nothing below renders. */
export interface MoodState {
  post: boolean;
  bloom: boolean;
  /** Vignette and film grain. */
  film: boolean;
  /** Colour grade strength in [0, 1]. */
  grade: number;
  heightFog: boolean;
}

export const DEFAULT_MOOD: MoodState = { post: true, bloom: true, film: true, grade: DEFAULT_GRADE, heightFog: true };

/** Clamped to [0, 1] and rounded to a tenth, so repeated steps don't accumulate float error. */
export const clampGrade = (value: number): number => Math.min(1, Math.max(0, Math.round(value * 10) / 10));

export interface GradeParams {
  /** Multiplier on the colour's distance from its own luminance; 1 leaves it. */
  saturation: number;
  /** Blend towards a smoothstep S-curve (0 leaves the tones, and black and white stay put). */
  contrast: number;
  /** Added to the display-referred colour, weighted towards the shadows. */
  shadowTint: Rgb;
  /** Added to the display-referred colour, weighted towards the highlights. */
  highlightTint: Rgb;
}

// Full-strength grade: 20% less saturation, a gentle S-curve, cool shadows and warm highlights.
const FULL_SATURATION_LOSS = 0.2;
const FULL_CONTRAST = 0.25;
const FULL_SHADOW_TINT: Rgb = [-0.012, 0.0, 0.018];
const FULL_HIGHLIGHT_TINT: Rgb = [0.02, 0.008, -0.015];

const scale = (tint: Rgb, k: number): Rgb => [tint[0] * k, tint[1] * k, tint[2] * k];

/** The grade at a strength in [0, 1] (clamped); strength 0 is the identity. */
export const gradeParams = (strength: number): GradeParams => {
  const k = Math.min(1, Math.max(0, strength));
  return {
    saturation: 1 - FULL_SATURATION_LOSS * k,
    contrast: FULL_CONTRAST * k,
    shadowTint: scale(FULL_SHADOW_TINT, k),
    highlightTint: scale(FULL_HIGHLIGHT_TINT, k),
  };
};

/** Corner darkening of the vignette, as a fraction of the picture at the corner. */
export const VIGNETTE = 0.3;
/** Peak-to-peak film grain amplitude, in display-referred colour (0..1). */
export const GRAIN = 0.035;

/** Bloom: only HDR values above the threshold glow; the sky sets the strength. */
export const BLOOM_THRESHOLD = 1.0;
export const BLOOM_RADIUS = 0.6;
