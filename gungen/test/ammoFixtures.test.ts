import { describe, expect, it } from 'vitest';
import { parseCartridge } from '../src/ammo/parseCartridge.ts';
import { CARTRIDGE_RULES, validateCartridge } from '../src/ammo/rules.ts';
import { loadBrokenFixtures, mustParse, patchedJson } from './ammoHelpers.ts';

// Broken cartridges, in the style of fixtures/ for assemblies: each file names a base (a real
// cartridge or a synthetic shape), patches a few paths and lists the rules it must fail, exactly.
// A patch is used instead of a full copy so each file shows the one thing that is wrong.

const fixtures = loadBrokenFixtures();

describe('broken cartridge fixtures', () => {
  it('has a broken fixture for every rule', () => {
    const covered = new Set(fixtures.flatMap((f) => f.expect ?? []));
    for (const rule of CARTRIDGE_RULES) {
      expect(covered, rule.id).toContain(rule.id);
    }
  });

  for (const fixture of fixtures) {
    if (fixture.expectParseError === undefined) {
      it(`${fixture.name} fails exactly ${JSON.stringify(fixture.expect)}`, () => {
        const cartridge = mustParse(patchedJson(fixture), fixture.name);
        const failed = [...new Set(validateCartridge(cartridge).map((issue) => issue.rule))].sort();
        expect(failed).toEqual([...(fixture.expect ?? [])].sort());
      });
    } else {
      it(`${fixture.name} fails to parse at ${fixture.expectParseError}`, () => {
        const result = parseCartridge(patchedJson(fixture));
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.path).toBe(fixture.expectParseError);
      });
    }
  }
});
