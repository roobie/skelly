import { describe, expect, it } from 'vitest';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture, variant } from './helpers.ts';

const ARCHETYPE = 'archetype-anti-materiel';
const failures = (assembly: Assembly) => validate(assembly, gunDomain).issues;
const failedRules = (assembly: Assembly) => [...new Set(failures(assembly).map(({ rule }) => rule))].sort();

describe('the anti-materiel archetype', () => {
  it('passes every rule', () => {
    expect(failures(loadFixture(ARCHETYPE))).toEqual([]);
  });

  it('keeps the optic out of the hand room under the carry handle', () => {
    const assembly = variant(ARCHETYPE, (draft) => {
      draft.connections.find((connection) => connection.to === 'sight.base')!.slot = 3;
    });
    const issues = failures(assembly);
    expect(issues.map(({ rule }) => rule)).toEqual(['keep-out']);
    expect(issues[0]!.keepOut).toEqual({ part: 'handle', id: 'hand-room' });
    expect(issues[0]!.parts).toContain('sight');
  });
});

describe('shroud-fit', () => {
  it('fails a barrel that fills the cavity, naming the recoil room', () => {
    const issues = failures(loadFixture('broken-shroud-fit'));
    expect(issues.map(({ rule }) => rule)).toEqual(['shroud-fit']);
    expect(issues[0]!.message).toContain('room to recoil');
    expect(issues[0]!.parts).toEqual(['shroud', 'barrel']);
  });

  it('fails a shroud that reaches the muzzle device', () => {
    const assembly = variant(ARCHETYPE, (draft) => {
      draft.parts.barrel!.params!.length = 'S';
    });
    const issue = failures(assembly).find(({ rule }) => rule === 'shroud-fit');
    expect(issue?.message).toContain('short of the barrel muzzle');
  });

  it('accepts every shroud length on every barrel length a template offers', () => {
    for (const barrel of ['M', 'L']) {
      for (const shroud of ['M', 'L']) {
        const assembly = variant(ARCHETYPE, (draft) => {
          draft.parts.barrel!.params!.length = barrel;
          draft.parts.shroud!.params!.length = shroud;
        });
        expect(failedRules(assembly), `${barrel} barrel, ${shroud} shroud`).toEqual([]);
      }
    }
  });
});

describe('bipod-ground-clearance', () => {
  it('fails legs that end above the bottom of the magazine', () => {
    const issues = failures(loadFixture('broken-bipod-ground-clearance'));
    expect(issues.map(({ rule }) => rule)).toEqual(['bipod-ground-clearance']);
    expect(issues[0]!.parts).toEqual(['bipod', 'magazine']);
  });

  it('judges the legs by their reach, whichever pose the model shows', () => {
    for (const pose of ['folded', 'deployed']) {
      for (const [legs, expected] of [
        ['S', ['bipod-ground-clearance']],
        ['M', []],
        ['L', []],
      ] as const) {
        const assembly = variant(ARCHETYPE, (draft) => {
          Object.assign(draft.parts.bipod!.params!, { legs, pose });
        });
        expect(failedRules(assembly), `${legs} legs, ${pose}`).toEqual(expected);
      }
    }
  });

  it('is satisfied by a shorter magazine', () => {
    const assembly = variant('broken-bipod-ground-clearance', (draft) => {
      draft.parts.magazine!.params!.length = 'S';
    });
    expect(failedRules(assembly)).toEqual([]);
  });
});

describe('bipod and magazine', () => {
  it('keeps the legs clear of the magazine: a short shroud with long legs sweeps through it', () => {
    const assembly = variant(ARCHETYPE, (draft) => {
      draft.parts.shroud!.params!.length = 'S';
      draft.parts.bipod!.params!.legs = 'L';
    });
    const issues = failures(assembly);
    expect(issues.map(({ rule }) => rule)).toContain('keep-out');
    expect(issues.some(({ parts }) => parts.includes('bipod') && parts.includes('magazine'))).toBe(true);
  });

  it('lets every bipod and shroud pairing the template offers swing clear of the magazine', () => {
    for (const shroud of ['M', 'L']) {
      for (const legs of ['M', 'L']) {
        const assembly = variant(ARCHETYPE, (draft) => {
          draft.parts.shroud!.params!.length = shroud;
          draft.parts.bipod!.params!.legs = legs;
        });
        expect(failedRules(assembly), `${shroud} shroud, ${legs} legs`).toEqual([]);
      }
    }
  });
});
