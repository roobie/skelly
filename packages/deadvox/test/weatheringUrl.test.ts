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

describe('weathering tuning hash', () => {
  const profiles = BUNDLED_CONTENT.registry.weathering;

  it('round-trips edited numeric and colour values on a site profile', () => {
    const profile = [...profiles.values()].find(({ id }) => id !== defaultWeatheringId)!;
    const range = WEATHERING_RANGES.variationScaleMetres;
    const changedScale =
      profile.variationScaleMetres < range.max - range.step
        ? profile.variationScaleMetres + range.step
        : profile.variationScaleMetres - range.step;
    const state = resolveWeatheringUrl(
      { weatheringScale: changedScale, weatheringMossColor: '#a1b2c3' },
      profiles,
      profile.id,
      true,
    )!;
    const written = writeWeatheringParams(state, profiles);
    const restored = resolveWeatheringUrl(written, profiles, profile.id, true)!;
    const tuningKeys: readonly string[] = WEATHERING_TUNING_KEYS;

    expect(Object.keys(written).every((key) => tuningKeys.includes(key))).toBe(true);
    expect(isWeatheringColor(written.weatheringMossColor!)).toBe(true);
    expect(restored).toEqual(state);
  });

  it('uses a site-assigned profile', () => {
    const siteProfile = [...profiles.values()].find(({ id }) => id !== defaultWeatheringId)!;
    const state = resolveWeatheringUrl({}, profiles, siteProfile.id, false)!;
    expect(state.profileId).toBe(siteProfile.id);
    expect(state.settings).toEqual(siteProfile);
  });

  it('does not accept tuning outside debug mode', () => {
    const profile = profiles.get(defaultWeatheringId)!;
    const state = resolveWeatheringUrl({ weathering: 0 }, profiles, profile.id, false)!;
    expect(state.settings.strength).toBe(profile.strength);
  });

  it('omits unchanged settings from a share URL', () => {
    const profile = profiles.get(defaultWeatheringId)!;
    expect(writeWeatheringParams({ profileId: profile.id, settings: { ...profile } }, profiles)).toEqual({});
  });
});
