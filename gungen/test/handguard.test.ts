import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';

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

  it('keeps every generated template handguard within its receiver over 1,000 seeds', () => {
    for (const template of TEMPLATES) {
      for (let seed = 0; seed < 1000; seed++) {
        const report = validate(generate(template, gunDomain, seed), gunDomain);
        expect(
          report.issues.filter(({ rule }) => rule === 'handguard-fit'),
          `${template.name} seed ${seed}`,
        ).toEqual([]);
      }
    }
  }, 60_000);
});
