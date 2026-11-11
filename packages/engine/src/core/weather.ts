// Render-only, so this file is excluded from the simulation fingerprint (packages/deadvox/tools/simulationFingerprint.ts).
// If weather ever affects the simulation, remove that exclusion and bring the weather state into the
// save (docs/decisions/0002-saves.md).
//
// Weather as it reaches the look: set the `Weather` levels and the blended sky follows. Pure; the play view
// (`packages/presentation/src/render/playView.ts`, `createPlayView`) holds the one `Weather` and applies
// `skyInWeather` to each frame's sky before the renderer and the dome use it. Weather moves the sky's values,
// never the dome's shader, so changing it rebuilds nothing.

import type { DayCycleDef } from './schema.ts';
import { type Rgb, type Sky, scatterShare } from './sky.ts';

/** Each level runs from 0, none of it, to 1, all the tuning gives it. */
export interface Weather {
  /** 0 has no mist, 1 is thick fog. */
  fogginess: number;
  /** 0 is a cloudless sky, the tuning's fair level the looks' own clouds, 1 is overcast. */
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

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

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

/** The sky with the looks' clouds thinned to `share` of their cover; at 0 a cloudless sky. */
const thinned = (sky: Sky, share: number): Sky => ({
  ...sky,
  dome: { ...sky.dome, clouds: { ...sky.dome.clouds, cover: sky.dome.clouds.cover * share } },
});

/** A weather state as the sky takes it: what it does to the sky, with its kind of cloud as the scatter kind's share. */
type SkyState = Omit<WeatherTuning['rain'], 'kind'> & { scatter: number };

const stateOf = ({ kind, ...state }: WeatherTuning['rain']): SkyState => ({ ...state, scatter: scatterShare(kind) });

/** The state `t` of the way from `a` to `b`; every field applies linearly, so this is the sky between the two. */
const between = (a: SkyState, b: SkyState, t: number): SkyState => ({
  clouds: { cover: mix(a.clouds.cover, b.clouds.cover, t), opacity: mix(a.clouds.opacity, b.clouds.opacity, t) },
  physicalWeight: mix(a.physicalWeight, b.physicalWeight, t),
  sun: mix(a.sun, b.sun, t),
  light: mix(a.light, b.light, t),
  ambient: mix(a.ambient, b.ambient, t),
  skyColour: {
    saturation: mix(a.skyColour.saturation, b.skyColour.saturation, t),
    brightness: mix(a.skyColour.brightness, b.skyColour.brightness, t),
  },
  scatter: mix(a.scatter, b.scatter, t),
});

/** One weather state's sky at `level` of its strength; at 0 the very sky, since greying round-trips colours inexactly. */
const underSky = (sky: Sky, state: SkyState, level: number): Sky => {
  if (level === 0) {
    return sky;
  }
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
    ambientIntensity: scaled(sky.ambientIntensity, state.ambient, level),
    dome: {
      ...dome,
      zenith: greyed(dome.zenith),
      horizonGlow: greyed(dome.horizonGlow),
      physical: { ...dome.physical, weight: scaled(dome.physical.weight, state.physicalWeight, level) },
      clouds: {
        cover: closed(dome.clouds.cover, state.clouds.cover, level),
        opacity: closed(dome.clouds.opacity, state.clouds.opacity, level),
        scatter: mix(dome.clouds.scatter, state.scatter, level),
      },
      sun: {
        ...dome.sun,
        brightness: scaled(dome.sun.brightness, state.sun, level),
        glow: scaled(dome.sun.glow, state.sun, level),
      },
    },
  };
};

/** The sky at `cloudiness`: thinned below fair weather, then towards the cloudy state and on to overcast. */
const inClouds = (sky: Sky, cloudiness: number, tuning: WeatherTuning): Sky => {
  const fair = tuning.fair.cloudiness;
  const { cloudiness: cloudyAt, ...cloudy } = tuning.cloudy;
  if (cloudiness < fair) {
    return thinned(sky, cloudiness / fair);
  }
  if (cloudiness < cloudyAt) {
    return underSky(sky, stateOf(cloudy), (cloudiness - fair) / (cloudyAt - fair));
  }
  const towardsOvercast = (cloudiness - cloudyAt) / (1 - cloudyAt);
  return underSky(sky, between(stateOf(cloudy), stateOf(tuning.overcast), towardsOvercast), 1);
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
 * Cloudiness: the looks' clouds are fair weather. Below the fair cloudiness they thin to none at 0; above it the sky
 * moves to the cloudy state's at its cloudiness and on to overcast's at 1, closing the clouds and greying and
 * flattening the sky. Rain applies its own tuning by its level on top of at least as much overcast, since rain does
 * not fall from a clear sky. At the fair cloudiness and no rain the sky is the looks' own. Each state's kind of cloud
 * moves with the rest of its sky, so a change of kind blends as the clouds' share of each.
 */
export const skyInWeather = (sky: Sky, weather: Weather, tuning: WeatherTuning): Sky => {
  const rain = unit(weather.rain);
  const fair = tuning.fair.cloudiness;
  const asked = unit(weather.cloudiness);
  const cloudiness = rain > 0 ? Math.max(asked, fair + rain * (1 - fair)) : asked;
  const clouded = inClouds(inFog(sky, unit(weather.fogginess), tuning), cloudiness, tuning);
  return underSky(clouded, stateOf(tuning.rain), rain);
};
