import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { roundProfiles } from '../src/ammo/roundProfile.ts';
import { magazineCenterline } from '../src/gun/magazineCenterline.ts';
import { exportMagazineGlb } from '../src/gun/magazineExport.ts';
import { MAGAZINE_WALL_U, magazineRoundColumn, magazineRoundPoses, UNITS_PER_MM } from '../src/gun/magazineGeometry.ts';
import { magazine } from '../src/gun/parts.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;

describe('generated magazine round columns', () => {
  it.each([
    ['straight box', { length: 'M', profile: 'standard', orientation: 'straight' }],
    ['AK-74 curved', { length: 'L', profile: 'ak-curved', orientation: 'straight', variant: 'ak74' }],
    ['AKM curved', { length: 'L', profile: 'ak-curved', orientation: 'straight', variant: 'akm' }],
  ])('fits and exports a %s column', (_label, params) => {
    const part = magazine.build(params);
    const { column } = magazineRoundColumn(part.displaySolids ?? part.solids, cartridge, params);
    const poses = magazineRoundPoses(column);
    if (_label.startsWith('AK')) {
      expect(column.capacity).toBe(30);
    } else {
      expect(column.capacity).toBeGreaterThan(0);
    }
    expect(column.rounds).toHaveLength(column.capacity);
    expect(poses).toHaveLength(column.capacity);
    expect(poses.every(({ at, tilt }) => at.every(Number.isFinite) && Number.isFinite(tilt))).toBe(true);
    const centerline = magazineCenterline(part.displaySolids ?? part.solids)!;
    const diameter = Math.max(...roundProfiles(cartridge).loadedCase.map(([, radius]) => radius)) * 2 * UNITS_PER_MM;
    const interiorHalfWidth = (centerline.width - 2 * MAGAZINE_WALL_U) / 2;
    for (let first = 0; first < column.rounds.length; first++) {
      const a = column.rounds[first]!;
      expect(Math.abs(a.z) + diameter / 2).toBeLessThanOrEqual(interiorHalfWidth + 0.002);
      for (let second = first + 1; second < column.rounds.length; second++) {
        const b = column.rounds[second]!;
        const separation = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.z - b.z);
        expect(separation, `${_label}: rounds ${first} and ${second}`).toBeGreaterThanOrEqual(diameter - 0.002);
      }
    }
    for (let index = 1; index < column.rounds.length; index++) {
      expect(Math.sign(column.rounds[index]!.z)).toBe(-Math.sign(column.rounds[index - 1]!.z));
    }
    if (_label.startsWith('AK')) {
      expect(new Set(poses.map(({ tilt }) => tilt)).size).toBeGreaterThan(1);
    }
  });

  it('exports a detached magazine with byte geometry and metadata for the fitted round column', () => {
    const result = exportMagazineGlb({
      asset: { id: 'magazine_ak', file: 'assets/models/magazine-ak.glb' },
      params: { length: 'L', profile: 'ak-curved', orientation: 'straight', variant: 'ak74' },
      cartridge,
      appearance: { variant: 'ak' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(new TextDecoder().decode(result.glb.slice(0, 4))).toBe('glTF');
    expect(result.modelEntry.calibre).toBe('7.62x39');
    expect(result.modelEntry.capacity).toBe(30);
    expect(result.modelEntry.rounds).toHaveLength(result.modelEntry.capacity!);
    expect(result.modelEntry.rounds?.[0]?.at[2]).toBeGreaterThan(0);
    expect(result.modelEntry.rounds?.[1]?.at[2]).toBeLessThan(0);
  });

  it('rejects unrecognized magazine geometry', () => {
    expect(() => magazineRoundColumn([], cartridge)).toThrow('no recognized body centreline');
  });
});
