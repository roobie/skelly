import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { ASSUMED_BULLET_SEATING_DEPTH_CALIBRES, CASE_WALL_MM, roundProfiles } from '../src/ammo/roundProfile.ts';
import { meshForRevolved } from '../src/core/revolve.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;
const natoCartridge = loadCartridgeFile('5.56x45.json') as MetallicCartridge;
const profiles = roundProfiles(cartridge);
const maximum = (profile: readonly (readonly [number, number])[], axis: 0 | 1): number =>
  Math.max(...profile.map((point) => point[axis]));

const signedVolume = (positions: Float32Array, indices: Uint32Array): number => {
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const point = (vertex: number): readonly [number, number, number] => {
      const offset = indices[vertex]! * 3;
      return [positions[offset]!, positions[offset + 1]!, positions[offset + 2]!];
    };
    const [a, b, c] = [point(index), point(index + 1), point(index + 2)];
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return volume;
};

describe('5.56x45 round profile estimate', () => {
  it('keeps bullet length unsourced and uses the named seating-depth assumption only for the model', () => {
    expect(natoCartridge.payload.length.min.value).toBeNull();
    const profile = roundProfiles(natoCartridge);
    const assumedBase =
      natoCartridge.case.length.value! - ASSUMED_BULLET_SEATING_DEPTH_CALIBRES * natoCartridge.payload.diameter.value!;
    expect(maximum(profile.bullet, 0)).toBeCloseTo(natoCartridge.overallLength.typical.value!, 6);
    expect(Math.min(...profile.bullet.map(([axial]) => axial))).toBeCloseTo(assumedBase, 6);
  });
});

describe('7.62x39 round profiles', () => {
  it('take cartridge lengths and principal diameters from sourced measurements', () => {
    expect(maximum(profiles.loadedCase, 1) * 2).toBeCloseTo(11.35, 6);
    expect(maximum(profiles.loadedCase, 0)).toBeCloseTo(38.7, 6);
    expect(maximum(profiles.bullet, 1) * 2).toBeCloseTo(7.92, 6);
    expect(maximum(profiles.bullet, 0)).toBeCloseTo(56, 6);
  });

  it('leaves the fired case open with a constant, declared wall thickness', () => {
    const mouth = profiles.firedCase.filter(([axial]) => axial === 38.7);
    expect(mouth.map(([, radius]) => radius)).toEqual([4.3, 4.3 - CASE_WALL_MM]);
    expect(profiles.firedCase.at(-1)![1]).toBe(0);
  });

  it('produces non-degenerate, outward-wound meshes for each revolved component', () => {
    for (const [id, profile] of Object.entries(profiles)) {
      const mesh = meshForRevolved(
        {
          id,
          kind: 'revolved',
          axis: 'x',
          creaseDegrees: 12,
          profile,
        },
        24,
      );
      expect(mesh.triangleCount, id).toBeGreaterThan(0);
      expect(signedVolume(mesh.positions, mesh.indices), id).toBeGreaterThan(0);
    }
  });
});
