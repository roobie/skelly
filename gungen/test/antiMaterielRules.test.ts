import type { Assembly } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture, variant } from './helpers.ts';

const ARCHETYPE = 'archetype-anti-materiel';
const failures = (assembly: Assembly) => validate(assembly, gunDomain).issues;
const failedRules = (assembly: Assembly) => [...new Set(failures(assembly).map(({ rule }) => rule))].sort();

describe('shroud-fit', () => {
  it('fails a barrel that fills the cavity, naming the recoil room', () => {
    const issues = failures(loadFixture('broken-shroud-fit'));
    expect(issues.map(({ rule }) => rule)).toEqual(['shroud-fit']);
    expect(issues[0]!.message).toContain('room to recoil');
    expect(issues[0]!.parts).toEqual(['shroud', 'barrel']);
  });

  it('fails a shroud that stops too near the muzzle for the brake to sit on a free barrel', () => {
    const assembly = variant(ARCHETYPE, (draft) => {
      draft.parts.barrel!.params!.length = 'S';
    });
    const issue = failures(assembly).find(({ rule }) => rule === 'shroud-fit');
    expect(issue?.message).toContain('short of the barrel muzzle');
  });
});

describe('bipod-ground-clearance', () => {
  it('fails legs that end above the bottom of the magazine, naming both parts', () => {
    const issues = failures(loadFixture('broken-bipod-ground-clearance'));
    expect(issues.map(({ rule }) => rule)).toEqual(['bipod-ground-clearance']);
    expect(issues[0]!.parts).toEqual(['bipod', 'magazine']);
  });

  it('judges the legs by their reach, not by the pose the model shows', () => {
    const shortFolded = variant(ARCHETYPE, (draft) => {
      Object.assign(draft.parts.bipod!.params!, { legs: 'S', pose: 'folded' });
    });
    expect(failedRules(shortFolded)).toEqual(['bipod-ground-clearance']);
  });

  it('passes the same rifle once the legs are long enough to reach below the magazine', () => {
    const assembly = variant('broken-bipod-ground-clearance', (draft) => {
      draft.parts.bipod!.params!.legs = 'M';
    });
    expect(failedRules(assembly)).toEqual([]);
  });
});

describe('bipod and magazine', () => {
  it('sweeps the long legs of a short shroud through the magazine', () => {
    const assembly = variant(ARCHETYPE, (draft) => {
      draft.parts.shroud!.params!.length = 'S';
      draft.parts.bipod!.params!.legs = 'L';
    });
    const issues = failures(assembly);
    expect(issues.map(({ rule }) => rule)).toContain('keep-out');
    expect(issues.some(({ parts }) => parts.includes('bipod') && parts.includes('magazine'))).toBe(true);
  });

  it('lets the tightest pairing a template offers swing clear: an M shroud with L legs', () => {
    const assembly = variant(ARCHETYPE, (draft) => {
      draft.parts.shroud!.params!.length = 'M';
      draft.parts.bipod!.params!.legs = 'L';
    });
    expect(failedRules(assembly)).toEqual([]);
  });
});
