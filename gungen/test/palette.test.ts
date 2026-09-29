import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { createPalette, GUN_PALETTE, hexToSrgb, solidColor, srgbToHex } from '../src/gun/palette.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixtures } from './helpers.ts';

/** Frozen copy of the pre-palette scene.ts table; the migration must not change any colour it produced. */
const OLD_FAMILY_COLORS: Record<string, number> = {
  receiver: 0x8d_93_9c,
  lower: 0x6f_75_7e,
  barrel: 0x5d_63_6b,
  'tube-magazine': 0x4d_53_5b,
  forend: 0x8a_6a_52,
  handguard: 0x74_80_5f,
  grip: 0x7d_60_4c,
  magazine: 0x56_62_76,
  stock: 0x8a_6a_52,
  sight: 0x3f_46_50,
};
const OLD_MAGAZINE_FLOORPLATE = 0x35_42_58;
const OLD_FALLBACK = 0x88_88_88;

const oldColor = (family: string, solidId: string): number => {
  let color = OLD_FAMILY_COLORS[family] ?? OLD_FALLBACK;
  if (solidId === 'floorplate') {
    color = OLD_MAGAZINE_FLOORPLATE;
  }
  return color;
};

const SEEDS = 40;

const assemblies = (): Assembly[] => [
  ...loadFixtures().filter((f) => f.name.startsWith('archetype-')),
  ...TEMPLATES.flatMap((t) => Array.from({ length: SEEDS }, (_, seed) => generate(t, gunDomain, seed))),
];

describe('palette migration', () => {
  it('reproduces the old FAMILY_COLORS lookup bit-identically for every solid', () => {
    let checked = 0;
    for (const assembly of assemblies()) {
      for (const def of resolve(assembly, gunDomain).defs.values()) {
        for (const s of def.displaySolids ?? def.solids) {
          expect(srgbToHex(solidColor(GUN_PALETTE, def.family, s.id)), `${def.family}/${s.id}`).toBe(
            oldColor(def.family, s.id),
          );
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('palette construction', () => {
  const base = { familyColors: {}, specialColors: {}, fallbackColor: hexToSrgb(0x88_88_88) } as const;

  it('round-trips hex through normalized sRGB', () => {
    for (const hex of [0x00_00_00, 0xff_ff_ff, 0x8d_93_9c, 0x35_42_58]) {
      expect(srgbToHex(hexToSrgb(hex))).toBe(hex);
    }
  });

  it('rejects non-finite and out-of-range channels', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
      expect(() => createPalette({ ...base, familyColors: { x: [bad, 0, 0] } })).toThrow('family x');
      expect(() => createPalette({ ...base, specialColors: { y: [0, bad, 0] } })).toThrow('special y');
      expect(() => createPalette({ ...base, fallbackColor: [0, 0, bad] })).toThrow('fallback');
    }
  });

  it('lets a special colour win over the family colour, and falls back for unknown families', () => {
    const p = createPalette({
      familyColors: { a: [0.1, 0.1, 0.1] },
      specialColors: { s: [0.2, 0.2, 0.2] },
      fallbackColor: [0.3, 0.3, 0.3],
    });
    expect(solidColor(p, 'a', 's')).toEqual([0.2, 0.2, 0.2]);
    expect(solidColor(p, 'a', 't')).toEqual([0.1, 0.1, 0.1]);
    expect(solidColor(p, 'zzz', 't')).toEqual([0.3, 0.3, 0.3]);
  });

  it('uses #888888 as the explicit fallback', () => {
    expect(srgbToHex(GUN_PALETTE.fallbackColor)).toBe(0x88_88_88);
  });
});
