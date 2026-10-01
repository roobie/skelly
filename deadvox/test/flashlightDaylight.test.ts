import { describe, expect, it } from 'vitest';
import { skyAt } from '../src/core/sky.ts';
import { FLASHLIGHT_DECAY, FLASHLIGHT_INTENSITY, flashlightDaylightScale } from '../src/render/flashlight.ts';
import { NEAR_FIELD_M } from '../src/render/lightFalloff.ts';

const scaleAt = (hour: number): number => flashlightDaylightScale(skyAt(hour));

describe('flashlight daylight scale', () => {
  it('is about full strength at night', () => {
    expect(scaleAt(0)).toBeGreaterThan(0.99);
    expect(scaleAt(3.5)).toBeGreaterThan(0.99);
    expect(scaleAt(21)).toBeGreaterThan(0.97);
  });

  it('leaves a negligible pool at noon: at most 3% of the sun at 3 m', () => {
    // Beam at 3 m is INTENSITY / (3 + NEAR_FIELD_M)^DECAY candela; the sun's own light is lightIntensity.
    const pool = (FLASHLIGHT_INTENSITY / (3 + NEAR_FIELD_M) ** FLASHLIGHT_DECAY) * scaleAt(12);
    expect(pool).toBeLessThanOrEqual(0.03 * skyAt(12).lightIntensity);
  });

  it('is partial at dawn and dusk', () => {
    for (const hour of [6.5, 19.5]) {
      expect(scaleAt(hour)).toBeGreaterThan(0.02);
      expect(scaleAt(hour)).toBeLessThan(0.5);
    }
  });

  it('follows the sky smoothly: changes by at most 2% per game minute, all day', () => {
    let previous = scaleAt(0);
    for (let minute = 1; minute <= 24 * 60; minute++) {
      const scale = scaleAt((minute / 60) % 24);
      expect(Math.abs(scale - previous)).toBeLessThan(0.02);
      previous = scale;
    }
  });

  it('dims with the sky it is given, whatever the hour', () => {
    const dim = { lightIntensity: 0.05, ambientIntensity: 0.1 };
    const bright = { lightIntensity: 1.6, ambientIntensity: 1.3 };
    expect(flashlightDaylightScale(dim)).toBeGreaterThan(flashlightDaylightScale(bright));
    expect(flashlightDaylightScale({ lightIntensity: 0, ambientIntensity: 0 })).toBe(1);
  });
});
