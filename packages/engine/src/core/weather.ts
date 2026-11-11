// Render-only, so this file is excluded from the simulation fingerprint (packages/deadvox/tools/simulationFingerprint.ts).
// If weather ever affects the simulation, remove that exclusion and bring the weather state into the
// save (docs/decisions/0002-saves.md).
//
// Weather as it reaches the look: set the `Weather` levels and the blended sky follows. Pure;
// presentation/render/playView.ts holds the one `Weather` and applies `skyInWeather` to each frame's sky before
// render/sky.ts and the dome use it. Weather moves the sky's values, never the dome's shader, so changing it
// rebuilds nothing.

import type { DayCycleDef } from './schema.ts';
import type { Rgb, Sky } from './sky.ts';

/** Each level runs from 0, none of it, to 1, all the tuning gives it. */
export interface Weather {
  /** 0 has no mist, 1 is thick fog. */
  fogginess: number;
  /** 0 leaves the looks' own clouds, 1 is overcast. */
  cloudiness: number;
  /** 0 is dry, 1 is heavy rain, which is overcast at least. */
  rain: number;
}

/** The day cycle's weather tuning (`packages/deadvox/docs/content.md`, "Day cycle"). */
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
export const clampWeatherLevel = (value: number): number => Math.min(1, Math.max(0, Math.round(value * 10) / 10));

const unit = (value: number): number => Math.min(1, Math.max(0, value));

/** `value` scaled down towards `left` of itself as `level` rises to 1. */
const scaled = (value: number, left: number, level: number): number => value * (1 - (1 - left) * level);

/** `value` in [0, 1] with `share` of what it lacks of 1 closed as `level` rises to 1. */
const closed = (value: number, share: number, level: number): number => value + (1 - value) * share * level;

const inFog = (sky: Sky, fogginess: number, { fog, defaults }: WeatherTuning): Sky => ({
  ...sky,
  fogNear: sky.fogNear * (1 - fog.nearTighten * fogginess),
  fogFar: sky.fogFar * (1 - fog.farTighten * fogginess),
  heightFog: sky.heightFog * fogginess * (1 / defaults.fogginess),
});

/** One weather state's sky at `level` of its strength. */
const underSky = (sky: Sky, state: WeatherTuning['cloudiness'], level: number): Sky => {
  const saturation = scaled(1, state.skyColour.saturation, level);
  const brightness = scaled(1, state.skyColour.brightness, level);
  const greyed = (colour: Rgb): Rgb => {
    const grey = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
    const channel = (value: number): number => (grey + (value - grey) * saturation) * brightness;
    return [channel(colour[0]), channel(colour[1]), channel(colour[2])];
  };
  const { dome } = sky;
  return {
    ...sky,
    sky: greyed(sky.sky),
    heightFogColor: greyed(sky.heightFogColor),
    lightIntensity: scaled(sky.lightIntensity, state.light, level),
    dome: {
      ...dome,
      zenith: greyed(dome.zenith),
      horizonGlow: greyed(dome.horizonGlow),
      physical: { ...dome.physical, weight: scaled(dome.physical.weight, state.physicalWeight, level) },
      clouds: {
        cover: closed(dome.clouds.cover, state.clouds.cover, level),
        opacity: closed(dome.clouds.opacity, state.clouds.opacity, level),
      },
      sun: {
        ...dome.sun,
        brightness: scaled(dome.sun.brightness, state.sun, level),
        glow: scaled(dome.sun.glow, state.sun, level),
      },
    },
  };
};

/**
 * The sky with the weather on top of the time-of-day keyframes.
 *
 * Fog: height-fog density scales with fogginess (so dawn and night stay mistier than noon at any value, and 0 has no
 * mist) and the distance fog's start and end move in. The tightening fractions only shrink, so the end stays inside
 * the view radius and, being what the camera's far plane follows, still ends in pure fog colour. Fogginess 0 leaves
 * the keyframes' distances alone. The keyframes' own height-fog density sits at the default fogginess, so the
 * density gain is its reciprocal.
 *
 * Cloudiness and rain: each closes the clouds and greys and flattens the sky by its level, rain on top of the
 * overcast it brings, since rain does not fall from a clear sky. Both at 0 leave the looks' own sky, so the looks
 * keep their fair-weather clouds.
 */
export const skyInWeather = (sky: Sky, weather: Weather, tuning: WeatherTuning): Sky => {
  const rain = unit(weather.rain);
  const overcast = Math.max(unit(weather.cloudiness), rain);
  const foggy = inFog(sky, unit(weather.fogginess), tuning);
  return underSky(underSky(foggy, tuning.cloudiness, overcast), tuning.rain, rain);
};
