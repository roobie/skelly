import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR 0001: screens in these source trees are rendered with lit-html. Inventory remains to be ported.
const NOT_YET_PORTED = new Set(['src/ui/inventoryScreen.ts']);
const DIRECTORIES = ['src/ui', 'src/debug'];

// Hand-built DOM: creating, attaching or rewriting nodes instead of rendering a template.
const HAND_DOM =
  /\b(createElement|replaceChildren|appendChild|insertAdjacent\w*)\b|\.append\(|\.(innerHTML|textContent)\s*=/;

const readSources = (dir: string): { file: string; text: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return readSources(path);
    }
    return entry.name.endsWith('.ts') ? [{ file: path, text: readFileSync(path, 'utf8') }] : [];
  });

const sources = DIRECTORIES.flatMap(readSources);

describe('UI source draws with lit-html (ADR 0001)', () => {
  it('has no hand-built DOM outside the not-yet-ported files', () => {
    const offenders = sources.filter((source) => !NOT_YET_PORTED.has(source.file) && HAND_DOM.test(source.text));
    expect(offenders.map((source) => source.file)).toEqual([]);
  });

  it('lists only existing files that still build DOM by hand', () => {
    const stale = [...NOT_YET_PORTED].filter((file) => {
      const source = sources.find((candidate) => candidate.file === file);
      return !(source && HAND_DOM.test(source.text));
    });
    expect(stale).toEqual([]);
  });
});
