import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES = ['packages/engine/src', 'packages/presentation/src'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SETTING_WORD = /zombie|amalgam/gi;
// Content ids and the names they spawn are the product's, so a debug spawn row keeps its words; see
// `docs/decisions/0009-content-defined-products.md`, "Vocabulary".
const CONTENT_SPAWN_ROW = /debugRow\('debug\.spawn-actor\.[a-z_]+', 'Spawn [a-z ]+'\)/g;
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
      [...line.replace(CONTENT_SPAWN_ROW, '').replace(PRODUCT_DOC_CUE, '').matchAll(SETTING_WORD)].map(
        ([word]) => `${path}:${index + 1}: ${word}`,
      ),
    );

/** Each `path:line: word` where engine or presentation source uses the product's setting vocabulary. */
const settingWordHits = () =>
  SOURCES.flatMap((source) => walk(join(ROOT, source))).flatMap((file) =>
    textWordHits(relative(ROOT, file), readFileSync(file, 'utf8')),
  );

test('engine and presentation sources name no product setting words', () => {
  assert.deepEqual(settingWordHits(), []);
});

test('reports a setting word in plain source', () => {
  assert.deepEqual(textWordHits('probe', '// A zombie body is shared engine vocabulary.'), ['probe:1: zombie']);
});

test('a debug spawn id exempts no other text on its line', () => {
  assert.deepEqual(
    textWordHits(
      'probe',
      "const zombieState = debugRow('debug.spawn-actor.runner', 'Spawn runner'); // amalgam storage\n" +
        "const amalgamId = 'debug.spawn-actor.amalgam';",
    ),
    ['probe:1: zombie', 'probe:1: amalgam', 'probe:2: amalgam', 'probe:2: amalgam'],
  );
});
