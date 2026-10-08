import { describe, expect, it } from 'vitest';
import { skyAt } from '../src/core/sky.ts';
import { phaseMidpoint } from './dayPhaseFixture.ts';
import { FLASHLIGHT_DECAY, FLASHLIGHT_INTENSITY, flashlightDaylightScale } from '../src/render/flashlight.ts';
import { NEAR_FIELD_M } from '../src/render/lightFalloff.ts';

const scaleAt = (hour: number): number => flashlightDaylightScale(skyAt(hour));

describe('flashlight daylight scale', () => {
  it('preserves the flashlight at full night and dims it under the full-day sky', () => {
    const night = scaleAt(phaseMidpoint('night') / 3600);
    const day = scaleAt(phaseMidpoint('day') / 3600);
    expect(night).toBeGreaterThan(day);
    expect(night).toBeGreaterThan(0.9);
  });

  it('keeps the daylight-scaled flashlight weaker than direct sun lighting', () => {
    const hour = phaseMidpoint('day') / 3600;
    const pool = (FLASHLIGHT_INTENSITY / (3 + NEAR_FIELD_M) ** FLASHLIGHT_DECAY) * scaleAt(hour);
    expect(pool).toBeLessThan(skyAt(hour).lightIntensity);
  });

  it('blends flashlight strength through dawn and dusk', () => {
    const night = scaleAt(phaseMidpoint('night') / 3600);
    const day = scaleAt(phaseMidpoint('day') / 3600);
    for (const phase of ['dawn', 'dusk'] as const) {
      const twilight = scaleAt(phaseMidpoint(phase) / 3600);
      expect(twilight).toBeGreaterThan(day);
      expect(twilight).toBeLessThan(night);
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
