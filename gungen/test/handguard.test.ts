import { describe, expect, it } from 'vitest';
import { localSolidBounds } from '../src/core/geometry.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus } from './helpers.ts';

describe('barrel-fitted handguards', () => {
  it('derives its opening from the barrel and caps outer dimensions at the receiver face', () => {
    const expected = { S: 1.5, M: 1.75, L: 2 } as const;
    for (const bore of ['S', 'M', 'L'] as const) {
      const handguard = FAMILIES.handguard!.build({ length: 'L', barrelBore: bore, bore });
      const top = handguard.solids.find(({ id }) => id === 'top')!;
      const side = handguard.solids.find(({ id }) => id === 'right')!;
      expect(top.kind).toBe('box');
      expect(side.kind).toBe('box');
      if (top.kind !== 'box' || side.kind !== 'box') {
        throw new Error('Expected box slabs for the handguard.');
      }
      expect(top.box.center[1] + top.box.half[1]).toBeLessThanOrEqual(2.5);
      expect(top.box.center[2] + top.box.half[2]).toBeLessThanOrEqual(2);
      expect(top.box.center[1] - top.box.half[1]).toBeCloseTo({ S: 1, M: 1.25, L: 1.5 }[bore]);
      expect(top.box.center[1] + top.box.half[1]).toBe(expected[bore]);
      expect(side.box.center[2] + side.box.half[2]).toBeLessThanOrEqual(2);
    }

    // On 3c789ef an explicitly selected L inner size produced a 6u cross-section.
    const legacyL = FAMILIES.handguard!.build({ length: 'L', inner: 'L', bore: 'L' });
    const legacyTop = legacyL.solids.find(({ id }) => id === 'top')!;
    expect(legacyTop.kind).toBe('box');
    if (legacyTop.kind === 'box') {
      expect(legacyTop.box.center[1] + legacyTop.box.half[1]).toBeLessThanOrEqual(2.5);
    }
  });

  it('closes the AK upper handguard around the gas cylinder on top of the lower handguard', () => {
    const handguard = FAMILIES.handguard!.build({ length: 'M', layout: 'ak' });
    const bounds = (id: string) => localSolidBounds(handguard.solids.find((solid) => solid.id === id)!);
    const top = bounds('upper-top');
    for (const side of ['left', 'right']) {
      const upper = bounds(`upper-${side}`);
      expect(upper[1][1], side).toBe(top[0][1]);
      expect(upper[0][1], side).toBe(bounds(side)[1][1]);
    }
  });

  it('uses independent 65% standard reach and the shorter AK gas-port reach', () => {
    const expectedStandard = { S: 17, M: 23.5, L: 30 };
    const expectedAk = { S: 8, M: 14, L: 22 };
    for (const size of ['S', 'M', 'L'] as const) {
      const reach = (layout: 'standard' | 'ak') => {
        const handguard = FAMILIES.handguard!.build({ length: size, layout, mount: 'free-float' });
        return Math.max(...handguard.solids.map((solid) => localSolidBounds(solid)[1][0]));
      };
      expect(reach('standard')).toBe(expectedStandard[size]);
      expect(reach('ak')).toBe(expectedAk[size]);
    }
  });

  // Replaces the former CI-only seed sweep (PROJECT.md, "Generator tests", removal plan (a)):
  // the property is checked on every non-broken fixture and every published design.
  // broken-handguard-fit and the other broken-* fixtures are skipped: they exist to break a rule.
  // Checks receiver containment across every fixture and published design.
  it('keeps the handguard within its receiver in every fixture and design', { timeout: 20_000 }, () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(22);
    for (const { label, assembly } of corpus) {
      const report = validate(assembly, gunDomain);
      expect(
        report.issues.filter(({ rule }) => rule === 'handguard-fit'),
        label,
      ).toEqual([]);
    }
  });
});
