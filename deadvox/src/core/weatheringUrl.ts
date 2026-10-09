import type { WeatheringDef } from './schema.ts';
import { DEFAULT_WEATHERING_PROFILE_ID, WEATHERING_RANGES } from './weather.ts';

export interface WeatheringUrlState {
  /** Profile selected in the debug panel. */
  profileId: string;
  /** Site-assigned profile, used as the URL's default. */
  defaultProfileId: string;
  /** Authored values plus valid debug overrides. */
  settings: WeatheringDef;
}

const NUMBER_FIELDS = [
  ['weathering', 'strength'],
  ['weatheringTint', 'tintDarkness'],
  ['weatheringStreaks', 'streakStrength'],
  ['weatheringStreakLength', 'streakLengthMetres'],
  ['weatheringMoss', 'mossStrength'],
  ['weatheringScale', 'variationScaleMetres'],
  ['weatheringVariation', 'variationStrength'],
  ['weatheringMossThreshold', 'mossThreshold'],
  ['weatheringMossBias', 'mossBias'],
  ['weatheringMixCeiling', 'mixCeiling'],
  ['weatheringBlend', 'weatheringBlend'],
] as const satisfies readonly (readonly [string, keyof typeof WEATHERING_RANGES])[];

const COLOR_FIELDS = [
  ['weatheringTintColor', 'tintColor'],
  ['weatheringStreakColor', 'streakColor'],
  ['weatheringMossColor', 'mossColor'],
] as const satisfies readonly (readonly [string, 'tintColor' | 'streakColor' | 'mossColor'])[];

export const WEATHERING_URL_PARAMS = [
  'weatheringProfile',
  ...NUMBER_FIELDS.map(([param]) => param),
  ...COLOR_FIELDS.map(([param]) => param),
] as const;

const WEATHERING_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const isWeatheringColor = (text: string): boolean => WEATHERING_COLOR_PATTERN.test(text);

const applyNumberOverrides = (params: URLSearchParams, settings: WeatheringDef): void => {
  for (const [param, field] of NUMBER_FIELDS) {
    const raw = params.get(param);
    if (raw === null || raw.trim() === '') {
      continue;
    }
    const value = Number(raw);
    const range = WEATHERING_RANGES[field];
    if (Number.isFinite(value)) {
      settings[field] = Math.max(range.min, Math.min(range.max, value));
    }
  }
};

const applyColorOverrides = (params: URLSearchParams, settings: WeatheringDef): void => {
  for (const [param, field] of COLOR_FIELDS) {
    const raw = params.get(param);
    if (raw !== null && isWeatheringColor(raw)) {
      settings[field] = raw;
    }
  }
};

/** Resolves the site profile, then applies only recognized, bounded debug URL edits. */
export const resolveWeatheringUrl = (
  params: URLSearchParams,
  profiles: ReadonlyMap<string, WeatheringDef>,
  defaultProfileId: string = DEFAULT_WEATHERING_PROFILE_ID,
  debug = false,
): WeatheringUrlState | undefined => {
  const siteProfile = profiles.get(defaultProfileId) ?? profiles.get(DEFAULT_WEATHERING_PROFILE_ID);
  if (!siteProfile) {
    return undefined;
  }
  const requested = debug ? (params.get('weatheringProfile') ?? defaultProfileId) : defaultProfileId;
  const profile = profiles.get(requested) ?? siteProfile;
  const settings: WeatheringDef = { ...profile };
  if (debug) {
    applyNumberOverrides(params, settings);
    applyColorOverrides(params, settings);
  }
  return { profileId: profile.id, defaultProfileId, settings };
};

/** Replaces weathering URL parameters with the chosen profile and only its non-default edits. */
export const writeWeatheringParams = (
  params: URLSearchParams,
  state: WeatheringUrlState | undefined,
  profiles: ReadonlyMap<string, WeatheringDef>,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const name of WEATHERING_URL_PARAMS) {
    next.delete(name);
  }
  if (!state) {
    return next;
  }
  const baseline = profiles.get(state.profileId);
  if (!baseline) {
    return next;
  }
  if (state.profileId !== state.defaultProfileId) {
    next.set('weatheringProfile', state.profileId);
  }
  for (const [param, field] of NUMBER_FIELDS) {
    if (state.settings[field] !== baseline[field]) {
      next.set(param, String(state.settings[field]));
    }
  }
  for (const [param, field] of COLOR_FIELDS) {
    if (state.settings[field] !== baseline[field]) {
      next.set(param, state.settings[field]);
    }
  }
  return next;
};
