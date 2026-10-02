import { describe, expect, it } from 'vitest';
import { calibreSlug, cartridgeModelAsset } from '../src/ammo/calibreSlug.ts';
import { loadCartridges } from './ammoHelpers.ts';

describe('calibre model slugs', () => {
  it('preserves the source cartridge id while emitting legal, stable model ids and files', () => {
    expect(calibreSlug('7.62x39')).toBe('7_d_62x39');
    expect(cartridgeModelAsset('round', '7.62x39')).toEqual({
      id: 'round_7_d_62x39',
      file: 'assets/models/round-7_d_62x39.glb',
    });
    expect(cartridgeModelAsset('case', '7.62x39')).toEqual({
      id: 'case_7_d_62x39',
      file: 'assets/models/case-7_d_62x39.glb',
    });
  });

  it('is injective over registered ids and every accepted separator kind', () => {
    const ids = [
      ...loadCartridges().map(({ id }) => id),
      'a.b',
      'a-b',
      'a_b',
      'a.b-c',
      'a-b.c',
      'a_b-c',
      'a-b_c',
      'a.b_c',
      'a_b.c',
    ];
    const uniqueIds = [...new Set(ids)];
    const slugs = uniqueIds.map(calibreSlug);
    expect(new Set(slugs).size).toBe(uniqueIds.length);
  });

  it('refuses characters that cannot form a stable cartridge slug', () => {
    expect(() => calibreSlug('../7.62x39')).toThrow('invalid cartridge id');
    expect(() => calibreSlug('')).toThrow('invalid cartridge id');
  });
});
