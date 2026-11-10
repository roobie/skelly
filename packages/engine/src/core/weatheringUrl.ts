import { claimed, claimedId } from './capabilities.ts';
import type { WeatheringDef } from './schema.ts';
import { WEATHERING_RANGES } from './weather.ts';

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

/** Debug weathering edits, keyed as the page hash names them; an absent key keeps the profile's value. */
export type WeatheringTuning = { readonly [Param in (typeof NUMBER_FIELDS)[number][0]]?: number } & {
  readonly [Param in (typeof COLOR_FIELDS)[number][0]]?: string;
};

/** The hash keys of the debug weathering edits; the profile choice is not among them. */
export const WEATHERING_TUNING_KEYS = [
  ...NUMBER_FIELDS.map(([param]) => param),
  ...COLOR_FIELDS.map(([param]) => param),
] as const;

const WEATHERING_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const isWeatheringColor = (text: string): boolean => WEATHERING_COLOR_PATTERN.test(text);

const applyNumberOverrides = (tuning: WeatheringTuning, settings: WeatheringDef): void => {
  for (const [param, field] of NUMBER_FIELDS) {
    const value = tuning[param];
    const range = WEATHERING_RANGES[field];
    if (value !== undefined && Number.isFinite(value)) {
      settings[field] = Math.max(range.min, Math.min(range.max, value));
    }
  }
};

const applyColorOverrides = (tuning: WeatheringTuning, settings: WeatheringDef): void => {
  for (const [param, field] of COLOR_FIELDS) {
    const value = tuning[param];
    if (value !== undefined && isWeatheringColor(value)) {
      settings[field] = value;
    }
  }
};

/** Resolves the site profile, then applies only recognized, bounded debug edits. */
export const resolveWeatheringUrl = (
  { profile: requestedProfile, tuning }: { profile: string | null | undefined; tuning: WeatheringTuning },
  profiles: ReadonlyMap<string, WeatheringDef>,
  defaultProfileId: string = claimedId(profiles, 'defaultWeathering'),
  debug = false,
): WeatheringUrlState | undefined => {
  const siteProfile = profiles.get(defaultProfileId) ?? claimed(profiles, 'defaultWeathering');
  if (!siteProfile) {
    return undefined;
  }
  const requested = debug ? (requestedProfile ?? defaultProfileId) : defaultProfileId;
  const profile = profiles.get(requested) ?? siteProfile;
  const settings: WeatheringDef = { ...profile };
  if (debug) {
    applyNumberOverrides(tuning, settings);
    applyColorOverrides(tuning, settings);
  }
  return { profileId: profile.id, defaultProfileId, settings };
};

/** The chosen profile when it is not the site's, and only the edits that depart from that profile. */
export const writeWeatheringParams = (
  state: WeatheringUrlState | undefined,
  profiles: ReadonlyMap<string, WeatheringDef>,
): { profile: string | undefined; tuning: WeatheringTuning } => {
  const baseline = state && profiles.get(state.profileId);
  if (!(state && baseline)) {
    return { profile: undefined, tuning: {} };
  }
  const tuning: Record<string, number | string> = {};
  for (const [param, field] of NUMBER_FIELDS) {
    if (state.settings[field] !== baseline[field]) {
      tuning[param] = state.settings[field];
    }
  }
  for (const [param, field] of COLOR_FIELDS) {
    if (state.settings[field] !== baseline[field]) {
      tuning[param] = state.settings[field];
    }
  }
  return {
    profile: state.profileId === state.defaultProfileId ? undefined : state.profileId,
    tuning: tuning as WeatheringTuning,
  };
};
