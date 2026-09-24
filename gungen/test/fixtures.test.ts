import { describe, expect, it } from 'vitest';
import { RULE_IDS } from '../src/core/issue.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixtures } from './helpers.ts';

const fixtures = loadFixtures();

describe('fixtures', () => {
  it('has a valid fixture and a broken fixture for every rule', () => {
    expect(fixtures.filter((f) => f.expect?.length === 0)).toHaveLength(1);
    const covered = new Set(fixtures.flatMap((f) => f.expect ?? []));
    for (const rule of RULE_IDS.filter((r) => r !== 'structure')) expect(covered).toContain(rule);
  });

  for (const fixture of fixtures) {
    it(`${fixture.name} fails exactly ${JSON.stringify(fixture.expect)}`, () => {
      const report = validate(fixture, gunDomain);
      const failed = [...new Set(report.issues.map((i) => i.rule))].sort();
      expect(failed).toEqual([...(fixture.expect ?? [])].sort());
    });
  }

  it('places every part of every fixture', () => {
    for (const fixture of fixtures) {
      const { resolved } = validate(fixture, gunDomain);
      expect([...resolved.placed.keys()].sort()).toEqual(Object.keys(fixture.parts).sort());
    }
  });
});
