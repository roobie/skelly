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
  /** Bloom clip override (post-exposure value, see `BLOOM_CLIP_BY_TONE`); null follows the active tone mapper. */
  bloomClip: number | null;
}

/** Play's mood pass. The height-fog mist is not here: it follows the weather's fogginess (core/weather.ts). */
export const DEFAULT_MOOD: MoodState = {
  post: true,
  bloom: true,
  film: true,
  grade: DEFAULT_GRADE,
  bloomClip: null,
};

/**
 * The `TONE_MODES` key of the tone mapping that blends Neutral and ACES Filmic by time of day (the sky's `tone`
 * weight, render/autoTone.ts).
 */
export const AUTO_TONE = 'auto';

/** Renderer and block-colour settings that make up the look, apart from the mood pass. `tone` is a render/look.ts key. */
export interface LookState {
  tone: string;
  exposure: number;
  /** Block colours decoded from sRGB before lighting. */
  srgb: boolean;
  /** Procedural surface patterns on blocks. */
  patterns: boolean;
  /** Wide-radius ambient occlusion on ambient light (computed in the mesher; this only scales it). */
  vao: boolean;
}

/**
 * The game's look. Play applies it at start-up (game/play.ts) with no URL parameters; the debug
 * controls and URL record only deviations from it. The benchmark does not apply it: it keeps
 * three.js's own defaults (no tone mapping, exposure 1, colours undecoded) and the mood pass off.
 */
export const DEFAULT_LOOK: LookState = { tone: AUTO_TONE, exposure: 3, srgb: true, patterns: true, vao: true };

/** Which shadows are drawn, and how far from the player the sun's reach. Render-only; the debug controls and URL change it. */
export interface ShadowState {
  /** The main light's shadows (full whenever it shines). */
  sun: boolean;
  /** The flashlight beam's shadows, while it is on. */
  torch: boolean;
  /** Metres from the player that the sun's shadow map covers (its half-width). */
  distance: number;
}

/** The sun's shadow distances the debug key steps through, in metres. */
export const SHADOW_DISTANCES: readonly number[] = [24, 40, 64];

export const DEFAULT_SHADOWS: ShadowState = { sun: true, torch: true, distance: 24 };

const MIN_SHADOW_DISTANCE = 16;
const MAX_SHADOW_DISTANCE = 96;

/** A whole number of metres within the allowed range; anything else (NaN) is the default. */
export const clampShadowDistance = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_SHADOW_DISTANCE, Math.max(MIN_SHADOW_DISTANCE, Math.round(value)))
    : DEFAULT_SHADOWS.distance;

/** The next of `SHADOW_DISTANCES` above `current`, wrapping to the first. */
export const nextShadowDistance = (current: number): number =>
  SHADOW_DISTANCES.find((distance) => distance > current) ?? SHADOW_DISTANCES[0]!;

/** Multiplier on the flashlight's intensity (render/flashlight.ts); the debug controls and URL change it. */
export const DEFAULT_TORCH = 1;

const MIN_TORCH = 0.1;
const MAX_TORCH = 16;
/** One key press multiplies or divides the torch strength by this: the useful range spans a factor of ten or more. */
export const TORCH_STEP = 1.25;

/** Clamped to the allowed range and rounded to a hundredth, so repeated steps by `TORCH_STEP` come back to where they started. */
export const clampTorch = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_TORCH, Math.max(MIN_TORCH, Math.round(value * 100) / 100)) : DEFAULT_TORCH;

const MIN_EXPOSURE = 0.2;
const MAX_EXPOSURE = 3.0;

/** Clamped to the allowed range and rounded to a tenth, so repeated steps don't accumulate float error. */
export const clampExposure = (value: number): number =>
  Math.min(MAX_EXPOSURE, Math.max(MIN_EXPOSURE, Math.round(value * 10) / 10));

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
export const BLOOM_RADIUS = 0.6;

/**
 * Scene-linear value after exposure (what OutputPass feeds the tone mapper) at which a grey reaches
 * about 0.95 on screen (sRGB-encoded), per `TONE_MODES` key: bloom should start where the picture is
 * about to clip, not where it is merely bright. Bloom runs on the linear HDR frame before OutputPass
 * applies exposure and tone mapping, so a fixed threshold would mean a different on-screen
 * brightness at every exposure; `bloomThreshold` divides the exposure out.
 *
 * Derived by porting three's GLSL tone-map functions (tonemapping_pars_fragment, the ones OutputPass
 * runs) for a grey input, applying the sRGB OETF, and solving display(x) = 0.95 by bisection (the
 * port is test/toneCurves.ts, which also checks these):
 *   aces     x = 2.039 (ACES Filmic, with three's 1/0.6 input scale; x = 1 already shows 0.888)
 *   agx      x = 5.024 (a long shoulder: x = 1 shows only 0.792)
 *   neutral  x = 1.084
 * rounded to a tenth, the step of the debug key. `none` applies no curve, so the frame clips at 1.
 *
 * Never below 1 (`MIN_BLOOM_CLIP`): the sky is scaled to land at or under 1 after exposure
 * (`targetColorScale`) and must never count as bright.
 */
export const BLOOM_CLIP_BY_TONE: Readonly<Record<string, number>> = {
  none: 1,
  aces: 2,
  agx: 5,
  neutral: 1.1,
};

/**
 * The derived clip for a `TONE_MODES` key; an unknown key gets the no-curve value. `auto` is the Neutral and ACES
 * clips mixed by the same weight as the curves (`autoWeight`, 0 is Neutral, 1 is ACES). It stays at or above
 * the Neutral clip, so the sky-never-blooms floor of `MIN_BLOOM_CLIP` holds at every weight.
 */
export const bloomClipFor = (tone: string, autoWeight = 0): number => {
  if (tone === AUTO_TONE) {
    const w = Math.min(1, Math.max(0, autoWeight));
    const neutral = BLOOM_CLIP_BY_TONE.neutral!;
    return neutral + (BLOOM_CLIP_BY_TONE.aces! - neutral) * w;
  }
  return BLOOM_CLIP_BY_TONE[tone] ?? 1;
};

export const MIN_BLOOM_CLIP = 1;
const MAX_BLOOM_CLIP = 8;

/** Clamped to the allowed range and rounded to a tenth, so repeated steps don't accumulate float error. */
export const clampBloomClip = (value: number): number =>
  Math.min(MAX_BLOOM_CLIP, Math.max(MIN_BLOOM_CLIP, Math.round(value * 10) / 10));

/**
 * The bloom pass's luminance threshold in pre-exposure linear light, for the renderer's exposure and a
 * clip (post-exposure value, see `BLOOM_CLIP_BY_TONE`).
 */
export const bloomThreshold = (exposure: number, clip: number): number => clip / Math.max(exposure, 1e-3);

/**
 * Factor for colours that are cleared or fogged into the post chain's linear target but are not
 * lights: OutputPass multiplies the whole frame by the exposure, so scaling them by 1 / exposure
 * lets them reach the screen as they would without post. It also keeps them at or below
 * `bloomThreshold` for any clip of at least `MIN_BLOOM_CLIP` (a sky colour is at most 1), so the sky
 * never counts as bright.
 */
export const targetColorScale = (exposure: number): number => 1 / Math.max(exposure, 1e-3);
