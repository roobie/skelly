import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileJsonnetSources, formatJson, selectWithin } from './compile.mjs';

const NO_SOURCES = /No Jsonnet sources/;
const CANNOT_CHECK = /cannot be checked/;

test('a partial compile selects only sources inside its directories and refuses an empty selection', () => {
  const files = [
    { source: 'alpha/one.jsonnet', output: 'alpha/one.json' },
    { source: 'alpha/deep/two.jsonnet', output: 'alpha/deep/two.json' },
    { source: 'alphabet/three.jsonnet', output: 'alphabet/three.json' },
    { source: 'beta/four.jsonnet', output: 'beta/four.json' },
  ];
  assert.deepEqual(
    selectWithin(files, ['alpha', 'beta']).map(({ source }) => source),
    ['alpha/one.jsonnet', 'alpha/deep/two.jsonnet', 'beta/four.jsonnet'],
  );
  assert.throws(() => selectWithin(files, ['gamma']), NO_SOURCES);
});

test('a partial compile cannot be checked against the full-set manifest', () => {
  assert.throws(() => compileJsonnetSources({ within: ['alpha'], check: true }), CANNOT_CHECK);
});

test('formatter preserves a generated document larger than the subprocess default output buffer', () => {
  const document = { rows: Array.from({ length: 16_384 }, () => 'fixture'.repeat(16)) };
  const source = JSON.stringify(document);
  const formatted = formatJson(source, 'packages/deadvox/src/content/base/fixture.json');
  assert.deepEqual(JSON.parse(formatted), document);
});
