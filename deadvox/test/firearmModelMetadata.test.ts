import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/core/content.ts';

const source = 'models.json';
const validate = (model: unknown) => validateContent({ source, data: { models: [model] } });
const base = { id: 'round_7_62x39', file: 'assets/models/round-7_62x39.glb' };
const magazine = {
  id: 'magazine_ak_30',
  file: 'assets/models/magazine-ak-30.glb',
  calibre: '7.62x39',
  capacity: 2,
  rounds: [
    { at: [0, 0.01, 0.002], tilt: 0 },
    { at: [-0.001, 0.005, -0.002], tilt: -8 },
  ],
  anchors: { magwell: [0, 0, 0] },
};

describe('firearm model metadata', () => {
  it('keeps every added field optional for existing entries', () => {
    expect(validate(base)).toEqual([]);
  });

  it('accepts a source cartridge id and a full magazine round column in metres/degrees', () => {
    expect(validate(magazine)).toEqual([]);
    expect(validate({ ...base, calibre: '7.62x39' })).toEqual([]);
  });

  it('rejects malformed cartridge ids and incomplete or inconsistent magazine columns', () => {
    expect(validate({ ...base, calibre: '7/62x39' })).not.toEqual([]);
    const noCalibre = { ...magazine, calibre: undefined };
    expect(validate(noCalibre)).not.toEqual([]);
    const tooFew = { ...magazine, rounds: magazine.rounds.slice(1) };
    expect(validate(tooFew)).not.toEqual([]);
    expect(validate({ ...magazine, capacity: 1.5 })).not.toEqual([]);
  });
});
