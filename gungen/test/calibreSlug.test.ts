import { describe, expect, it } from 'vitest';
import { calibreSlug, cartridgeModelAsset } from '../src/ammo/calibreSlug.ts';
import { loadCartridges } from './ammoHelpers.ts';

describe('calibre model slugs', () => {
  it('preserves the source cartridge id while emitting legal, stable model ids and files', () => {
    expect(calibreSlug('7.62x39')).toBe('7_62x39');
    expect(cartridgeModelAsset('round', '7.62x39')).toEqual({
      id: 'round_7_62x39',
      file: 'assets/models/round-7_62x39.glb',
    });
    expect(cartridgeModelAsset('case', '7.62x39')).toEqual({
      id: 'case_7_62x39',
      file: 'assets/models/case-7_62x39.glb',
    });
  });

  it('is injective over the registered cartridge ids', () => {
    const ids = loadCartridges().map(({ id }) => id);
    const slugs = ids.map(calibreSlug);
    expect(new Set(slugs).size).toBe(ids.length);
  });

  it('refuses characters that cannot form a stable cartridge slug', () => {
    expect(() => calibreSlug('../7.62x39')).toThrow('invalid cartridge id');
    expect(() => calibreSlug('')).toThrow('invalid cartridge id');
  });
});
