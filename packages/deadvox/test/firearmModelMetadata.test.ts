import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/core/content.ts';

const source = 'models.json';
const validate = (model: unknown) => validateContent({ source, data: { models: [model] } });
const base = {
  id: 'round_7_d_62x39',
  file: 'assets/models/round-7_d_62x39.glb',
  parts: { body: { massKg: 1, centreOfMass: [0, 0, 0] } },
};
const magazine = {
  id: 'magazine_ak_30',
  file: 'assets/models/magazine-ak-30.glb',
  parts: base.parts,
  gun: {
    calibre: '7.62x39',
    capacity: 2,
    rounds: [
      { at: [0, 0.01, 0.002], tilt: 0 },
      { at: [-0.001, 0.005, -0.002], tilt: -8 },
    ],
  },
  anchors: { magwell: [0, 0, 0] },
};

describe('firearm model metadata', () => {
  it('leaves gun metadata optional on a neutral model', () => {
    expect(validate(base)).toEqual([]);
  });

  it('accepts a source cartridge id and a full magazine round column in metres/degrees', () => {
    expect(validate(magazine)).toEqual([]);
    expect(validate({ ...base, gun: { calibre: '7.62x39' } })).toEqual([]);
  });

  it('rejects firearm fields outside their named block and unknown fields inside it', () => {
    expect(validate({ ...base, gun: { calibre: 'fixture-calibre' } })).toEqual([]);
    expect(validate({ ...base, calibre: 'fixture-calibre' })).not.toEqual([]);
    expect(validate({ ...base, gun: { fixtureUnknownField: true } })).not.toEqual([]);
  });

  it('rejects malformed cartridge ids and incomplete or inconsistent magazine columns', () => {
    expect(validate({ ...base, gun: { calibre: '7/62x39' } })).not.toEqual([]);
    const noCalibre = { ...magazine, gun: { ...magazine.gun, calibre: undefined } };
    expect(validate(noCalibre)).not.toEqual([]);
    const tooFew = { ...magazine, gun: { ...magazine.gun, rounds: magazine.gun.rounds.slice(1) } };
    expect(validate(tooFew)).not.toEqual([]);
    expect(validate({ ...magazine, gun: { ...magazine.gun, capacity: 1.5 } })).not.toEqual([]);
  });
});
