import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { CASE_WALL_MM, roundProfiles } from '../src/ammo/roundProfile.ts';
import { meshForRevolved } from '../src/core/revolve.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;
const round = roundProfiles(cartridge);
const maxOf = (profile: readonly (readonly [number, number])[], axis: 0 | 1) =>
  Math.max(...profile.map((p) => p[axis]));

describe('7.62x39 round profiles', () => {
  it('take their outline from the cartridge data', () => {
    // Head diameter and case length are C.I.P. maxima; the tip sits at the typical overall length.
    expect(maxOf(round.loadedCase, 1) * 2).toBeCloseTo(11.35, 6);
    expect(maxOf(round.loadedCase, 0)).toBeCloseTo(38.7, 6);
    expect(maxOf(round.bullet, 1) * 2).toBeCloseTo(7.92, 6);
    expect(maxOf(round.bullet, 0)).toBeCloseTo(56, 6);
  });

  it('leave the fired case open at the mouth with a wall of the assumed thickness', () => {
    const mouth = round.firedCase.filter((p) => p[0] === 38.7);
    expect(mouth.map((p) => p[1])).toEqual([4.3, 4.3 - CASE_WALL_MM]);
    // The inside floor closes on the axis, so the profile ends there.
    expect(round.firedCase.at(-1)![1]).toBe(0);
  });

  it('are traversed material-on-the-left, so each closed solid has positive enclosed volume', () => {
    // A profile run the wrong way round flips every normal and is culled away in the viewer; its
    // signed volume (sum of tetrahedra to the origin) comes out negative.
    for (const [name, profile] of Object.entries(round)) {
      const mesh = meshForRevolved({ id: name, kind: 'revolved', profile, facets: 24 });
      let volume = 0;
      for (let t = 0; t < mesh.triangleCount; t++) {
        const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[t * 3 + k]! * 3);
        const p = (i: number) => [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!] as const;
        const [pa, pb, pc] = [p(a!), p(b!), p(c!)];
        volume +=
          (pa[0] * (pb[1] * pc[2] - pb[2] * pc[1]) -
            pa[1] * (pb[0] * pc[2] - pb[2] * pc[0]) +
            pa[2] * (pb[0] * pc[1] - pb[1] * pc[0])) /
          6;
      }
      expect(volume, name).toBeGreaterThan(0);
    }
  });
});
