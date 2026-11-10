import { resolveWeatheringUrl, type WeatheringTuning } from '@skelly/engine/internal/core/weatheringUrl.ts';
import {
  isWeatheringColor,
  WEATHERING_RANGES,
  WEATHERING_URL_PARAMS,
  writeWeatheringParams,
} from '@skelly/engine/sky';
import { describe, expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';
import { defaultWeatheringId } from './fixtures/capabilityIds.ts';

const BUNDLED_CONTENT = startupContent();

describe('weathering profile URLs', () => {
  const profiles = BUNDLED_CONTENT.registry.weathering;

  it('round-trips a non-default profile choice and edited numeric and colour values', () => {
    const defaultProfile = profiles.get(defaultWeatheringId)!;
    const profile = [...profiles.values()].find(({ id }) => id !== defaultProfile.id)!;
    const range = WEATHERING_RANGES.variationScaleMetres;
    const changedScale =
      profile.variationScaleMetres < range.max - range.step
        ? profile.variationScaleMetres + range.step
        : profile.variationScaleMetres - range.step;
    const state = resolveWeatheringUrl(
      profile.id,
      { weatheringScale: changedScale, weatheringMossColor: '#a1b2c3' },
      profiles,
      defaultProfile.id,
      true,
    )!;
    const written = writeWeatheringParams(new URLSearchParams('seed=73&weatheringSplit=0'), state, profiles);
    // Read the written params back the way the page hash types them: colours as text, the rest as numbers.
    const tuning: Record<string, number | string> = {};
    for (const param of WEATHERING_URL_PARAMS) {
      const value = written.get(param);
      if (param !== 'weatheringProfile' && value !== null) {
        tuning[param] = isWeatheringColor(value) ? value : Number(value);
      }
    }
    const restored = resolveWeatheringUrl(
      written.get('weatheringProfile'),
      tuning as WeatheringTuning,
      profiles,
      defaultProfile.id,
      true,
    )!;

    expect(written.get('seed')).toBe('73');
    expect(written.get('weatheringSplit')).toBe('0');
    expect(restored).toEqual(state);
  });

  it('uses a site-assigned profile when its URL contains no profile override', () => {
    const siteProfile = [...profiles.values()].find(({ id }) => id !== defaultWeatheringId)!;
    const state = resolveWeatheringUrl(undefined, {}, profiles, siteProfile.id, false)!;
    expect(state.profileId).toBe(siteProfile.id);
    expect(state.defaultProfileId).toBe(siteProfile.id);
    expect(state.settings).toEqual(siteProfile);
  });

  it('does not accept profile or look overrides outside debug mode', () => {
    const profile = profiles.get(defaultWeatheringId)!;
    const other = [...profiles.values()].find(({ id }) => id !== profile.id)!;
    const state = resolveWeatheringUrl(other.id, { weathering: 0 }, profiles, profile.id, false)!;
    expect(state.profileId).toBe(profile.id);
    expect(state.settings.strength).toBe(profile.strength);
  });

  it('omits unchanged settings and the site-default profile from a share URL', () => {
    const profile = profiles.get(defaultWeatheringId)!;
    const other = [...profiles.values()].find(({ id }) => id !== profile.id)!;
    const params = writeWeatheringParams(
      new URLSearchParams(`weatheringProfile=${other.id}&weathering=0&seed=11`),
      { profileId: profile.id, defaultProfileId: profile.id, settings: { ...profile } },
      profiles,
    );
    expect(params.get('seed')).toBe('11');
    expect(params.has('weatheringProfile')).toBe(false);
    expect(params.has('weathering')).toBe(false);
  });
});
