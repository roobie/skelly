// RENDER-ONLY FOR NOW, so this file is excluded from the simulation fingerprint
// (tools/simulationFingerprint.ts). When weather starts to affect the simulation, remove that
// exclusion and bring the weather state into the save (docs/decisions/0002-saves.md).
//
// Weather as it reaches the look. There is no weather system yet (DESIGN.md, Slice 4); this is the
// hook it will drive: set `Weather.fogginess` and the sky's fog follows. Pure; game/play.ts holds the
// one `Weather` and applies `skyInWeather` to each frame's sky before render/sky.ts uses it.

import type { Sky } from './sky.ts';

export interface Weather {
  /** 0 is clear, 1 is thick fog. */
  fogginess: number;
}

/** A light mist. At this value the height fog has exactly the time-of-day keyframes' density. */
export const DEFAULT_FOGGINESS = 0.2;

/** Clamped to [0, 1] and rounded to a tenth, so repeated steps don't accumulate float error. */
export const clampFogginess = (value: number): number => Math.min(1, Math.max(0, Math.round(value * 10) / 10));

/** Height-fog density multiplier at fogginess 1; the keyframes' own density sits at DEFAULT_FOGGINESS × this. */
const HEIGHT_FOG_GAIN = 1 / DEFAULT_FOGGINESS;
/** How much of its keyframe value the distance fog's start and end lose at fogginess 1. */
const NEAR_TIGHTEN = 0.85;
const FAR_TIGHTEN = 0.6;

/**
 * The sky with the weather's fog on top of the time-of-day keyframes: height-fog density scales
 * with fogginess (so dawn and night stay mistier than noon at any value, and 0 has no mist) and the
 * distance fog's start and end move in. Fractions only shrink, so the end stays inside the view
 * radius and, being what the camera's far plane follows, still ends in pure fog colour. Fogginess 0
 * leaves the keyframes' distances alone.
 */
export const skyInWeather = (sky: Sky, weather: Weather): Sky => {
  const fogginess = Math.min(1, Math.max(0, weather.fogginess));
  return {
    ...sky,
    fogNear: sky.fogNear * (1 - NEAR_TIGHTEN * fogginess),
    fogFar: sky.fogFar * (1 - FAR_TIGHTEN * fogginess),
    heightFog: sky.heightFog * fogginess * HEIGHT_FOG_GAIN,
  };
};
