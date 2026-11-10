import { WEATHERING_STRENGTH_MAX } from '@skelly/engine/internal/core/weather.ts';
import {
  applyWeatheringConfig,
  makeConfig as makeContentConfig,
  configFromUrl as readConfig,
  savingEnabledFromUrl,
  startForSite,
} from '@skelly/engine/session';
import { chunksFor } from '@skelly/engine/world';
import { expect, it, vi } from 'vitest';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { defaultWeatheringId, fixtureIds } from './fixtures/capabilityIds.ts';
import {
  content as BUNDLED_CONTENT,
  configFromUrl,
  configOnSite,
  makeConfig,
  startedOn,
} from './fixtures/startupContent.ts';

const dayCycle = BUNDLED_CONTENT.registry.dayCycle!;

it('turns saving off for a debug run unless save is also set', () => {
  expect(savingEnabledFromUrl({})).toBe(true);
  expect(savingEnabledFromUrl({ save: true })).toBe(true);
  expect(savingEnabledFromUrl({ debug: true })).toBe(false);
  expect(savingEnabledFromUrl({ debug: true, save: false })).toBe(false);
  expect(savingEnabledFromUrl({ debug: true, save: true })).toBe(true);
});

it('starts the gauntlet when no world is selected, including debug previews', () => {
  expect(makeConfig(1, 96).site).toBe('gauntlet');
  for (const hash of [{}, { debug: true }]) {
    expect(configFromUrl('', hash).site).toBe('gauntlet');
  }
});

it('takes the ready ring from content and caps it at the requested view', () => {
  const graphics = new Map(BUNDLED_CONTENT.registry.graphics);
  const tuning = graphics.get(fixtureIds.graphics)!;
  const content = { ...BUNDLED_CONTENT, registry: { ...BUNDLED_CONTENT.registry, graphics } };
  for (const readyRadiusM of [0, 24, 120]) {
    graphics.set(tuning.id, { ...tuning, readyRadiusM });
    const config = makeContentConfig(1, 80, content);
    expect(config.readyRadiusChunks).toBe(chunksFor(config.scale, Math.min(80, readyRadiusM)));
  }
});

it("uses the day cycle's default start for a start row without its own time", () => {
  const { startTimeGameTimeOfDay: _time, ...untimed } = startForSite(BUNDLED_CONTENT, 'city');
  const starts = new Map(BUNDLED_CONTENT.registry.starts).set(untimed.id, untimed);
  const content = startedOn({ ...BUNDLED_CONTENT, registry: { ...BUNDLED_CONTENT.registry, starts } }, 'city');
  expect(readConfig(new URLSearchParams(), {}, content, ragdollSweepViewer).start).toBe(
    dayCycle.defaultStartGameTimeOfDay,
  );
});

it('requires explicit debug mod selection for ragdoll staging and viewer placement', () => {
  const mods = 'mods=skelly.deadvox.scenario.test-house.debug';
  const selected = configOnSite('testHouse', { debug: true, ragdollSweep: 19 }, mods);
  expect(selected.ragdollSweep).toBe(19);
  expect(selected.debugStart).toBeDefined();
  for (const config of [
    configOnSite('testHouse', { ragdollSweep: 19 }, mods),
    configFromUrl(mods, { debug: true, ragdollSweep: 19 }),
    configOnSite('testHouse', { debug: true, ragdollSweep: 1.5 }, mods),
    configOnSite('testHouse', { debug: true, ragdollSweep: 19 }),
  ]) {
    expect(config.ragdollSweep).toBeUndefined();
  }
});

it('passes the voice-pitch knobs on only in a debug run of the voice-size site', () => {
  const knobs = { voicePitch: 1.1, voicePitchLarge: 0.9 };
  expect(configOnSite('voice_size', { debug: true, ...knobs }).debugVoicePitch).toEqual(knobs);
  expect(configOnSite('voice_size', knobs).debugVoicePitch).toBeUndefined();
  expect(configOnSite('gauntlet', { debug: true, ...knobs }).debugVoicePitch).toBeUndefined();
});

