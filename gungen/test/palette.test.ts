import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly } from '@skelly/engine/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { createPalette, GUN_PALETTE, hexToSrgb, solidColor, srgbToHex } from '../src/gun/palette.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus, loadFixtures } from './helpers.ts';

/** Reference family colours; the cap lug and compound-stock roles intentionally have distinct per-solid colours. */
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
const BUTT_PAD_COLOR = 0x2f_32_38;
const OLD_FALLBACK = 0x88_88_88;

const oldColor = (family: string, solidId: string): number => {
  let color = OLD_FAMILY_COLORS[family] ?? OLD_FALLBACK;
  if (solidId === 'floorplate') {
    color = OLD_MAGAZINE_FLOORPLATE;
  }
  if (solidId === 'butt-pad') {
    color = BUTT_PAD_COLOR;
  }
  return color;
};

const fixtureAssemblies = (): Assembly[] => loadFixtures().filter((f) => f.name.startsWith('archetype-'));
// Replaces the former CI-only template sweeps (PROJECT.md, "Generator tests", removal plan (a)):
// every fixture, broken-* ones included (none exists to break a colour), plus every published design.
const corpusAssemblies = (): Assembly[] => loadCorpus(() => true).map(({ assembly }) => assembly);

/** Every role, solid id, and optional explicit solid material rendered by the given assemblies. */
const renderedSolids = (assemblies: Assembly[]): { family: string; id: string; material?: string }[] =>
  assemblies.flatMap((a) =>
    [...resolve(a, gunDomain).defs.values()].flatMap((def) =>
      (def.displaySolids ?? def.solids).map((s) => ({
        family: def.family,
        id: s.display?.role ?? s.id,
        ...(s.material ? { material: s.material } : {}),
      })),
    ),
  );

describe('palette migration', () => {
  const compoundStockRoles = new Set(['fore-stock', 'stock-wrist', 'grip', 'stock-joint', 'stock-comb', 'cut-stub']);
  const oldColored = (assemblies: Assembly[]) =>
    renderedSolids(assemblies).filter(
      (x) =>
        !x.material &&
        x.id !== 'cap-lug' &&
        !(x.family === 'stock' && compoundStockRoles.has(x.id)) &&
        x.family in OLD_FAMILY_COLORS,
    );
  const mismatches = (solids: ReturnType<typeof renderedSolids>) =>
    solids
      .filter(
        ({ family, id, material }) => srgbToHex(solidColor(GUN_PALETTE, family, id, material)) !== oldColor(family, id),
      )
      .map(({ family, id }) => `${family}/${id}`);

  it('preserves ordinary family role colours for every archetype', () => {
    const old = oldColored(fixtureAssemblies());
    expect(old.length).toBeGreaterThan(50);
    expect(mismatches(old)).toEqual([]);
  });

  // Resolves role colours across every fixture and published design.
  it('preserves ordinary family role colours across every fixture and design', {
    timeout: 10_000,
  }, () => {
    const old = oldColored(corpusAssemblies());
    expect(old.length).toBeGreaterThan(100);
    expect(mismatches(old)).toEqual([]);
  });
});

describe('palette coverage', () => {
  it('colours the tapered-stock recoil pad by its explicit rubber material', () => {
    expect(srgbToHex(solidColor(GUN_PALETTE, 'stock', 'butt-pad', 'rubber-black'))).toBe(
      srgbToHex(GUN_PALETTE.materials!['rubber-black']!),
    );
  });

  it('colours the pump tube cap from its explicit blued-steel material', () => {
    const capLugColor = srgbToHex(solidColor(GUN_PALETTE, 'tube-magazine', 'cap-lug', 'steel-blued'));
    expect(capLugColor).toBe(srgbToHex(GUN_PALETTE.materials!['steel-blued']!));
    expect(capLugColor).not.toBe(srgbToHex(solidColor(GUN_PALETTE, 'tube-magazine', 'tube')));
    expect(capLugColor).not.toBe(srgbToHex(solidColor(GUN_PALETTE, 'tube-magazine', 'support-band')));
  });

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

  // Checks fallback appearance resolution across the full corpus.
  it('never needs the fallback for any solid of any fixture or design', { timeout: 10_000 }, () => {
    expect(usingFallback(corpusAssemblies())).toEqual([]);
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
