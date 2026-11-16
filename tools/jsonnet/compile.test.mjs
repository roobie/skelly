import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compileJsonnetSources, compileOutputs, formatJson, selectWithin } from './compile.mjs';

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

test('a partial compile cannot be checked against the full-set manifest', async () => {
  await assert.rejects(compileJsonnetSources({ within: ['alpha'], check: true }), CANNOT_CHECK);
});

test('formatter preserves a generated document larger than the subprocess default output buffer', () => {
  const document = { rows: Array.from({ length: 16_384 }, () => 'fixture'.repeat(16)) };
  const source = JSON.stringify(document);
  const formatted = formatJson(source, 'packages/deadvox/mods/fixture.pack/fixture.json');
  assert.deepEqual(JSON.parse(formatted), document);
});

const FILES = [
  { source: 'content/main.jsonnet', output: 'content/main.json' },
  { source: 'content/other.jsonnet', output: 'content/other.json' },
];

/** A throwaway repository root: `main` reaches `deep.libsonnet` only through `shared.libsonnet`; `other` does not. */
function withFixture(body) {
  const root = mkdtempSync(join(tmpdir(), 'jsonnet-cache-test-'));
  const cacheDirectory = join(root, 'cache');
  mkdirSync(join(root, 'content/lib'), { recursive: true });
  writeFileSync(join(root, 'content/lib/deep.libsonnet'), '{ value: 1 }\n');
  writeFileSync(join(root, 'content/lib/shared.libsonnet'), "{ deep: import 'deep.libsonnet' }\n");
  writeFileSync(join(root, 'content/main.jsonnet'), "{ value: (import 'lib/shared.libsonnet').deep.value }\n");
  writeFileSync(join(root, 'content/other.jsonnet'), '{ other: true }\n');
  const compile = () => compileOutputs(FILES, { repositoryRoot: root, cacheDirectory });
  const read = (output) => JSON.parse(readFileSync(join(root, output), 'utf8'));
  return Promise.resolve(body({ root, compile, read })).finally(() => rmSync(root, { recursive: true, force: true }));
}

const reusedFlags = (results) => results.map(({ reused }) => reused);

test('a second compile with unchanged inputs reuses every output', () =>
  withFixture(async ({ compile, read }) => {
    assert.deepEqual(reusedFlags(await compile()), [false, false]);
    assert.deepEqual(reusedFlags(await compile()), [true, true]);
    assert.deepEqual(read('content/main.json'), { value: 1 });
  }));

test('editing a transitively imported libsonnet recompiles only the outputs that import it', () =>
  withFixture(async ({ root, compile, read }) => {
    await compile();
    writeFileSync(join(root, 'content/lib/deep.libsonnet'), '{ value: 2 }\n');
    assert.deepEqual(reusedFlags(await compile()), [false, true]);
    assert.deepEqual(read('content/main.json'), { value: 2 });
  }));

test('an output changed on disk since its compile is rewritten even when its inputs are unchanged', () =>
  withFixture(async ({ root, compile, read }) => {
    await compile();
    writeFileSync(join(root, 'content/main.json'), '{ "value": 99 }\n');
    assert.deepEqual(reusedFlags(await compile()), [false, true]);
    assert.deepEqual(read('content/main.json'), { value: 1 });
  }));
