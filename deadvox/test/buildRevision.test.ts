import { describe, expect, it } from 'vitest';
import { buildRevisionFromGit } from '../src/core/buildRevision.ts';

describe('build revision', () => {
  it('uses the dirty-aware git describe identity, tested with a stubbed git command', () => {
    const argsSeen: string[][] = [];
    const stubGit =
      (revision: string) =>
      (args: readonly string[]): string => {
        argsSeen.push([...args]);
        return ` ${revision}\n`;
      };
    const clean = buildRevisionFromGit(stubGit('deadbeef'));
    const dirty = buildRevisionFromGit(stubGit('deadbeef-dirty'));
    expect(clean).toBe('deadbeef');
    expect(dirty).toBe('deadbeef-dirty');
    expect(clean).not.toBe(dirty);
    expect(argsSeen).toEqual([
      ['describe', '--always', '--dirty', '--abbrev=40'],
      ['describe', '--always', '--dirty', '--abbrev=40'],
    ]);
  });
});
