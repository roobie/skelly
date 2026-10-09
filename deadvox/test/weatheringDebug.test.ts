import { describe, expect, it } from 'vitest';
import type { WeatheringDef } from '../src/core/schema.ts';
import { DEFAULT_FOGGINESS, DEFAULT_WEATHERING_PROFILE_ID, WEATHERING_RANGES } from '../src/core/weather.ts';
import { LookControls } from '../src/debug/look.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { FakeMood } from './fakeMood.ts';

describe('debug weathering controls', () => {
  it('selects another authored profile and updates live mesh uniforms for edits', () => {
    const profiles = BUNDLED_CONTENT.registry.weathering;
    const defaultProfile = profiles.get(DEFAULT_WEATHERING_PROFILE_ID)!;
    const alternateProfile = [...profiles.values()].find(({ id }) => id !== defaultProfile.id)!;
    const authoredSnapshot = { ...alternateProfile };
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
        state: {
          profileId: defaultProfile.id,
          defaultProfileId: defaultProfile.id,
          settings: { ...defaultProfile },
        },
        profiles,
      },
    });

    look.selectWeatheringProfile(alternateProfile.id);
    expect(look.weatheringState?.settings).toEqual(alternateProfile);
    expect(applied.at(-1)).toEqual(alternateProfile);

    const range = WEATHERING_RANGES.mossStrength;
    const nextAmount =
      alternateProfile.mossStrength < range.max - range.step
        ? alternateProfile.mossStrength + range.step
        : alternateProfile.mossStrength - range.step;
    look.setWeatheringNumber('mossStrength', nextAmount);
    look.setWeatheringColor('mossColor', '#a1b2c3');
    expect(look.weatheringState?.settings.mossStrength).toBe(nextAmount);
    expect(look.weatheringState?.settings.mossColor).toBe('#a1b2c3');
    expect(applied.at(-1)?.mossColor).toBe('#a1b2c3');
    expect(alternateProfile).toEqual(authoredSnapshot);
  });
});
