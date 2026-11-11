import { describe, expect, it } from 'vitest';
import { keyedFloor, preethamTerms } from '../src/render/skyDome.ts';

const physical = { weight: 1, exposure: 0.35, turbidity: 3, rayleigh: 1.3, mie: 0.005, mieDirectional: 0.8 };
const floorBand = [0.05, 0.3] as const;
const HEIGHTS = [-0.5, -0.1, 0, 0.05, 0.15, 0.3, 0.6, 1];

describe('the dome around a low sun', () => {
  it('lifts the physical sky to the keyed gradient fully at the horizon and not at all with the sun high', () => {
    expect(keyedFloor(0, floorBand)).toBe(1);
    expect(keyedFloor(-0.4, floorBand)).toBe(1);
    expect(keyedFloor(1, floorBand)).toBe(0);
  });

  it('eases the keyed floor out as the sun climbs', () => {
    const floors = HEIGHTS.map((height) => keyedFloor(height, floorBand));
    expect(floors).toEqual([...floors].sort((a, b) => b - a));
  });
});

describe('the physical sky terms', () => {
  it('has no sun once it is well below the horizon and more of it as it climbs', () => {
    expect(preethamTerms(-0.5, physical).sunIntensity).toBe(0);
    const intensities = HEIGHTS.map((height) => preethamTerms(height, physical).sunIntensity);
    expect(intensities).toEqual([...intensities].sort((a, b) => a - b));
    expect(intensities.at(-1)!).toBeGreaterThan(0);
  });

  it('scales the air terms with the content values and leaves them zero when content zeroes them', () => {
    const hazy = preethamTerms(0.5, { ...physical, rayleigh: 2.6, mie: 0.01 });
    const clear = preethamTerms(0.5, physical);
    expect(hazy.rayleigh[0]).toBeCloseTo(clear.rayleigh[0] * 2, 12);
    expect(hazy.mie[2]).toBeCloseTo(clear.mie[2] * 2, 12);
    const none = preethamTerms(0.5, { ...physical, rayleigh: 0, mie: 0 });
    expect([...none.rayleigh, ...none.mie]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
