// Render-only, so this file is excluded from the simulation fingerprint (tools/simulationFingerprint.ts).
// If weather ever affects the simulation, remove that exclusion and bring the weather state into the
// save (docs/decisions/0002-saves.md).
//
// Weather as it reaches the look: set `Weather.fogginess` and the sky's fog follows. Pure; game/play.ts
// holds the one `Weather` and applies `skyInWeather` to each frame's sky before render/sky.ts uses it.

import type { DayCycleDef } from './schema.ts';
import type { Sky } from './sky.ts';

export interface Weather {
  /** 0 is clear, 1 is thick fog. */
  fogginess: number;
}

/** The day cycle's weather tuning (`docs/content.md`, "Day cycle"). */
export type WeatherTuning = DayCycleDef['weather'];

/** Weathering profiles keep place-level age coherent while allowing distinct site moods. */

/** Shared ceiling leaves debug comparisons room above authored weathering without a separate cap. */
export const WEATHERING_STRENGTH_MAX = 8;

/** UI and schema bounds for profile controls; steps only affect presentation, not accepted content precision. */
export const WEATHERING_RANGES = {
  strength: { min: 0, max: WEATHERING_STRENGTH_MAX, step: 0.1 },
  tintDarkness: { min: 0, max: 2, step: 0.01 },
  streakStrength: { min: 0, max: 2, step: 0.01 },
  streakLengthMetres: { min: 0.25, max: 12, step: 0.01 },
  mossStrength: { min: 0, max: 2, step: 0.01 },
  variationScaleMetres: { min: 2, max: 48, step: 0.1 },
  variationStrength: { min: 0, max: 2, step: 0.01 },
  mossThreshold: { min: -1, max: 2, step: 0.01 },
  mossBias: { min: -1, max: 2, step: 0.01 },
  mixCeiling: { min: 0, max: 1, step: 0.01 },
  weatheringBlend: { min: 0, max: 0.75, step: 0.01 },
} as const;

/** Clamped to [0, 1] and rounded to a tenth, so repeated steps don't accumulate float error. */
export const clampFogginess = (value: number): number => Math.min(1, Math.max(0, Math.round(value * 10) / 10));

/**
 * The sky with the weather's fog on top of the time-of-day keyframes: height-fog density scales
 * with fogginess (so dawn and night stay mistier than noon at any value, and 0 has no mist) and the
 * distance fog's start and end move in. The tightening fractions only shrink, so the end stays inside
 * the view radius and, being what the camera's far plane follows, still ends in pure fog colour.
 * Fogginess 0 leaves the keyframes' distances alone. The keyframes' own height-fog density sits at the
 * tuning's default fogginess, so the density gain is its reciprocal.
 */
export const skyInWeather = (sky: Sky, weather: Weather, tuning: WeatherTuning): Sky => {
  const fogginess = Math.min(1, Math.max(0, weather.fogginess));
  return {
    ...sky,
    fogNear: sky.fogNear * (1 - tuning.nearTighten * fogginess),
    fogFar: sky.fogFar * (1 - tuning.farTighten * fogginess),
    heightFog: sky.heightFog * fogginess * (1 / tuning.defaultFogginess),
  };
};
