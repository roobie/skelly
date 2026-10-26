import { expect, it } from 'vitest';
import { GUN_UNITS, inchesToMm, inchesToU, mmToInches, mmToU, uToInches, uToMm } from '../src/gun/units.ts';

it('round-trips signed lengths and keeps every conversion on the domain scale', () => {
  for (const value of [-7.25, 0, 2.5]) {
    expect(uToMm(mmToU(value))).toBeCloseTo(value);
    expect(mmToU(uToMm(value))).toBeCloseTo(value);
    expect(mmToInches(inchesToMm(value))).toBeCloseTo(value);
    expect(inchesToMm(mmToInches(value))).toBeCloseTo(value);
    expect(uToInches(inchesToU(value))).toBeCloseTo(value);
    expect(inchesToU(uToInches(value))).toBeCloseTo(value);
    expect(uToMm(value) / 1000).toBeCloseTo(value * GUN_UNITS.metresPerUnit);
    expect(inchesToU(value)).toBeCloseTo(mmToU(inchesToMm(value)));
  }
  expect(inchesToMm(1)).toBe(25.4);
});
