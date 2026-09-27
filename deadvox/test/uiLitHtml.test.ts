import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR 0001: every screen in src/ui is drawn with lit-html. These files still build DOM by hand
// and are the port's remaining work; remove each one as it moves over. The list only shrinks.
const NOT_YET_PORTED = new Set(['inventoryScreen.ts']);

// Hand-built DOM: creating, attaching or rewriting nodes instead of rendering a template.
const HAND_DOM =
  /\b(createElement|replaceChildren|appendChild|insertAdjacent\w*)\b|\.append\(|\.(innerHTML|textContent)\s*=/;

const UI = 'src/ui';
const sources = readdirSync(UI)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ file: f, text: readFileSync(join(UI, f), 'utf8') }));

describe('src/ui draws with lit-html (ADR 0001)', () => {
  it('has no hand-built DOM outside the not-yet-ported files', () => {
    const offenders = sources.filter((s) => !NOT_YET_PORTED.has(s.file) && HAND_DOM.test(s.text)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('lists only files that exist and still build DOM by hand', () => {
    // A ported file left on the list would let hand-built DOM back in unnoticed.
    const stale = [...NOT_YET_PORTED].filter((f) => {
      const source = sources.find((s) => s.file === f);
      return !(source && HAND_DOM.test(source.text));
    });
    expect(stale).toEqual([]);
  });
});
