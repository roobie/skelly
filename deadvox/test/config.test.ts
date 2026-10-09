import { expect, it, vi } from 'vitest';
import { SPAWN_TIME, SPAWN_TIMES } from '../src/core/clock.ts';
import { DEFAULT_WEATHERING_PROFILE_ID, WEATHERING_STRENGTH_MAX } from '../src/core/weather.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { applyWeatheringConfig, configFromUrl, makeConfig } from '../src/game/config.ts';

it('uses SPAWN_TIME when the URL has no time for a site without its own start', () => {
  expect(configFromUrl(new URLSearchParams('site=city')).start).toBe(SPAWN_TIME);
});

it('restricts handedness overrides to debug URL configuration', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=left')).debugHandedness).toBe('left');
  expect(configFromUrl(new URLSearchParams('handedness=left')).debugHandedness).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=unknown')).debugHandedness).toBeUndefined();
});

it('copies site-selected weathering into replay and resumed configurations', () => {
  const profiles = BUNDLED_CONTENT.registry.weathering;
  const defaultProfile = profiles.get(DEFAULT_WEATHERING_PROFILE_ID)!;
  const siteProfile = [...profiles.values()].find(({ id }) => id !== defaultProfile.id)!;
  const config = makeConfig(1, 96);
  config.site = 'fixture-site';
  const layouts = new Map(BUNDLED_CONTENT.registry.layouts);
  const baseLayout = [...layouts.values()][0]!;
  layouts.set(config.site, { ...baseLayout, id: config.site, weatheringProfile: siteProfile.id });
  applyWeatheringConfig(config, new URLSearchParams(), {
    layouts,
    weathering: profiles,
  });
  expect(config.weatheringProfileId).toBe(siteProfile.id);
  expect(config.weatheringDefaultProfileId).toBe(siteProfile.id);
  expect(config.weathering).toEqual(siteProfile);
  expect(config.weathering).not.toBe(siteProfile);
  const original = { ...siteProfile };
  config.weathering!.strength += 0.1;
  expect(siteProfile).toEqual(original);
});

it('uses content weathering by default and applies only debug URL overrides', () => {
  const content = configFromUrl(new URLSearchParams()).weathering;
  expect(content).toBeDefined();
  expect(configFromUrl(new URLSearchParams('weathering=0')).weathering?.strength).toBe(content?.strength);
  expect(configFromUrl(new URLSearchParams('debug=1&weathering=0')).weathering?.strength).toBe(0);
  const debugWeatheringStrength = (strength: number) =>
    configFromUrl(new URLSearchParams(`debug=1&weathering=${strength}`)).weathering?.strength;
  const comparisonStrength = content!.strength / 2;
  expect(debugWeatheringStrength(comparisonStrength)).toBe(comparisonStrength);
  expect(debugWeatheringStrength(WEATHERING_STRENGTH_MAX)).toBe(WEATHERING_STRENGTH_MAX);
  expect(debugWeatheringStrength(WEATHERING_STRENGTH_MAX + 1)).toBe(WEATHERING_STRENGTH_MAX);
  expect(configFromUrl(new URLSearchParams('debug=1&weathering=-0.1')).weathering?.strength).toBe(0);
});

it('accepts bounded weathering splits only in debug URLs and defaults the comparison site split', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&weatheringSplit=12.5')).weatheringSplit).toBe(12.5);
  expect(configFromUrl(new URLSearchParams('weatheringSplit=12.5')).weatheringSplit).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&weatheringSplit=257')).weatheringSplit).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&weatheringSplit=-257')).weatheringSplit).toBeUndefined();
  const comparison = configFromUrl(new URLSearchParams('debug=1&site=weatheringTest'));
  expect(comparison.weatheringSplit).toBe(0);
  expect(comparison.start).toBe(SPAWN_TIMES.noon);
  expect(configFromUrl(new URLSearchParams('site=weatheringTest')).site).toBe('hamlet');
});

it('warns and falls back when a debug weathering split is malformed', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(configFromUrl(new URLSearchParams('debug=1&weatheringSplit=abc')).weatheringSplit).toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});

it('turns off only world-scale weathering variation through a debug URL override', () => {
  const content = configFromUrl(new URLSearchParams()).weathering;
  expect(content).toBeDefined();
  expect(configFromUrl(new URLSearchParams('weatheringVariation=0')).weathering?.variationStrength).toBe(
    content?.variationStrength,
  );
  const variationOff = configFromUrl(new URLSearchParams('debug=1&weatheringVariation=0')).weathering;
  expect(variationOff?.strength).toBe(content?.strength);
  expect(variationOff?.variationStrength).toBe(0);
  expect(configFromUrl(new URLSearchParams('debug=1&weatheringVariation=2')).weathering?.variationStrength).toBe(2);
});

it('limits wobble-flat ratios to debug URLs and the unit interval', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=0.18')).debugWobbleFlat).toBe(0.18);
  expect(configFromUrl(new URLSearchParams('wobbleFlat=0.18')).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=1.01')).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=0')).debugWobbleFlat).toBe(0);
});

it('limits wobble-noise strength overrides to debug URLs and the accepted range', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=2')).debugWobbleNoiseScale).toBe(2);
  expect(configFromUrl(new URLSearchParams('wobbleNoiseScale=2')).debugWobbleNoiseScale).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=-1')).debugWobbleNoiseScale).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=9')).debugWobbleNoiseScale).toBeUndefined();
});

it('warns and falls back when a debug start position is malformed', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(configFromUrl(new URLSearchParams('debug=1&at=12,,90')).debugStart).toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});
