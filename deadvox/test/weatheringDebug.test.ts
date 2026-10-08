import { describe, expect, it } from 'vitest';
import type { WeatheringDef } from '../src/core/schema.ts';
import { DEFAULT_FOGGINESS, WEATHERING_RANGES } from '../src/core/weather.ts';
import { LookControls } from '../src/debug/look.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { FakeMood } from './fakeMood.ts';

describe('debug weathering controls', () => {
  it('selects authored profile values and updates the live mesh uniforms for edits', () => {
    const profiles = BUNDLED_CONTENT.registry.weathering;
    const proper = profiles.get('proper')!;
    const overgrown = profiles.get('overgrown')!;
    const applied: (WeatheringDef | undefined)[] = [];
    const meshes = {
      linearColorsOn: true,
      setLinearColors: () => undefined,
      patternsOn: true,
      setPatterns: () => undefined,
      occlusionOn: true,
      setOcclusion: () => undefined,
      setWeathering: (settings: WeatheringDef | undefined) => applied.push(settings),
    };
    const look = new LookControls(undefined, meshes, new FakeMood(), {
      weather: { fogginess: DEFAULT_FOGGINESS },
      flashlight: { strength: 1 },
      weathering: {
        state: { profileId: proper.id, defaultProfileId: proper.id, settings: { ...proper } },
        profiles,
      },
    });

    look.selectWeatheringProfile(overgrown.id);
    expect(look.weatheringState?.settings).toEqual(overgrown);
    expect(applied.at(-1)).toEqual(overgrown);

    const range = WEATHERING_RANGES.mossStrength;
    const nextAmount =
      overgrown.mossStrength < range.max - range.step
        ? overgrown.mossStrength + range.step
        : overgrown.mossStrength - range.step;
    look.setWeatheringNumber('mossStrength', nextAmount);
    look.setWeatheringColor('mossColor', '#a1b2c3');
    expect(look.weatheringState?.settings.mossStrength).toBe(nextAmount);
    expect(look.weatheringState?.settings.mossColor).toBe('#a1b2c3');
    expect(applied.at(-1)?.mossColor).toBe('#a1b2c3');
  });
});
