import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PROJECT.md, Core: src/core has no DOM, three.js or lit-html, so it runs in tests, workers and
// Node. Storage or feature detection that needs the browser belongs in src/game or a worker.
const CORE = 'src/core';
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const BANNED_MODULE = /^(?:three|lit-html)(?:\/|$)/;
const BANNED_GLOBALS = new Set(['document', 'window', 'navigator', 'localStorage', 'requestAnimationFrame']);

// Static `from '…'`, side-effect `import '…'`, dynamic `import('…')` and `require('…')`.
const SPECIFIER = /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)(['"`])([^'"`\n]+)\1/g;

const coreFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return coreFiles(path);
    }
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });

// Comments and string or template literals, matched in source order so a quote inside a comment
// (or `//` inside a string) doesn't confuse the scan. A `${…}` inside a template is blanked too.
const NOISE = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`/g;
const KEY_PREFIX = /[{,]\s*$/;
const KEY_SUFFIX = /^\s*:/;
const NOT_NEWLINE = /[^\n]/g;
const IDENTIFIER = /(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$])/g;

// Blank out comments and the insides of literals, keeping line breaks, so what is left is code.
const stripNoise = (text: string): string =>
  text.replace(NOISE, (noise) => {
    const quote = noise[0] ?? '';
    return quote === '"' || quote === "'" || quote === '`'
      ? quote + noise.slice(1, -1).replace(NOT_NEWLINE, ' ') + quote
      : noise.replace(NOT_NEWLINE, ' ');
  });

// A global use is the bare identifier: not a property (`x.window`) and not an object key
// (`{ window: 1 }`).
const isObjectKey = (code: string, start: number, end: number): boolean =>
  KEY_PREFIX.test(code.slice(0, start)) && KEY_SUFFIX.test(code.slice(end));

const globalUses = (code: string): { name: string; line: number }[] =>
  [...code.matchAll(IDENTIFIER)].flatMap((match) => {
    const name = match[1] ?? '';
    const start = match.index ?? 0;
    if (!BANNED_GLOBALS.has(name) || isObjectKey(code, start, start + name.length)) {
      return [];
    }
    return [{ name, line: code.slice(0, start).split('\n').length }];
  });

describe('src/core is pure (PROJECT.md, Core)', () => {
  const files = coreFiles(CORE);

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('imports neither three nor lit-html', () => {
    const offenders = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
        .map((match) => match[2] ?? '')
        .filter((specifier) => BANNED_MODULE.test(specifier))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('uses no DOM or browser globals', () => {
    const offenders = files.flatMap((file) =>
      globalUses(stripNoise(readFileSync(file, 'utf8'))).map((use) => `${file}:${use.line} ${use.name}`),
    );
    expect(offenders).toEqual([]);
  });

  it('matches identifiers, not comments, strings or properties', () => {
    const quiet = [
      '// window here',
      '/* document',
      ' navigator */ const s = "localStorage"; const t = `requestAnimationFrame`;',
      'const o = { window: 1 }; o.document;',
    ].join('\n');
    expect(globalUses(stripNoise(quiet))).toEqual([]);
    const loud = 'const w = window;\nlocalStorage.getItem("x");\ntypeof document === "undefined";';
    expect(globalUses(stripNoise(loud)).map((use) => use.name)).toEqual(['window', 'localStorage', 'document']);
    expect('import * as T from "three";'.match(SPECIFIER)).not.toBeNull();
  });
});
