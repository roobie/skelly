import { describe, expect, it } from 'vitest';
import { CORE_RULE_IDS } from '../src/core/issue.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixtures } from './helpers.ts';

const fixtures = loadFixtures();

describe('fixtures', () => {
  it('has a broken fixture for every core and gun rule', () => {
    const covered = new Set(fixtures.flatMap((f) => f.expect ?? []));
    const rules = [...CORE_RULE_IDS.filter((r) => r !== 'structure'), ...(gunDomain.rules ?? []).map((r) => r.id)];
    for (const rule of rules) {
      expect(covered).toContain(rule);
    }
  });

  it('covers every archetype, and every archetype is valid', () => {
    const archetypes = fixtures.filter((f) => f.name.startsWith('archetype-'));
    expect(archetypes.map((f) => f.name).sort()).toEqual([
      'archetype-bolt-rifle',
      'archetype-bolt-rifle-box',
      'archetype-bullpup',
      'archetype-pump-shotgun',
      'archetype-rifle',
      'archetype-smg',
    ]);
    for (const f of archetypes) {
      expect(f.expect).toEqual([]);
    }
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
