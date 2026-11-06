import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compileJsonnetSources, formatJson, selectWithin } from './compile.mjs';
import { compileJsonnetFile } from './index.mjs';

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

test('a partial compile into another folder leaves the tracked output untouched', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'jsonnet-out-'));
  const tracked = 'packages/thing-core/src/materials.json';
  const before = readFileSync(tracked);
  try {
    const [target] = compileJsonnetSources({ within: ['packages/thing-core/src'], outDir });
    assert.equal(target, join(outDir, tracked));
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), JSON.parse(before));
    assert.deepEqual(readFileSync(tracked), before);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('an overlay folder wins over the repository for a root-relative import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsonnet-overlay-'));
  try {
    for (const [root, value] of [
      ['repo', 'tracked'],
      ['overlay', 'overlaid'],
    ]) {
      mkdirSync(join(dir, root, 'lib'), { recursive: true });
      writeFileSync(join(dir, root, 'lib/index.libsonnet'), `'${value}'\n`);
    }
    writeFileSync(join(dir, 'repo/lib/main.jsonnet'), "import 'lib/index.libsonnet'\n");
    const repo = join(dir, 'repo');
    assert.equal(JSON.parse(compileJsonnetFile('lib/main.jsonnet', repo)), 'tracked');
    assert.equal(
      JSON.parse(compileJsonnetFile('lib/main.jsonnet', repo, { overlay: join(dir, 'overlay') })),
      'overlaid',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a cached compile follows an edited import and an import newly shadowed beside its importer', () => {
  const repo = mkdtempSync(join(tmpdir(), 'jsonnet-cache-'));
  try {
    mkdirSync(join(repo, 'lib'), { recursive: true });
    mkdirSync(join(repo, 'app'), { recursive: true });
    writeFileSync(join(repo, 'app/main.jsonnet'), "import 'lib/value.libsonnet'\n");
    writeFileSync(join(repo, 'lib/value.libsonnet'), "'first'\n");
    assert.equal(JSON.parse(compileJsonnetFile('app/main.jsonnet', repo)), 'first');
    writeFileSync(join(repo, 'lib/value.libsonnet'), "'edited'\n");
    assert.equal(JSON.parse(compileJsonnetFile('app/main.jsonnet', repo)), 'edited');
    mkdirSync(join(repo, 'app/lib'), { recursive: true });
    writeFileSync(join(repo, 'app/lib/value.libsonnet'), "'beside'\n");
    assert.equal(JSON.parse(compileJsonnetFile('app/main.jsonnet', repo)), 'beside');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('formatter preserves a generated document larger than the subprocess default output buffer', () => {
  const document = { rows: Array.from({ length: 16_384 }, () => 'fixture'.repeat(16)) };
  const source = JSON.stringify(document);
  const formatted = formatJson(source, 'packages/deadvox/src/content/base/fixture.json');
  assert.deepEqual(JSON.parse(formatted), document);
});
