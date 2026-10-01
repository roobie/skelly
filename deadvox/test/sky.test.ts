import { describe, expect, it } from 'vitest';
import { skyAt, sunDirection } from '../src/core/sky.ts';

const brightness = (hour: number) => {
  const sky = skyAt(hour);
  return sky.ambientIntensity + sky.lightIntensity;
};

describe('sky', () => {
  it('puts the sun up by day and down by night', () => {
    expect(sunDirection(12)[1]).toBeGreaterThan(0.9);
    expect(sunDirection(0)[1]).toBeLessThan(-0.9);
    expect(sunDirection(6)[0]).toBeGreaterThan(0.9); // east at sunrise
    expect(sunDirection(18)[0]).toBeLessThan(-0.9); // west at sunset
  });

  it('keeps the main light above the horizon, day and night', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const [x, y, z] = skyAt(hour).light;
      expect(y).toBeGreaterThan(0);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    }
  });

  it('is darkest in the dead of night', () => {
    expect(brightness(1)).toBeLessThan(brightness(21.5));
    expect(skyAt(1).fogFar).toBeLessThan(skyAt(21.5).fogFar);
  });

  it('is dark at night, with the fog closer in', () => {
    expect(brightness(0)).toBeLessThan(brightness(12) / 5);
    expect(skyAt(0).fogFar).toBeLessThan(skyAt(12).fogFar);
    expect(Math.max(...skyAt(0).sky)).toBeLessThan(0.1);
  });

  it('keeps the height mist thickest at dawn and night and thinnest by day, bloom the other way round', () => {
    expect(skyAt(6.5).heightFog).toBeGreaterThan(skyAt(19.5).heightFog);
    expect(skyAt(19.5).heightFog).toBeGreaterThan(skyAt(12).heightFog);
    expect(skyAt(23).heightFog).toBeGreaterThan(skyAt(12).heightFog * 4);
    expect(skyAt(1).bloom).toBeGreaterThan(skyAt(12).bloom * 4);
  });

  it('interpolates the mood fields between keyframes, across midnight too', () => {
    const night = skyAt(21); // NIGHT
    const deep = skyAt(23); // DEEP_NIGHT
    const mid = skyAt(22);
    expect(mid.heightFog).toBeCloseTo((night.heightFog + deep.heightFog) / 2, 9);
    expect(mid.bloom).toBeCloseTo((night.bloom + deep.bloom) / 2, 9);
    expect(mid.heightFogColor[2]).toBeCloseTo((night.heightFogColor[2] + deep.heightFogColor[2]) / 2, 9);
    // 23:00 to 03:30 wraps midnight between two dead-of-night keyframes, so it holds their value.
    expect(skyAt(1.25).heightFog).toBe(deep.heightFog);
    // 03:30 to 05:00 rises towards NIGHT's, which is thinner than DEEP_NIGHT's.
    expect(skyAt(4.25).heightFog).toBeLessThan(deep.heightFog);
    expect(skyAt(4.25).heightFog).toBeGreaterThan(night.heightFog);
  });

  it('keeps every mood field in range', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const sky = skyAt(hour);
      expect(sky.heightFog).toBeGreaterThan(0);
      expect(sky.heightFog).toBeLessThan(0.05);
      expect(sky.bloom).toBeGreaterThanOrEqual(0);
      expect(sky.bloom).toBeLessThanOrEqual(1);
      for (const channel of sky.heightFogColor) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('changes smoothly through the day, across midnight too', () => {
    for (let hour = 0; hour < 24; hour += 0.05) {
      const step = Math.abs(brightness((hour + 0.05) % 24) - brightness(hour));
      expect(step).toBeLessThan(0.1);
    }
  });
});
