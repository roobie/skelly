import { describe, expect, it } from 'vitest';
import { physicalShare, preethamTerms } from '../src/render/skyDome.ts';

const physical = { weight: 1, exposure: 0.35, turbidity: 3, rayleigh: 1.3, mie: 0.005, mieDirectional: 0.8 };
const physicalBand = [0.05, 0.3] as const;
const HEIGHTS = [-0.5, -0.1, 0, 0.05, 0.15, 0.3, 0.6, 1];

describe('the dome around a low sun', () => {
  it('allows no physical sky with the sun at the horizon and all of it with the sun high', () => {
    expect(physicalShare(0, physicalBand)).toBe(0);
    expect(physicalShare(-0.4, physicalBand)).toBe(0);
    expect(physicalShare(1, physicalBand)).toBe(1);
  });

  it('brings the physical sky in as the sun climbs', () => {
    const shares = HEIGHTS.map((height) => physicalShare(height, physicalBand));
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
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
