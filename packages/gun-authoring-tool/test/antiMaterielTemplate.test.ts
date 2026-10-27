import { generate } from '@skelly/engine/assembly/generate.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { antiMateriel } from '../src/gun/templates.ts';
import { sweepGroup } from './sweeps.ts';

describe('anti-materiel template', () => {
  it('offers bipod legs that clear the magazine and excludes those that do not', () => {
    const offered = antiMateriel.slots.find(({ id }) => id === 'bipod')?.params?.legs;
    const all = FAMILIES.bipod?.params.legs?.values;
    if (!(Array.isArray(offered) && all)) {
      throw new Error('anti-materiel bipod legs are missing');
    }
    const reportFor = (legs: string) => {
      const template = {
        ...antiMateriel,
        slots: antiMateriel.slots.map((slot) =>
          slot.id === 'bipod' ? { ...slot, params: { ...slot.params, legs } } : slot,
        ),
      };
      return validate(generate(template, gunDomain, 0), gunDomain);
    };
    for (const legs of all) {
      const clearanceIssues = reportFor(legs).issues.filter(({ rule }) => rule === 'bipod-ground-clearance');
      expect(clearanceIssues.length > 0).toBe(!offered.includes(legs));
    }
  });

  sweepGroup('generator', () => {
    it('builds only valid rifles', () => {
      for (let seed = 0; seed < 40; seed++) {
        const { issues } = validate(generate(antiMateriel, gunDomain, seed), gunDomain);
        expect(
          issues.map(({ rule }) => rule),
          `seed ${seed}`,
        ).toEqual([]);
      }
    });
  });
});
