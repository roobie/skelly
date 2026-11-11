import type { WeatherTuning } from '@skelly/engine/internal/core/weather.ts';
import {
  clampWeatherLevel,
  type Rgb,
  type Sky,
  skyAt as skyAtCycle,
  skyInWeather as skyInWeatherTuned,
  type Weather,
} from '@skelly/engine/sky';
import { describe, expect, it } from 'vitest';
import { BASE_DAY_CYCLE, phaseMidpoint } from './dayPhaseFixture.ts';

const skyAt = (hour: number) => skyAtCycle(hour, BASE_DAY_CYCLE);
const DEFAULT_FOGGINESS = BASE_DAY_CYCLE.weather.defaults.fogginess;
const FAIR = BASE_DAY_CYCLE.weather.cloudiness.fair;
/** The sky under `weather`, in fair weather where it names no level. */
const skyInWeather = (sky: Sky, weather: Partial<Weather>, tuning: WeatherTuning = BASE_DAY_CYCLE.weather) =>
  skyInWeatherTuned(sky, { fogginess: DEFAULT_FOGGINESS, cloudiness: FAIR, rain: 0, ...weather }, tuning);

const HOURS = Array.from({ length: 48 }, (_, i) => i / 2);
const STEPS = [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1];
const NOON = phaseMidpoint('day') / 3600;

/** The sky with its fog values zeroed, so what else a weather state moved shows by comparison. */
const withoutFog = (sky: Sky): Sky => ({ ...sky, fogNear: 0, fogFar: 0, heightFog: 0 });

/** How far a colour is from grey. */
const chroma = (colour: Rgb): number => Math.max(...colour) - Math.min(...colour);

/** The values cloudiness and rain move, each oriented so overcast never makes it smaller. */
const overcastSigns = (sky: Sky): number[] => [
  sky.dome.clouds.cover,
  sky.dome.clouds.opacity,
  -sky.dome.physical.weight,
  -sky.dome.sun.brightness,
  -sky.dome.sun.glow,
  -sky.lightIntensity,
  -sky.ambientIntensity,
  -chroma(sky.dome.zenith),
  -chroma(sky.dome.horizonGlow),
  -chroma(sky.sky),
];

/** The values outside their range: fractions and colour channels outside [0, 1], brightnesses below 0. */
const outOfRange = (sky: Sky): number[] => {
  const fractions = [
    sky.dome.clouds.cover,
    sky.dome.clouds.opacity,
    sky.dome.physical.weight,
    ...sky.sky,
    ...sky.heightFogColor,
    ...sky.dome.zenith,
    ...sky.dome.horizonGlow,
  ];
  const brightnesses = [sky.dome.sun.brightness, sky.dome.sun.glow, sky.lightIntensity, sky.ambientIntensity];
  return [...fractions.filter((value) => value < 0 || value > 1), ...brightnesses.filter((value) => value < 0)];
};

