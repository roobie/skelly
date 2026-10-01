import { describe, expect, it } from 'vitest';
import { skyAt } from '../src/core/sky.ts';
import { clampFogginess, DEFAULT_FOGGINESS, skyInWeather } from '../src/core/weather.ts';

const HOURS = Array.from({ length: 48 }, (_, i) => i / 2);
const STEPS = [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1];

describe('fogginess in the sky', () => {
  it('is a light mist by default, at which the height fog is the keyframes own', () => {
    expect(DEFAULT_FOGGINESS).toBe(0.2);
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
    for (const fogginess of STEPS.filter((f) => f > 0)) {
      const mist = (hour: number) => skyInWeather(skyAt(hour), { fogginess }).heightFog;
      expect(mist(6.5)).toBeGreaterThan(mist(12));
      expect(mist(23)).toBeGreaterThan(mist(12));
      expect(skyInWeather(skyAt(1), { fogginess }).fogFar).toBeLessThan(skyInWeather(skyAt(12), { fogginess }).fogFar);
    }
  });

  it('changes only the fog, not the light, the colours or the bloom', () => {
    const sky = skyAt(18);
    const foggy = skyInWeather(sky, { fogginess: 0.9 });
    expect({ ...foggy, fogNear: 0, fogFar: 0, heightFog: 0 }).toEqual({ ...sky, fogNear: 0, fogFar: 0, heightFog: 0 });
  });
});

describe('fogginess steps', () => {
  it('rounds to a tenth and clamps to 0..1', () => {
    expect(clampFogginess(0.300_000_000_000_000_04)).toBe(0.3);
    expect(clampFogginess(1.04)).toBe(1);
    expect(clampFogginess(-0.3)).toBe(0);
    let fogginess = DEFAULT_FOGGINESS;
    for (let i = 0; i < 7; i++) {
      fogginess = clampFogginess(fogginess + 0.1);
    }
    expect(fogginess).toBe(0.9);
  });
});
