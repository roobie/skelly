import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PROJECT.md cites code as `src/...ts#symbol`, not by line number, so a citation
// only goes stale when the symbol is renamed or removed. deadvox citations
// (`deadvox/src/...`) point at another package and are not checked here.

const root = new URL('../', import.meta.url);
const doc = readFileSync(new URL('PROJECT.md', root), 'utf8');

const citations = [...doc.matchAll(/(?<![\w/])(src\/(?:[\w-]+\/)*[\w-]+\.ts)#([A-Za-z_$][\w$]*)/g)].map((m) => ({
  file: m[1] as string,
  symbol: m[2] as string,
}));

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('PROJECT.md code citations', () => {
  it('has citations to check', () => {
    expect(citations.length).toBeGreaterThan(0);
  });

  it('has no file:line citations into gungen/src', () => {
    expect(doc.match(/(?<![\w/])src\/(?:[\w-]+\/)*[\w-]+\.ts:\d+/g) ?? []).toEqual([]);
  });

  it.each(citations.map((c) => [`${c.file}#${c.symbol}`, c] as const))(
    '%s names a symbol in that file',
    (_label, c) => {
      const path = new URL(c.file, root);
      expect(existsSync(path), `${c.file} does not exist`).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(
        new RegExp(`(?<![\\w$])${escapeRegExp(c.symbol)}(?![\\w$])`).test(source),
        `${c.symbol} not in ${c.file}`,
      ).toBe(true);
    },
  );
});