describe('fogginess in the sky', () => {
  it('is a light mist by default, at which the height fog is the keyframes own', () => {
    for (const hour of HOURS) {
      const sky = skyAt(hour);
      expect(skyInWeather(sky, { fogginess: DEFAULT_FOGGINESS }).heightFog).toBeCloseTo(sky.heightFog, 12);
    }
  });

  it('leaves the keyframes distance fog alone when clear and has no mist', () => {
    for (const hour of HOURS) {
      const sky = skyAt(hour);
      const clear = skyInWeather(sky, { fogginess: 0 });
      expect([clear.fogNear, clear.fogFar]).toEqual([sky.fogNear, sky.fogFar]);
      expect(clear.heightFog).toBe(0);
    }
  });

  it('thickens monotonically: more mist, nearer distance fog', () => {
    for (const hour of HOURS) {
      const skies = STEPS.map((fogginess) => skyInWeather(skyAt(hour), { fogginess }));
      for (let i = 1; i < skies.length; i++) {
        expect(skies[i]!.heightFog).toBeGreaterThan(skies[i - 1]!.heightFog);
        expect(skies[i]!.fogNear).toBeLessThan(skies[i - 1]!.fogNear);
        expect(skies[i]!.fogFar).toBeLessThan(skies[i - 1]!.fogFar);
      }
    }
  });

  it('keeps the fog ending inside the view radius, after it starts, whatever the weather', () => {
    for (const hour of HOURS) {
      const base = skyAt(hour);
      for (const fogginess of [...STEPS, -3, 7]) {
        const sky = skyInWeather(base, { fogginess });
        expect(sky.fogNear).toBeGreaterThan(0);
        expect(sky.fogNear).toBeLessThan(sky.fogFar);
        // The far plane follows fogFar (render/sky.ts), so fogFar <= 1 means nothing past the view radius.
        expect(sky.fogFar).toBeLessThanOrEqual(base.fogFar);
        expect(sky.fogFar).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps dawn and night mistier than noon at the same fogginess', () => {
    const dawn = phaseMidpoint('dawn') / 3600;
    const night = phaseMidpoint('night') / 3600;
    for (const fogginess of STEPS.filter((f) => f > 0)) {
      const mist = (hour: number) => skyInWeather(skyAt(hour), { fogginess }).heightFog;
      expect(mist(dawn)).toBeGreaterThan(mist(NOON));
      expect(mist(night)).toBeGreaterThan(mist(NOON));
      expect(skyInWeather(skyAt(night), { fogginess }).fogFar).toBeLessThan(
        skyInWeather(skyAt(NOON), { fogginess }).fogFar,
      );
    }
  });

  it('changes only the fog when dry and in fair weather', () => {
    const sky = skyAt(18);
    expect(withoutFog(skyInWeather(sky, { fogginess: 0.9 }))).toEqual(withoutFog(sky));
  });
});

describe('cloudiness and rain in the sky', () => {
  it('leaves a saturated sky exactly as it is in fair weather without rain', () => {
    const saturated: Rgb = [0.8, 0.35, 0.15];
    const base = skyAt(NOON);
    const sky: Sky = { ...base, sky: saturated, dome: { ...base.dome, zenith: saturated, horizonGlow: saturated } };
    expect(withoutFog(skyInWeather(sky, {}))).toEqual(withoutFog(sky));
  });

  it('clears every cloud at cloudiness 0 and moves nothing else', () => {
    for (const hour of HOURS) {
      const sky = skyAt(hour);
      const clear = withoutFog(skyInWeather(sky, { cloudiness: 0 }));
      expect(clear.dome.clouds.cover).toBe(0);
      const cloudless = { ...sky.dome, clouds: { ...sky.dome.clouds, cover: 0 } };
      expect(clear).toEqual(withoutFog({ ...sky, dome: cloudless }));
    }
  });

  it('never moves the fog, the tone or the bloom', () => {
    for (const hour of HOURS) {
      const sky = skyAt(hour);
      const dry = skyInWeather(sky, {});
      const wet = skyInWeather(sky, { cloudiness: 1, rain: 1 });
      const unmoved = ({ fogNear, fogFar, heightFog, tone, bloom }: Sky) => ({
        fogNear,
        fogFar,
        heightFog,
        tone,
        bloom,
      });
      expect(unmoved(wet)).toEqual(unmoved(dry));
    }
  });

  it('moves the sky one way only as either rises: more cloud, less physical sky, sun and light, greyer colours', () => {
    for (const hour of HOURS) {
      for (const state of ['cloudiness', 'rain'] as const) {
        const signs = STEPS.map((level) => overcastSigns(skyInWeather(skyAt(hour), { [state]: level })));
        for (let i = 1; i < signs.length; i++) {
          signs[i]!.forEach((value, index) => {
            expect(value).toBeGreaterThanOrEqual(signs[i - 1]![index]! - 1e-12);
          });
        }
      }
    }
  });

  it('turns a fair noon overcast: more cloud, less physical sky and sun, dimmer lights and a greyer zenith', () => {
    const clear = skyInWeather(skyAt(NOON), {});
    const overcast = skyInWeather(skyAt(NOON), { cloudiness: 1 });
    expect(overcast.dome.clouds.cover).toBeGreaterThan(clear.dome.clouds.cover);
    expect(overcast.dome.physical.weight).toBeLessThan(clear.dome.physical.weight);
    expect(overcast.dome.sun.brightness).toBeLessThan(clear.dome.sun.brightness);
    expect(overcast.lightIntensity).toBeLessThan(clear.lightIntensity);
    expect(overcast.ambientIntensity).toBeLessThan(clear.ambientIntensity);
    expect(chroma(overcast.dome.zenith)).toBeLessThan(chroma(clear.dome.zenith));
  });

  it('darkens a noon overcast further when it rains: dimmer lights and a darker zenith', () => {
    const overcast = skyInWeather(skyAt(NOON), { cloudiness: 1 });
    const rain = skyInWeather(skyAt(NOON), { rain: 1 });
    const sum = (colour: Rgb) => colour[0] + colour[1] + colour[2];
    expect(rain.lightIntensity).toBeLessThan(overcast.lightIntensity);
    expect(rain.ambientIntensity).toBeLessThan(overcast.ambientIntensity);
    expect(sum(rain.dome.zenith)).toBeLessThan(sum(overcast.dome.zenith));
  });

  it('brings its own level of overcast above fair weather with rain, at least as much as the same cloudiness', () => {
    for (const hour of HOURS) {
      for (const level of STEPS) {
        const rain = skyInWeather(skyAt(hour), { rain: level });
        const brought = FAIR + level * (1 - FAIR);
        for (const cloudiness of level > 0 ? [0, FAIR, brought] : [FAIR]) {
          expect(skyInWeather(skyAt(hour), { cloudiness, rain: level })).toEqual(rain);
        }
        const cloudy = overcastSigns(skyInWeather(skyAt(hour), { cloudiness: level }));
        overcastSigns(rain).forEach((value, index) => {
          expect(value).toBeGreaterThanOrEqual(cloudy[index]! - 1e-12);
        });
      }
    }
  });

  it('keeps every value in its range under any levels and the strongest tuning', () => {
    const strongest: WeatherTuning['rain'] = {
      clouds: { cover: 1, opacity: 1 },
      physicalWeight: 0,
      sun: 0,
      light: 0,
      ambient: 0,
      skyColour: { saturation: 0, brightness: 0 },
    };
    const tunings = [
      BASE_DAY_CYCLE.weather,
      { ...BASE_DAY_CYCLE.weather, cloudiness: { ...strongest, fair: FAIR }, rain: strongest },
    ];
    const cases = tunings.flatMap((tuning) =>
      HOURS.flatMap((hour) => [...STEPS, -3, 7].map((level) => ({ tuning, hour, level }))),
    );
    for (const { tuning, hour, level } of cases) {
      expect(outOfRange(skyInWeather(skyAt(hour), { cloudiness: level, rain: level }, tuning))).toEqual([]);
    }
  });
});

describe('weather level steps', () => {
  it('rounds to a tenth and clamps to 0..1', () => {
    expect(clampWeatherLevel(0.300_000_000_000_000_04)).toBe(0.3);
    expect(clampWeatherLevel(1.04)).toBe(1);
    expect(clampWeatherLevel(-0.3)).toBe(0);
    let level = 0.2;
    for (let i = 0; i < 7; i++) {
      level = clampWeatherLevel(level + 0.1);
    }
    expect(level).toBe(0.9);
  });
});
