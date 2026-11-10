import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES = ['packages/engine/src', 'packages/presentation/src'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SETTING_WORD = /zombie|amalgam/gi;
// Content ids are the product's, so a line that names one by id keeps its word; see
// `docs/decisions/0009-content-defined-products.md`, "Vocabulary".
const CONTENT_ID_LINE = /'debug\.spawn-actor\.[a-z_]+'/;
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

/** Each `path:line: word` where engine or presentation source uses the product's setting vocabulary. */
const settingWordHits = () =>
  SOURCES.flatMap((source) => walk(join(ROOT, source))).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        CONTENT_ID_LINE.test(line)
          ? []
          : [...line.replace(PRODUCT_DOC_CUE, '').matchAll(SETTING_WORD)].map(
              ([word]) => `${relative(ROOT, file)}:${index + 1}: ${word}`,
            ),
      ),
  );

test('engine and presentation sources name no product setting words', () => {
  assert.deepEqual(settingWordHits(), []);
});
