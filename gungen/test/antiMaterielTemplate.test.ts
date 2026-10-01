import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { antiMateriel } from '../src/gun/templates.ts';
import { sweepGroup } from './sweeps.ts';

describe('anti-materiel template', () => {
  // S legs exist for the ground-clearance fixture; no standard magazine is short enough for them to clear.
  it('offers only the bipod legs that clear the 10-round magazine', () => {
    const legs = antiMateriel.slots.find(({ id }) => id === 'bipod')?.params?.legs;
    expect(legs).toEqual(['M', 'L']);
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
