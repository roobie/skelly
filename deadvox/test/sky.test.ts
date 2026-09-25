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

  it('is dark at night, with the fog closer in', () => {
    expect(brightness(0)).toBeLessThan(brightness(12) / 5);
    expect(skyAt(0).fogFar).toBeLessThan(skyAt(12).fogFar);
    expect(Math.max(...skyAt(0).sky)).toBeLessThan(0.1);
  });

  it('changes smoothly through the day, across midnight too', () => {
    for (let hour = 0; hour < 24; hour += 0.05) {
      const step = Math.abs(brightness((hour + 0.05) % 24) - brightness(hour));
      expect(step).toBeLessThan(0.1);
    }
  });
});
