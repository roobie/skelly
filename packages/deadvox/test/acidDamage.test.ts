import { describe, expect, it } from 'vitest';
import { acidDamageToZombie } from '../src/core/zombies.ts';

describe('zombie acid resistance', () => {
  it('leaves a type without acidResistance taking the full amount', () => {
    expect(acidDamageToZombie({}, 10)).toBe(10);
  });

  it('makes a type with acidResistance 1 immune', () => {
    expect(acidDamageToZombie({ acidResistance: 1 }, 10)).toBe(0);
  });

  it('removes a partial resistance’s share of the amount', () => {
    expect(acidDamageToZombie({ acidResistance: 0.25 }, 8)).toBeCloseTo(6);
  });
});
