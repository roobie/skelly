import { describe, expect, it } from 'vitest';
import { WEATHERING_RANGES } from '../src/core/weather.ts';
import { resolveWeatheringUrl, writeWeatheringParams } from '../src/core/weatheringUrl.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

describe('weathering profile URLs', () => {
  const profiles = BUNDLED_CONTENT.registry.weathering;

  it('round-trips a profile choice and edited numeric and colour values', () => {
    const profile = profiles.get('overgrown')!;
    const range = WEATHERING_RANGES.variationScaleMetres;
    const changedScale =
      profile.variationScaleMetres < range.max - range.step
        ? profile.variationScaleMetres + range.step
        : profile.variationScaleMetres - range.step;
    const params = new URLSearchParams(
      `weatheringProfile=${profile.id}&weatheringScale=${changedScale}&weatheringMossColor=%23a1b2c3`,
    );
    const state = resolveWeatheringUrl(params, profiles, 'proper', true)!;
    const written = writeWeatheringParams(new URLSearchParams('seed=73&weatheringSplit=0'), state, profiles);
    const restored = resolveWeatheringUrl(written, profiles, 'proper', true)!;

    expect(written.get('seed')).toBe('73');
    expect(written.get('weatheringSplit')).toBe('0');
    expect(restored).toEqual(state);
  });

  it('uses a site-assigned profile when its URL contains no profile override', () => {
    const siteProfile = profiles.get('overgrown')!;
    const state = resolveWeatheringUrl(new URLSearchParams(), profiles, siteProfile.id, false)!;
    expect(state.profileId).toBe(siteProfile.id);
    expect(state.defaultProfileId).toBe(siteProfile.id);
    expect(state.settings).toEqual(siteProfile);
  });

  it('does not accept profile or look overrides outside debug mode', () => {
    const profile = profiles.get('proper')!;
    const state = resolveWeatheringUrl(
      new URLSearchParams('weatheringProfile=overgrown&weathering=0'),
      profiles,
      profile.id,
      false,
    )!;
    expect(state.profileId).toBe(profile.id);
    expect(state.settings.strength).toBe(profile.strength);
  });

  it('omits unchanged settings and the site-default profile from a share URL', () => {
    const profile = profiles.get('proper')!;
    const params = writeWeatheringParams(
      new URLSearchParams('weatheringProfile=overgrown&weathering=0&seed=11'),
      { profileId: profile.id, defaultProfileId: profile.id, settings: { ...profile } },
      profiles,
    );
    expect(params.get('seed')).toBe('11');
    expect(params.has('weatheringProfile')).toBe(false);
    expect(params.has('weathering')).toBe(false);
  });
});