it('copies site-selected weathering into replay and resumed configurations', () => {
  const profiles = BUNDLED_CONTENT.registry.weathering;
  const defaultProfile = profiles.get(defaultWeatheringId)!;
  const siteProfile = [...profiles.values()].find(({ id }) => id !== defaultProfile.id)!;
  const config = makeConfig(1, 96);
  config.site = 'fixture-site';
  const layouts = new Map(BUNDLED_CONTENT.registry.layouts);
  const baseLayout = [...layouts.values()][0]!;
  layouts.set(config.site, { ...baseLayout, id: config.site, weatheringProfile: siteProfile.id });
  applyWeatheringConfig(config, {}, { layouts, weathering: profiles });
  expect(config.weatheringProfileId).toBe(siteProfile.id);
  expect(config.weathering).toEqual(siteProfile);
  expect(config.weathering).not.toBe(siteProfile);
  const original = { ...siteProfile };
  config.weathering!.strength += 0.1;
  expect(siteProfile).toEqual(original);
});

it('uses content weathering by default and applies only debug overrides', () => {
  const content = configFromUrl().weathering;
  expect(content).toBeDefined();
  expect(configFromUrl('', { weathering: 0 }).weathering?.strength).toBe(content?.strength);
  expect(configFromUrl('', { debug: true, weathering: 0 }).weathering?.strength).toBe(0);
  const debugWeatheringStrength = (strength: number) =>
    configFromUrl('', { debug: true, weathering: strength }).weathering?.strength;
  const comparisonStrength = content!.strength / 2;
  expect(debugWeatheringStrength(comparisonStrength)).toBe(comparisonStrength);
  expect(debugWeatheringStrength(WEATHERING_STRENGTH_MAX)).toBe(WEATHERING_STRENGTH_MAX);
  expect(debugWeatheringStrength(WEATHERING_STRENGTH_MAX + 1)).toBe(WEATHERING_STRENGTH_MAX);
  expect(debugWeatheringStrength(-0.1)).toBe(0);
});

it('accepts bounded weathering splits only in debug runs and defaults the comparison site split', () => {
  expect(configFromUrl('', { debug: true, weatheringSplit: 12.5 }).weatheringSplit).toBe(12.5);
  expect(configFromUrl('', { weatheringSplit: 12.5 }).weatheringSplit).toBeUndefined();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(configFromUrl('', { debug: true, weatheringSplit: 257 }).weatheringSplit).toBeUndefined();
    expect(configFromUrl('', { debug: true, weatheringSplit: -257 }).weatheringSplit).toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(2);
  } finally {
    warning.mockRestore();
  }
  const comparison = configOnSite('weatheringTest', { debug: true });
  expect(comparison.weatheringSplit).toBe(0);
  expect(comparison.start).toBe(dayCycle.noonGameTimeOfDay);
});

it('turns off only world-scale weathering variation through a debug override', () => {
  const content = configFromUrl().weathering;
  expect(content).toBeDefined();
  expect(configFromUrl('', { weatheringVariation: 0 }).weathering?.variationStrength).toBe(content?.variationStrength);
  const variationOff = configFromUrl('', { debug: true, weatheringVariation: 0 }).weathering;
  expect(variationOff?.strength).toBe(content?.strength);
  expect(variationOff?.variationStrength).toBe(0);
  expect(configFromUrl('', { debug: true, weatheringVariation: 2 }).weathering?.variationStrength).toBe(2);
});

it('limits wobble-flat ratios to debug runs and the unit interval', () => {
  expect(configFromUrl('', { debug: true, wobbleFlat: 0.18 }).debugWobbleFlat).toBe(0.18);
  expect(configFromUrl('', { wobbleFlat: 0.18 }).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl('', { debug: true, wobbleFlat: 1.01 }).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl('', { debug: true, wobbleFlat: 0 }).debugWobbleFlat).toBe(0);
});

it('limits wobble-noise strength overrides to debug runs and the accepted range', () => {
  expect(configFromUrl('', { debug: true, wobbleNoiseScale: 2 }).debugWobbleNoiseScale).toBe(2);
  expect(configFromUrl('', { wobbleNoiseScale: 2 }).debugWobbleNoiseScale).toBeUndefined();
  expect(configFromUrl('', { debug: true, wobbleNoiseScale: -1 }).debugWobbleNoiseScale).toBeUndefined();
  expect(configFromUrl('', { debug: true, wobbleNoiseScale: 9 }).debugWobbleNoiseScale).toBeUndefined();
});

it('warns and falls back when a debug start position has the wrong length', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(configFromUrl('', { debug: true, at: [12] }).debugStart).toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});
