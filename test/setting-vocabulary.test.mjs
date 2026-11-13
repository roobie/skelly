import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES = ['packages/engine/src', 'packages/presentation/src'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);
const SETTING_WORD = /zombie|amalgam|shambler/gi;
// A cue into a product doc quotes the product's own path and heading.
const PRODUCT_DOC_CUE = /`packages\/deadvox\/[^`]*`(?:, "[^"]*")?/g;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return CODE_EXTENSIONS.has(extname(path)) ? [path] : [];
  });

/** Each `path:line: word` where one source text uses the product's setting vocabulary. */
const textWordHits = (path, text) =>
  text
    .split('\n')
    .flatMap((line, index) =>
      [...line.replace(PRODUCT_DOC_CUE, '').matchAll(SETTING_WORD)].map(([word]) => `${path}:${index + 1}: ${word}`),
    );

/** Each `path:line: word` where engine or presentation source uses the product's setting vocabulary. */
const settingWordHits = () =>
  SOURCES.flatMap((source) => walk(join(ROOT, source))).flatMap((file) =>
    textWordHits(relative(ROOT, file), readFileSync(file, 'utf8')),
  );

test('engine and presentation sources name no product setting words', () => {
  assert.deepEqual(settingWordHits(), []);
});

test('reports each setting word in plain source', () => {
  assert.deepEqual(textWordHits('probe', '// A zombie, an amalgam and a shambler.'), [
    'probe:1: zombie',
    'probe:1: amalgam',
    'probe:1: shambler',
  ]);
});

test('a content id in a debug spawn row is a hit', () => {
  assert.deepEqual(textWordHits('probe', "debugRow('debug.spawn-actor.amalgam', 'Spawn runner');"), [
    'probe:1: amalgam',
  ]);
});
