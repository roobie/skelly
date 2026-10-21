import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly } from '@skelly/engine/assembly/schema.ts';
import { solidColor, srgbToHex } from '@skelly/thing-export/appearance.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { createPalette, GUN_PALETTE, hexToSrgb } from '../src/gun/palette.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus } from './helpers.ts';

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

describe('palette coverage', () => {
  it('colours the tapered-stock recoil pad by its explicit rubber material', () => {
    expect(srgbToHex(solidColor(GUN_PALETTE, 'stock', 'butt-pad', 'rubber-black'))).toBe(
      srgbToHex(GUN_PALETTE.materials!['rubber-black']!.colour),
    );
  });

  it('colours the pump tube cap from its explicit blued-steel material', () => {
    const capLugColor = srgbToHex(solidColor(GUN_PALETTE, 'tube-magazine', 'cap-lug', 'steel-blued'));
    expect(capLugColor).toBe(srgbToHex(GUN_PALETTE.materials!['steel-blued']!.colour));
    expect(capLugColor).not.toBe(srgbToHex(solidColor(GUN_PALETTE, 'tube-magazine', 'tube')));
    expect(capLugColor).not.toBe(srgbToHex(solidColor(GUN_PALETTE, 'tube-magazine', 'support-band')));
  });

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

  it('never needs the fallback for any solid of any fixture or design', { timeout: 10_000 }, () => {
    const solids = renderedSolids(loadCorpus(() => true).map(({ assembly }) => assembly));
    expect(solids.length).toBeGreaterThan(0);
    const fallback = srgbToHex(GUN_PALETTE.fallbackColor);
    expect(
      solids
        .filter(({ family, id }) => srgbToHex(solidColor(GUN_PALETTE, family, id)) === fallback)
        .map(({ family, id }) => `${family}/${id}`),
    ).toEqual([]);
  });
});

describe('palette construction', () => {
  const base = {
    familyColors: {},
    specialColors: {},
    fallbackColor: hexToSrgb(0x88_88_88),
    fallbackFinish: { metallic: 0, roughness: 0.85 },
  } as const;

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
      fallbackFinish: { metallic: 0, roughness: 0.85 },
    });
    expect(solidColor(p, 'a', 's')).toEqual([0.2, 0.2, 0.2]);
    expect(solidColor(p, 'a', 't')).toEqual([0.1, 0.1, 0.1]);
    expect(solidColor(p, 'zzz', 't')).toEqual([0.3, 0.3, 0.3]);
  });
});
