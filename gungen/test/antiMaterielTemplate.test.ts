import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { antiMateriel } from '../src/gun/templates.ts';
import { sweepGroup } from './sweeps.ts';

describe('anti-materiel template', () => {
  it('is built from the anti-materiel families', () => {
    expect(antiMateriel.name).toBe('anti-materiel');
    expect(antiMateriel.slots.map(({ family }) => family)).toEqual(
      expect.arrayContaining(['barrel-shroud', 'muzzle-brake', 'bipod', 'carry-handle', 'recoil-stock', 'monopod']),
    );
  });

  it('never offers a bipod leg class or shroud length that the rules reject', () => {
    const offered = (slotId: string, param: string) => {
      const choice = antiMateriel.slots.find(({ id }) => id === slotId)?.params?.[param];
      return Array.isArray(choice) ? choice : [choice];
    };
    expect(offered('bipod', 'legs')).toEqual(['M', 'L']);
    expect(offered('shroud', 'length')).toEqual(['M', 'L']);
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
