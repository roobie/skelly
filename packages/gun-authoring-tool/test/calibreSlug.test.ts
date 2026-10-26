import { describe, expect, it } from 'vitest';
import { calibreSlug, cartridgeModelAsset } from '../src/ammo/calibreSlug.ts';
import { loadCartridges } from './ammoHelpers.ts';

describe('calibre model slugs', () => {
  it('derives each cartridge component path from its escaped model identity', () => {
    expect(calibreSlug('fixture.case-2')).toBe('fixture_d_case_h_2');
    for (const component of ['round', 'case'] as const) {
      const asset = cartridgeModelAsset(component, 'fixture.case-2');
      expect(asset.id).toBe(`${component}_fixture_d_case_h_2`);
      expect(asset.file).toBe(`assets/models/${asset.id}.glb`);
    }
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
