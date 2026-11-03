import { describe, expect, it } from 'vitest';
import { damageToActor } from '../src/core/actorSystem.ts';
import { BODY_REGIONS, type BodyRegion } from '../src/core/body.ts';

const BURN_KIND = 'fixture_burn';
const resistance = (amount: number) =>
  Object.fromEntries(BODY_REGIONS.map((region) => [region, amount])) as Record<BodyRegion, number>;

describe('actor resistance by declared kind', () => {
  it('leaves an unresisted kind taking the full amount', () => {
    expect(damageToActor({}, 10, 'fixture_burn', 'torso')).toBe(10);
  });

  it('makes a fully resisted kind immune without resisting other kinds', () => {
    const type = { damageResistance: { [BURN_KIND]: resistance(1) } };
    expect(damageToActor(type, 10, 'fixture_burn', 'torso')).toBe(0);
    expect(damageToActor(type, 10, 'fixture_other', 'torso')).toBe(10);
  });

  it('applies fractional resistance only to the selected region', () => {
    const type = { damageResistance: { [BURN_KIND]: { ...resistance(0), torso: 0.25 } } };
    expect(damageToActor(type, 8, 'fixture_burn', 'torso')).toBeCloseTo(6);
    expect(damageToActor(type, 8, 'fixture_burn', 'head')).toBe(8);
  });
});
