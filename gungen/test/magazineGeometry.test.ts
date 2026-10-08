import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { roundProfiles } from '../src/ammo/roundProfile.ts';
import type { Solid } from '../src/core/schema.ts';
import { magazineCenterline } from '../src/gun/magazineCenterline.ts';
import { exportMagazineGlb } from '../src/gun/magazineExport.ts';
import { MAGAZINE_WALL_U, magazineRoundColumn, magazineRoundPoses, UNITS_PER_MM } from '../src/gun/magazineGeometry.ts';
import { magazine } from '../src/gun/parts.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;
const natoCartridge = loadCartridgeFile('5.56x45.json') as MetallicCartridge;
const NARROW_MAGAZINE_ERROR = /narrower than.*round diameter/;
const NARROW_BODY_DEPTH_ERROR = /body section.*round length/;

describe('generated magazine round columns', () => {
  it.each([
    ['straight box', { length: 'M', profile: 'standard', orientation: 'straight' }],
    ['AK-74 curved', { length: 'L', profile: 'ak-curved', orientation: 'straight', variant: 'ak74' }],
    ['AKM curved', { length: 'L', profile: 'ak-curved', orientation: 'straight', variant: 'akm' }],
  ])('fits and exports a %s column', (_label, params) => {
    const part = magazine.build(params);
    const { column } = magazineRoundColumn(part.displaySolids ?? part.solids, cartridge, params, part.solids);
    const poses = magazineRoundPoses(column);
    expect(column.capacity).toBeGreaterThan(0);
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
    expect(result.modelEntry.capacity).toBeGreaterThan(0);
    expect(result.modelEntry.rounds).toHaveLength(result.modelEntry.capacity!);
    expect(result.modelEntry.rounds?.[0]?.at[2]).toBeGreaterThan(0);
    expect(result.modelEntry.rounds?.[1]?.at[2]).toBeLessThan(0);
  });

  it('fits and exports the source-profile rounds in a STANAG L magazine', () => {
    const params = { length: 'L', profile: 'stanag-curved' };
    const part = magazine.build(params);
    const { column } = magazineRoundColumn(part.displaySolids ?? part.solids, natoCartridge, params, part.solids);
    expect(column.capacity).toBeGreaterThan(0);
    expect(column.rounds).toHaveLength(column.capacity);
    expect(column.rounds.every(({ position, z }) => position.every(Number.isFinite) && Number.isFinite(z))).toBe(true);
    const result = exportMagazineGlb({
      asset: { id: 'magazine_stanag', file: 'assets/models/magazine-stanag.glb' },
      params,
      cartridge: natoCartridge,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.modelEntry.calibre).toBe('5.56x45');
    expect(result.modelEntry.capacity).toBe(column.capacity);
    expect(result.modelEntry.rounds).toHaveLength(column.capacity);
  });

  it('refuses a generated magazine body whose actual depth cannot contain the round profile', () => {
    const params = { length: 'M', profile: 'standard', orientation: 'straight' };
    const part = magazine.build(params);
    const narrowedBody = part.solids.map((solid) =>
      solid.id === 'body' && solid.kind === 'box'
        ? { ...solid, box: { ...solid.box, half: [2, solid.box.half[1], solid.box.half[2]] as const } }
        : solid,
    );
    expect(() => magazineRoundColumn(narrowedBody, cartridge, params)).toThrow(NARROW_BODY_DEPTH_ERROR);
  });

  it('refuses export when the generated magazine body is narrower than the real case head', () => {
    const params = { length: 'M', profile: 'standard', orientation: 'straight' };
    const asset = { id: 'magazine_narrow_canary', file: 'assets/models/magazine-narrow-canary.glb' };
    const originalBuild = magazine.build;
    const writableFamily = magazine as unknown as { build: typeof magazine.build };
    try {
      writableFamily.build = (buildParams) => {
        const part = originalBuild(buildParams);
        const narrow = (solids: readonly Solid[]) =>
          solids.map((solid) =>
            solid.id === 'body' && solid.kind === 'box'
              ? { ...solid, box: { ...solid.box, half: [solid.box.half[0], solid.box.half[1], 0.4] as const } }
              : solid,
          );
        return { ...part, solids: narrow(part.solids) };
      };
      expect(() => exportMagazineGlb({ asset, params, cartridge })).toThrow(NARROW_MAGAZINE_ERROR);
    } finally {
      writableFamily.build = originalBuild;
    }
  });

  it('refuses when the actual magazine feed-face section cannot hold a round', () => {
    const params = { length: 'L', profile: 'stanag-curved' };
    const part = magazine.build(params);
    const narrowFeedFace = (solids: readonly Solid[]) =>
      solids.map((solid) => {
        if (solid.id !== 'upper-body' || solid.kind !== 'extruded-polygon') {
          return solid;
        }
        const profile = [...solid.profile];
        profile[2] = [0.4, profile[2]![1]];
        profile[3] = [-0.4, profile[3]![1]];
        return { ...solid, profile };
      });
    expect(() => magazineRoundColumn(narrowFeedFace(part.solids), natoCartridge, params)).toThrow(
      NARROW_BODY_DEPTH_ERROR,
    );
  });

  it('leaves no rounds when the actual magazine body is too short for floor clearance', () => {
    const params = { length: 'M', profile: 'standard', orientation: 'straight' };
    const part = magazine.build(params);
    const shortBody = part.solids.map((solid) =>
      solid.id === 'body' && solid.kind === 'box'
        ? { ...solid, box: { ...solid.box, half: [solid.box.half[0], 0.4, solid.box.half[2]] as const } }
        : solid,
    );
    const { column } = magazineRoundColumn(shortBody, cartridge, params);
    expect(column.capacity).toBe(0);
    expect(column.rounds).toHaveLength(0);
  });

  it('refuses to place rounds when magazine interior is narrower than the case head', () => {
    const tooNarrow: readonly Solid[] = [{ id: 'body', kind: 'box', box: { center: [0, 0, 0], half: [2, 2, 0.15] } }];
    expect(() => magazineRoundColumn(tooNarrow, cartridge)).toThrow(NARROW_MAGAZINE_ERROR);
  });

  it('rejects unrecognized magazine geometry', () => {
    expect(() => magazineRoundColumn([], cartridge)).toThrow('no recognized body centreline');
  });
});
