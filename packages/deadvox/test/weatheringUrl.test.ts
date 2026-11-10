import { resolveWeatheringUrl } from '@skelly/engine/internal/core/weatheringUrl.ts';
import {
  isWeatheringColor,
  WEATHERING_RANGES,
  WEATHERING_TUNING_KEYS,
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
      { profile: profile.id, tuning: { weatheringScale: changedScale, weatheringMossColor: '#a1b2c3' } },
      profiles,
      defaultProfile.id,
      true,
    )!;
    const written = writeWeatheringParams(state, profiles);
    const restored = resolveWeatheringUrl(written, profiles, defaultProfile.id, true)!;
    const tuningKeys: readonly string[] = WEATHERING_TUNING_KEYS;

    expect(Object.keys(written.tuning).every((key) => tuningKeys.includes(key))).toBe(true);
    expect(isWeatheringColor(written.tuning.weatheringMossColor!)).toBe(true);
    expect(restored).toEqual(state);
  });

  it('uses a site-assigned profile when its URL contains no profile override', () => {
    const siteProfile = [...profiles.values()].find(({ id }) => id !== defaultWeatheringId)!;
    const state = resolveWeatheringUrl({ profile: undefined, tuning: {} }, profiles, siteProfile.id, false)!;
    expect(state.profileId).toBe(siteProfile.id);
    expect(state.defaultProfileId).toBe(siteProfile.id);
    expect(state.settings).toEqual(siteProfile);
  });

  it('does not accept profile or look overrides outside debug mode', () => {
    const profile = profiles.get(defaultWeatheringId)!;
    const other = [...profiles.values()].find(({ id }) => id !== profile.id)!;
    const state = resolveWeatheringUrl({ profile: other.id, tuning: { weathering: 0 } }, profiles, profile.id, false)!;
    expect(state.profileId).toBe(profile.id);
    expect(state.settings.strength).toBe(profile.strength);
  });

  it('omits unchanged settings and the site-default profile from a share URL', () => {
    const profile = profiles.get(defaultWeatheringId)!;
    const written = writeWeatheringParams(
      { profileId: profile.id, defaultProfileId: profile.id, settings: { ...profile } },
      profiles,
    );
    expect(written).toEqual({ profile: undefined, tuning: {} });
  });
});
