import { describe, expect, it } from 'vitest';
import { CORE_RULE_IDS } from '../src/core/issue.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixtures } from './helpers.ts';

const fixtures = loadFixtures();

describe('fixtures', () => {
  it('has a broken fixture for every core and gun rule', () => {
    const covered = new Set(fixtures.flatMap((f) => f.expect ?? []));
    // Revolver part-internal alignment predicates are covered by synthetic malformed Resolved values
    // in revolverRules.test.ts; assembly JSON cannot alter their convex part geometry.
    const revolverUnitRules = new Set([
      'revolver-top-chamber-bore',
      'revolver-cylinder-axis',
      'revolver-cylinder-gap',
      'revolver-topstrap-span',
      'revolver-grip-joint',
      'revolver-trigger-bow',
    ]);
    const rules = [
      ...CORE_RULE_IDS.filter((r) => r !== 'structure'),
      ...(gunDomain.rules ?? []).map((r) => r.id).filter((id) => !revolverUnitRules.has(id)),
    ];
    for (const rule of rules) {
      expect(covered).toContain(rule);
    }
  });

  it('covers every archetype, and every archetype is valid', () => {
    const archetypes = fixtures.filter((f) => f.name.startsWith('archetype-'));
    expect(archetypes.map((f) => f.name).sort()).toEqual([
      'archetype-ak',
      'archetype-anti-materiel',
      'archetype-ar',
      'archetype-ar-free-float',
      'archetype-awm',
      'archetype-battle-rifle',
      'archetype-bolt-rifle',
      'archetype-bolt-rifle-box',
      'archetype-pistol',
      'archetype-pump-shotgun',
      'archetype-revolver',
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

  // Measured about 4.5 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('places every part of every fixture', { timeout: 25_000 }, () => {
    for (const fixture of fixtures) {
      const { resolved } = validate(fixture, gunDomain);
      expect([...resolved.placed.keys()].sort()).toEqual(Object.keys(fixture.parts).sort());
    }
  });
});
