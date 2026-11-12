import type { WeatheringDef } from '@skelly/engine/content';
import { graphicsTuningOf } from '@skelly/engine/look';
import { WEATHERING_RANGES } from '@skelly/engine/sky';
import { describe, expect, it } from 'vitest';
import { LookControls } from '../src/debug/look.ts';
import { startupContent } from './baseRegistry.ts';
import { BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { defaultWeatheringId } from './fixtures/capabilityIds.ts';

const BUNDLED_CONTENT = startupContent();

import { FakeMood } from './fakeMood.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

describe('debug weathering controls', () => {
  it('selects another authored profile and updates live mesh uniforms for edits', () => {
    const profiles = BUNDLED_CONTENT.registry.weathering;
    const defaultProfile = profiles.get(defaultWeatheringId)!;
    const profile = [...profiles.values()].find(({ id }) => id !== defaultProfile.id)!;
    const authoredSnapshot = { ...profile };
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
      defaults: LOOK_FIXTURE,
      sunShadow: graphicsTuningOf(BUNDLED_CONTENT.registry).sunShadow,
      weather: { ...BASE_DAY_CYCLE.weather.defaults },
      flashlight: { strength: 1 },
      weathering: {
        state: { profileId: defaultProfile.id, settings: { ...defaultProfile } },
        profiles,
      },
    });

    look.selectWeatheringProfile(profile.id);
    expect(look.weatheringState?.settings).toEqual(profile);
    expect(applied.at(-1)).toEqual(profile);

    const range = WEATHERING_RANGES.mossStrength;
    const nextAmount =
      profile.mossStrength < range.max - range.step
        ? profile.mossStrength + range.step
        : profile.mossStrength - range.step;
    look.setWeatheringNumber('mossStrength', nextAmount);
    look.setWeatheringColor('mossColor', '#a1b2c3');
    expect(look.weatheringState?.settings.mossStrength).toBe(nextAmount);
    expect(look.weatheringState?.settings.mossColor).toBe('#a1b2c3');
    expect(applied.at(-1)?.mossColor).toBe('#a1b2c3');
    expect(profile).toEqual(authoredSnapshot);
  });
});
