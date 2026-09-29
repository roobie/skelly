import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { createPalette, GUN_PALETTE, hexToSrgb, solidColor, srgbToHex } from '../src/gun/palette.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixtures } from './helpers.ts';
import { sweepGroup } from './sweeps.ts';

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

const fixtureAssemblies = (): Assembly[] => loadFixtures().filter((f) => f.name.startsWith('archetype-'));
const sweptAssemblies = (): Assembly[] =>
  TEMPLATES.flatMap((t) => Array.from({ length: SEEDS }, (_, seed) => generate(t, gunDomain, seed)));

/** Every (role, solid id) pair rendered by the given assemblies. */
const renderedSolids = (assemblies: Assembly[]): { family: string; id: string }[] =>
  assemblies.flatMap((a) =>
    [...resolve(a, gunDomain).defs.values()].flatMap((def) =>
      (def.displaySolids ?? def.solids).map((s) => ({ family: def.family, id: s.id })),
    ),
  );

describe('palette migration', () => {
  const oldColored = (assemblies: Assembly[]) =>
    renderedSolids(assemblies).filter((x) => x.family in OLD_FAMILY_COLORS || x.id === 'floorplate');
  const mismatches = (solids: { family: string; id: string }[]) =>
    solids
      .filter(({ family, id }) => srgbToHex(solidColor(GUN_PALETTE, family, id)) !== oldColor(family, id))
      .map(({ family, id }) => `${family}/${id}`);

  it('reproduces the old FAMILY_COLORS lookup bit-identically for every archetype solid of a role that had a colour', () => {
    const old = oldColored(fixtureAssemblies());
    expect(old.length).toBeGreaterThan(50);
    expect(mismatches(old)).toEqual([]);
  });

  sweepGroup('reproduces the old FAMILY_COLORS lookup bit-identically across the template sweep', () => {
    it('passes', () => {
      const old = oldColored(sweptAssemblies());
      expect(old.length).toBeGreaterThan(1000);
      expect(mismatches(old)).toEqual([]);
    });
  });
});

describe('palette coverage', () => {
  /** Every role any family can report: defaults, plus each param varied on its own across all its values. */
  const reportedRoles = (): Set<string> => {
    const roles = new Set<string>();
    for (const family of Object.values(FAMILIES)) {
      const defaults = Object.fromEntries(Object.entries(family.params).map(([k, spec]) => [k, spec.default]));
      roles.add(family.build(defaults).family);
      for (const [name, spec] of Object.entries(family.params)) {
        for (const value of spec.values) {
          roles.add(family.build({ ...defaults, [name]: value }).family);
        }
      }
    }
    return roles;
  };

  it('has a family colour for every role a family build can report', () => {
    for (const role of reportedRoles()) {
      expect(GUN_PALETTE.familyColors, role).toHaveProperty(role);
    }
  });

  const usingFallback = (assemblies: Assembly[]) => {
    const fallback = srgbToHex(GUN_PALETTE.fallbackColor);
    return renderedSolids(assemblies)
      .filter(({ family, id }) => srgbToHex(solidColor(GUN_PALETTE, family, id)) === fallback)
      .map(({ family, id }) => `${family}/${id}`);
  };

  it('never needs the fallback for any solid of any archetype', () => {
    expect(usingFallback(fixtureAssemblies())).toEqual([]);
  });

  sweepGroup('never needs the fallback for any solid of the template sweep', () => {
    it('passes', () => {
      expect(usingFallback(sweptAssemblies())).toEqual([]);
    });
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
