import { describe, expect, it } from 'vitest';
import { parseCartridge } from '../src/ammo/parseCartridge.ts';
import { CARTRIDGE_RULES, validateCartridge } from '../src/ammo/rules.ts';
import { hasPath, loadBrokenFixtures, mustParse, patchedJson } from './ammoHelpers.ts';

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
        const json = patchedJson(fixture);
        const issues = validateCartridge(mustParse(json, fixture.name));
        const failed = [...new Set(issues.map((issue) => issue.rule))].sort();
        expect(failed).toEqual([...(fixture.expect ?? [])].sort());
        // An issue is only useful if it says what is wrong and where. A path with a space is a label
        // for a computed quantity ('rim thickness + groove width'), not a field.
        for (const issue of issues) {
          expect(issue.message, `${issue.rule} message`).not.toBe('');
          if (!issue.path.includes(' ')) {
            expect(hasPath(json, issue.path), `${issue.rule} path ${issue.path}`).toBe(true);
          }
        }
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
